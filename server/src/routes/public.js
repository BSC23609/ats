import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { one, q, tx } from '../db.js';
import { extractText, summariseResume } from '../services/resume.js';
import { putFile } from '../services/storage.js';
import { safeName } from '../services/graph.js';

const r = Router();

const ALLOWED = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

// Held in memory, then handed to the storage driver — which may be a disk or a bucket.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Resume must be a PDF, Word file or plain text, under 8 MB.')),
});

/** Companies + their open roles, for the careers page. */
r.get('/openings', async (_req, res) => {
  const { rows } = await q(
    `SELECT j.id, j.title, j.department, j.location, j.employment_type, j.min_experience, j.description,
            c.id AS company_id, c.code AS company_code, c.name AS company_name, c.colour
       FROM jobs j JOIN companies c ON c.id = j.company_id
      WHERE j.status = 'OPEN' AND c.active
      ORDER BY c.code, j.title`
  );
  res.json(rows);
});

/** Stage 1 — candidate applies from the careers page. */
r.post('/apply', upload.single('resume'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.full_name || !b.email || !b.phone || !b.company_id || !b.position_applied)
      return res.status(400).json({ error: 'Name, email, phone, company and position are required.' });

    const company = await one('SELECT * FROM companies WHERE id=$1 AND active', [b.company_id]);
    if (!company) return res.status(400).json({ error: 'That company is not accepting applications.' });

    // Reserve the id first so the resume can be filed under its reference code, then store the
    // file before the row exists — a failed upload should never leave a half-made application.
    const seq = await one(`SELECT nextval('applications_id_seq')::int AS n`);
    const yymm = new Date().toISOString().slice(2, 7).replace('-', '');
    const ref = `${company.code}-${yymm}-${String(seq.n).padStart(4, '0')}`;

    let resumeKey = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.pdf';
      resumeKey = `Resumes/${company.code}/${safeName(`${ref} - ${b.full_name}`)}${ext}`;
      await putFile(resumeKey, req.file.buffer, req.file.mimetype);
    }

    const app = await tx(async (client) => {
      const id = seq.n;
      const { rows } = await client.query(
        `INSERT INTO applications
           (id, ref_code, company_id, job_id, full_name, email, phone, position_applied, current_location,
            total_experience, current_ctc, expected_ctc, notice_period_days, source,
            resume_path, resume_filename, ai_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'PENDING')
         RETURNING *`,
        [
          id,
          ref,
          company.id,
          b.job_id || null,
          b.full_name.trim(),
          b.email.trim().toLowerCase(),
          b.phone.trim(),
          b.position_applied.trim(),
          b.current_location || null,
          b.total_experience || 0,
          b.current_ctc || null,
          b.expected_ctc || null,
          b.notice_period_days || null,
          resumeKey,
          req.file?.originalname || null,
        ]
      );
      const created = rows[0];
      await client.query(
        `INSERT INTO status_history (application_id, from_status, to_status, note)
         VALUES ($1, NULL, 'APPLIED', 'Applied via careers page')`,
        [created.id]
      );
      return created;
    });

    res.status(201).json({ ref_code: app.ref_code, message: 'Application received.' });

    // Read the resume and write the overview in the background — the candidate is not kept waiting.
    if (req.file) {
      (async () => {
        try {
          const text = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
          await q('UPDATE applications SET resume_text=$1 WHERE id=$2', [text, app.id]);

          const job = app.job_id ? await one('SELECT jd_text FROM jobs WHERE id=$1', [app.job_id]) : null;
          await summariseResume(app.id, {
            resumeText: text,
            position: app.position_applied,
            company: company.name,
            experience: app.total_experience,
            jobDescription: job?.jd_text,
          });
        } catch (err) {
          console.error('resume processing failed:', err.message);
          await q(`UPDATE applications SET ai_status='FAILED' WHERE id=$1`, [app.id]);
        }
      })();
    } else {
      await q(`UPDATE applications SET ai_status='SKIPPED' WHERE id=$1`, [app.id]);
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Stage 2 — the full form, opened by the candidate on interview day via their link. */
r.get('/form/:token', async (req, res) => {
  const app = await one(
    `SELECT a.id, a.ref_code, a.full_name, a.email, a.phone, a.position_applied,
            a.stage2_submitted_at, a.details, c.name AS company_name, c.code AS company_code, c.colour
       FROM applications a JOIN companies c ON c.id = a.company_id
      WHERE a.stage2_token = $1`,
    [req.params.token]
  );
  if (!app) return res.status(404).json({ error: 'This form link is not valid.' });
  res.json(app);
});

r.post('/form/:token', async (req, res) => {
  const app = await one('SELECT id, stage2_submitted_at FROM applications WHERE stage2_token=$1', [
    req.params.token,
  ]);
  if (!app) return res.status(404).json({ error: 'This form link is not valid.' });
  if (app.stage2_submitted_at)
    return res.status(409).json({ error: 'This form was already submitted. Ask HR to reopen it.' });

  const details = req.body?.details;
  if (!details || typeof details !== 'object')
    return res.status(400).json({ error: 'The form came through empty. Fill it in and submit again.' });

  await q(
    `UPDATE applications SET details=$1, stage2_submitted_at=now(), updated_at=now() WHERE id=$2`,
    [details, app.id]
  );
  await q(
    `INSERT INTO status_history (application_id, from_status, to_status, note)
     SELECT id, status, status, 'Full application form submitted by candidate' FROM applications WHERE id=$1`,
    [app.id]
  );
  res.json({ ok: true });
});

export default r;
