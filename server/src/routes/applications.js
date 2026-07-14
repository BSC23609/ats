import { Router } from 'express';
import { one, q, tx } from '../db.js';
import { requireAuth, companyFilter, assertCompanyAccess } from '../auth.js';
import multer from 'multer';
import { summariseResume } from '../services/resume.js';
import { putFile, getFile } from '../services/storage.js';
import { safeName } from '../services/graph.js';
import { syncWorkbook } from '../services/workbook.js';

const r = Router();
r.use(requireAuth);

const PIPELINE = ['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'OFFERED', 'JOINED'];
const CLOSED = ['REJECTED', 'ON_HOLD', 'WITHDRAWN'];

/** Board counts for the dashboard. */
r.get('/stats', async (req, res) => {
  const company = companyFilter(req);
  const { rows } = await q(
    `SELECT c.code AS company_code, c.colour, a.status, count(*)::int AS n
       FROM applications a JOIN companies c ON c.id = a.company_id
      WHERE ($1::int[] IS NULL OR a.company_id = ANY($1))
      GROUP BY c.code, c.colour, a.status`,
    [company]
  );
  res.json({ pipeline: PIPELINE, closed: CLOSED, rows });
});

/** List with filters: ?status=&company=&job=&q= */
r.get('/', async (req, res) => {
  const company = companyFilter(req);
  const { rows } = await q(
    `SELECT a.id, a.ref_code, a.full_name, a.email, a.phone, a.position_applied, a.status,
            a.total_experience, a.expected_ctc, a.notice_period_days, a.created_at, a.interview_at,
            a.stage2_submitted_at, a.ai_status, a.resume_filename,
            a.ai_summary->>'headline'      AS ai_headline,
            a.ai_summary->>'fit_for_role'  AS ai_fit,
            (a.ai_summary->>'score')::numeric AS ai_score,
            c.code AS company_code, c.colour, j.title AS job_title,
            u.name AS assigned_to_name
       FROM applications a
       JOIN companies c ON c.id = a.company_id
       LEFT JOIN jobs j ON j.id = a.job_id
       LEFT JOIN users u ON u.id = a.assigned_to
      WHERE ($1::int[] IS NULL OR a.company_id = ANY($1))
        AND ($2::text IS NULL OR a.status = $2)
        AND ($3::int IS NULL OR a.job_id = $3)
        AND ($4::text IS NULL OR a.full_name ILIKE '%'||$4||'%' OR a.email ILIKE '%'||$4||'%'
             OR a.ref_code ILIKE '%'||$4||'%' OR a.position_applied ILIKE '%'||$4||'%')
      ORDER BY
        CASE WHEN $5::text = 'score' THEN (a.ai_summary->>'score')::numeric END DESC NULLS LAST,
        a.created_at DESC
      LIMIT 300`,
    [company, req.query.status || null, req.query.job || null, req.query.q || null, req.query.sort || null]
  );
  res.json(rows);
});

r.get('/:id', async (req, res) => {
  const app = await one(
    `SELECT a.*, c.code AS company_code, c.name AS company_name, c.colour,
            j.title AS job_title, u.name AS assigned_to_name
       FROM applications a
       JOIN companies c ON c.id = a.company_id
       LEFT JOIN jobs j ON j.id = a.job_id
       LEFT JOIN users u ON u.id = a.assigned_to
      WHERE a.id = $1`,
    [req.params.id]
  );
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (!assertCompanyAccess(req, res, app.company_id)) return;

  delete app.resume_text; // large; fetched separately if ever needed
  const { rows: history } = await q(
    `SELECT h.*, u.name AS changed_by_name
       FROM status_history h LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.application_id = $1 ORDER BY h.created_at DESC`,
    [req.params.id]
  );
  app.form_link = `${process.env.PUBLIC_WEB_URL || ''}/form/${app.stage2_token}`;
  res.json({ ...app, history });
});

r.get('/:id/resume', async (req, res, next) => {
  try {
    const app = await one('SELECT company_id, resume_path, resume_filename FROM applications WHERE id=$1', [
      req.params.id,
    ]);
    if (!app?.resume_path) return res.status(404).json({ error: 'No resume on file for this candidate.' });
    if (!assertCompanyAccess(req, res, app.company_id)) return;

    const buffer = await getFile(app.resume_path);
    res.attachment(app.resume_filename);
    res.send(buffer);
  } catch {
    res.status(404).json({ error: 'That resume could not be retrieved from storage.' });
  }
});

/** Re-run the AI overview (e.g. after adding an API key, or a failed read). */
r.post('/:id/reanalyse', async (req, res) => {
  const app = await one(
    `SELECT a.*, c.name AS company_name FROM applications a JOIN companies c ON c.id=a.company_id WHERE a.id=$1`,
    [req.params.id]
  );
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (!assertCompanyAccess(req, res, app.company_id)) return;
  if (!app.resume_text) return res.status(400).json({ error: 'No resume text to analyse.' });

  const job = app.job_id ? await one('SELECT jd_text FROM jobs WHERE id=$1', [app.job_id]) : null;

  await q(`UPDATE applications SET ai_status='PENDING' WHERE id=$1`, [app.id]);
  res.json({ ok: true });
  summariseResume(app.id, {
    resumeText: app.resume_text,
    position: app.position_applied,
    company: app.company_name,
    experience: app.total_experience,
    jobDescription: job?.jd_text,
  });
});

/** Move a candidate along the pipeline. JOINED creates the employee record. */
r.post('/:id/status', async (req, res) => {
  const { status, note, interview_at, offered_ctc, emp_code, date_of_joining, designation, department } = req.body;
  if (![...PIPELINE, ...CLOSED].includes(status))
    return res.status(400).json({ error: 'That is not a valid status.' });

  const app = await one('SELECT * FROM applications WHERE id=$1', [req.params.id]);
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (!assertCompanyAccess(req, res, app.company_id)) return;

  if (status === 'JOINED' && !app.stage2_submitted_at)
    return res.status(400).json({
      error: 'The candidate has not submitted the full application form yet. Send them the form link first.',
    });

  const result = await tx(async (client) => {
    await client.query(
      `UPDATE applications
          SET status=$1, status_note=$2,
              interview_at = COALESCE($3, interview_at),
              offered_ctc  = COALESCE($4, offered_ctc),
              updated_at = now()
        WHERE id=$5`,
      [status, note || null, interview_at || null, offered_ctc || null, app.id]
    );
    await client.query(
      `INSERT INTO status_history (application_id, from_status, to_status, note, changed_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [app.id, app.status, status, note || null, req.user.id]
    );

    if (status !== 'JOINED') return null;

    const existing = await client.query('SELECT id FROM employees WHERE application_id=$1', [app.id]);
    if (existing.rows.length) return existing.rows[0];

    const d = app.details || {};
    const code =
      emp_code ||
      `${(await client.query('SELECT code FROM companies WHERE id=$1', [app.company_id])).rows[0].code}-E${String(
        app.id
      ).padStart(4, '0')}`;

    const { rows } = await client.query(
      `INSERT INTO employees
         (emp_code, company_id, application_id, full_name, email, phone, designation, department,
          date_of_joining, annual_ctc, pan, aadhaar, blood_group, date_of_birth, emergency_contact, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        code,
        app.company_id,
        app.id,
        app.full_name,
        app.email,
        app.phone,
        designation || app.position_applied,
        department || null,
        date_of_joining || new Date(),
        offered_ctc || app.offered_ctc || null,
        d.pan || null,
        d.aadhaar || null,
        d.blood_group || null,
        d.date_of_birth || null,
        d.emergency_contacts?.[0]
          ? `${d.emergency_contacts[0].name} (${d.emergency_contacts[0].relationship}) ${d.emergency_contacts[0].contact}`
          : null,
        d,
      ]
    );
    return rows[0];
  });

  res.json({ ok: true, employee: result });

  // A new employee record means the master workbook is out of date. Fire-and-forget:
  // OneDrive being slow must not make the HR admin's click fail.
  if (status === 'JOINED') syncWorkbook();
});

/* Offer letters are written, signed and SENT outside this system — by email, by hand, however HR
   prefers. What is stored here is the signed copy, for the record: it files itself into OneDrive
   and its terms feed the employee record when the candidate joins. */
const offerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    file.mimetype === 'application/pdf'
      ? cb(null, true)
      : cb(new Error('The offer letter must be a PDF, under 8 MB.')),
});

r.post('/:id/offer-letter', offerUpload.single('offer_letter'), async (req, res, next) => {
  try {
    const app = await one('SELECT * FROM applications WHERE id=$1', [req.params.id]);
    if (!app) return res.status(404).json({ error: 'Application not found.' });
    if (!assertCompanyAccess(req, res, app.company_id)) return;
    if (!req.file && !app.offer_letter_path)
      return res.status(400).json({ error: 'Attach the offer letter PDF.' });

    let key = app.offer_letter_path;
    if (req.file) {
      const co = await one('SELECT code FROM companies WHERE id=$1', [app.company_id]);
      key = `Offer Letters/${co.code}/${safeName(`${app.ref_code} - ${app.full_name}`)}.pdf`;
      await putFile(key, req.file.buffer, 'application/pdf');
    }

    const updated = await one(
      `UPDATE applications
          SET offer_letter_path  = $1,
              offer_designation  = COALESCE($2, offer_designation, position_applied),
              offer_joining_date = COALESCE($3, offer_joining_date),
              offered_ctc        = COALESCE($4, offered_ctc),
              updated_at = now()
        WHERE id=$5 RETURNING *`,
      [
        key,
        req.body.offer_designation || null,
        req.body.offer_joining_date || null,
        req.body.offered_ctc || null,
        app.id,
      ]
    );

    // Recording the letter is what moves the candidate to Offered — no email is sent from here.
    if (req.file && app.status !== 'OFFERED') {
      await tx(async (client) => {
        await client.query(
          `UPDATE applications SET status='OFFERED', updated_at=now() WHERE id=$1`, [app.id]
        );
        await client.query(
          `INSERT INTO status_history (application_id, from_status, to_status, note, changed_by)
           VALUES ($1,$2,'OFFERED','Signed offer letter recorded',$3)`,
          [app.id, app.status, req.user.id]
        );
      });
    }

    res.json({ ok: true, uploaded: Boolean(req.file), offered_ctc: updated.offered_ctc });
  } catch (err) {
    next(err);
  }
});

/** Download the letter that was uploaded. */
r.get('/:id/offer-letter', async (req, res) => {
  const app = await one('SELECT company_id, offer_letter_path, full_name FROM applications WHERE id=$1', [
    req.params.id,
  ]);
  if (!app?.offer_letter_path) return res.status(404).json({ error: 'No offer letter has been uploaded yet.' });
  if (!assertCompanyAccess(req, res, app.company_id)) return;

  try {
    const buffer = await getFile(app.offer_letter_path);
    res.attachment(`Offer letter — ${app.full_name}.pdf`);
    res.send(buffer);
  } catch {
    res.status(404).json({ error: 'That offer letter could not be retrieved from storage.' });
  }
});

r.post('/:id/assign', async (req, res) => {
  const app = await one('SELECT company_id FROM applications WHERE id=$1', [req.params.id]);
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (!assertCompanyAccess(req, res, app.company_id)) return;
  await q('UPDATE applications SET assigned_to=$1, updated_at=now() WHERE id=$2', [
    req.body.user_id || null,
    req.params.id,
  ]);
  res.json({ ok: true });
});

/** Let HR reopen a submitted form (candidate made a mistake, or details changed). */
r.post('/:id/reopen-form', async (req, res) => {
  const app = await one('SELECT company_id FROM applications WHERE id=$1', [req.params.id]);
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (!assertCompanyAccess(req, res, app.company_id)) return;
  await q('UPDATE applications SET stage2_submitted_at=NULL WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

export default r;
