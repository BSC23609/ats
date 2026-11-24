import { Router } from 'express';
import { one, q, tx } from '../db.js';
import { requireAuth, companyFilter, assertCompanyAccess } from '../auth.js';
import multer from 'multer';
import { summariseResume, extractText, rescoreFailed } from '../services/resume.js';
import { putFile, getFile } from '../services/storage.js';
import { safeName } from '../services/graph.js';
import { toText, describeRange } from '../services/html.js';
import { syncWorkbook } from '../services/workbook.js';
import {
  notifyHrOfApplication, emailAiInterview, emailJoiningForm, fileAndEmailApplicationForm,
  whatsappFirstInterview, notifyApplicantSelected, whatsappJoined,
} from '../services/notify.js';
import { askRecruiter } from '../services/recruiter.js';

const r = Router();
r.use(requireAuth);

const PIPELINE = ['APPLIED', 'ACCEPTED', 'INTERVIEW_SCORE', 'OFFICE_INTERVIEW', 'SELECTED', 'OFFERED', 'JOINED'];
const CLOSED = ['REJECTED', 'WITHDRAWN', 'ON_HOLD'];

// Resume upload for an HR-entered candidate (optional).
const resumeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

/** HR adds a candidate by hand (someone who applied off-portal). Mirrors the careers apply, but
 *  authenticated, lets HR set the starting stage, and does not email anyone on creation. */
r.post('/', resumeUpload.single('resume'), async (req, res) => {
  try {
    const b = req.body;
    const companyId = Number(b.company_id);
    if (!companyId || !b.full_name || !b.email || !b.phone || !b.position_applied)
      return res.status(400).json({ error: 'Name, email, phone, company and role are required.' });
    if (!assertCompanyAccess(req, res, companyId)) return;

    const company = await one('SELECT * FROM companies WHERE id=$1 AND active', [companyId]);
    if (!company) return res.status(400).json({ error: 'That company is not available.' });

    const status = b.status && [...PIPELINE, ...CLOSED].includes(b.status) ? b.status : 'APPLIED';

    const email = b.email.trim().toLowerCase();
    const jobId = b.job_id && !Number.isNaN(Number(b.job_id)) ? Number(b.job_id) : null;
    const dup = await one(
      `SELECT ref_code FROM applications
         WHERE lower(email) = $1
           AND ($2::int IS NULL OR job_id = $2)
           AND ($2::int IS NOT NULL OR (company_id = $3 AND lower(position_applied) = lower($4)))
         LIMIT 1`,
      [email, jobId, companyId, b.position_applied.trim()]
    );
    if (dup) return res.status(409).json({ error: `A candidate with this email is already in the pipeline for this role (${dup.ref_code}).` });

    const seq = await one(`SELECT nextval('applications_id_seq')::int AS n`);
    const yymm = new Date().toISOString().slice(2, 7).replace('-', '');
    const ref = `${company.code}-${yymm}-${String(seq.n).padStart(4, '0')}`;

    let resumeKey = null;
    if (req.file) {
      const m = (req.file.originalname || '').match(/\.[a-z0-9]+$/i);
      const ext = m ? m[0] : '.pdf';
      // Filed directly in the role folder: {COMPANY}/{Role}/{Name}_{AppID}.ext
      resumeKey = `${company.code}/${safeName(b.position_applied)}/${safeName(b.full_name)}_${seq.n}${ext}`;
      await putFile(resumeKey, req.file.buffer, req.file.mimetype);
    }

    const app = await tx(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO applications
           (id, ref_code, company_id, job_id, full_name, email, phone, position_applied,
            current_location, area, city, pincode,
            total_experience, current_ctc, expected_ctc, notice_period_days, source,
            resume_path, resume_filename, ai_status, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING *`,
        [
          seq.n, ref, companyId, jobId, b.full_name.trim(), email, b.phone.trim(), b.position_applied.trim(),
          [b.area, b.city, b.pincode].map((x) => (x || '').trim()).filter(Boolean).join(', ') || null,
          (b.area || '').trim() || null, (b.city || '').trim() || null, (b.pincode || '').trim() || null,
          b.total_experience || 0, b.current_ctc || null, b.expected_ctc || null, b.notice_period_days || null,
          'manual', resumeKey, req.file?.originalname || null, req.file ? 'NOT_SCORED' : 'SKIPPED', status,
        ]
      );
      const created = rows[0];
      await client.query(
        `INSERT INTO status_history (application_id, from_status, to_status, note, changed_by)
         VALUES ($1, NULL, $2, 'Added by HR', $3)`,
        [created.id, status, req.user.id]
      );
      return created;
    });

    res.status(201).json({ id: app.id, ref_code: app.ref_code });
    // Scoring is on-demand — HR scores from the pipeline when they choose to.
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

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

/**
 * AI recruiter — ask a question across the candidates currently in view. The filters come in the
 * query string (?company=&status=&job=&q=) exactly like the list, so company-access rules apply;
 * the question is in the body. It reads a compact summary of each candidate and advises only.
 */
r.post('/recruiter', async (req, res) => {
  const company = companyFilter(req);
  const question = (req.body?.question || '').toString().slice(0, 1000);

  const { rows } = await q(
    `SELECT a.ref_code, a.full_name, a.position_applied, a.status,
            a.total_experience, a.expected_ctc, a.notice_period_days,
            COALESCE(NULLIF(a.current_location, ''),
                     NULLIF(concat_ws(', ', a.area, a.city, a.pincode), '')) AS location,
            a.ai_summary->>'headline'        AS ai_headline,
            (a.ai_summary->>'score')::numeric AS ai_score,
            j.title AS job_title
       FROM applications a
       JOIN companies c ON c.id = a.company_id
       LEFT JOIN jobs j ON j.id = a.job_id
      WHERE ($1::int[] IS NULL OR a.company_id = ANY($1))
        AND ($2::text IS NULL OR a.status = $2)
        AND ($3::int IS NULL OR a.job_id = $3)
        AND ($4::text IS NULL OR a.full_name ILIKE '%'||$4||'%' OR a.email ILIKE '%'||$4||'%'
             OR a.ref_code ILIKE '%'||$4||'%' OR a.position_applied ILIKE '%'||$4||'%')
      ORDER BY (a.ai_summary->>'score')::numeric DESC NULLS LAST, a.created_at DESC
      LIMIT 150`,
    [company, req.query.status || null, req.query.job || null, req.query.q || null]
  );

  const result = await askRecruiter(question, rows);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ answer: result.answer, considered: rows.length });
});

/** List with filters: ?status=&company=&job=&q= */
r.get('/', async (req, res) => {
  const company = companyFilter(req);
  const { rows } = await q(
    `SELECT a.id, a.ref_code, a.full_name, a.email, a.phone, a.position_applied, a.status,
            a.total_experience, a.expected_ctc, a.notice_period_days, a.created_at, a.interview_at,
            a.stage2_submitted_at, a.ai_status, a.ai_error, a.resume_filename,
            a.notify_status, a.notify_at,
            a.interview_status, a.interview_score,
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

    // The extension decides how the browser treats it. PDFs and images render inline; a .doc/.docx
    // has no in-browser viewer, so it still downloads.
    const ext = (app.resume_filename || '').toLowerCase().split('.').pop();
    const type = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }[ext];

    // ?download=1 forces the save dialog; without it, viewable types open in the tab / our modal.
    const inline = type && req.query.download !== '1';
    res.setHeader('Content-Type', type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${(app.resume_filename || 'resume').replace(/"/g, '')}"`
    );
    res.send(buffer);
  } catch {
    res.status(404).json({ error: 'That resume could not be retrieved from storage.' });
  }
});

/** Stream the candidate's interview video recording (HR only), for in-app playback. */
r.get('/:id/recording', async (req, res) => {
  try {
    const app = await one('SELECT company_id, interview_recording_path FROM applications WHERE id=$1', [req.params.id]);
    if (!app?.interview_recording_path) return res.status(404).json({ error: 'No interview recording for this candidate.' });
    if (!assertCompanyAccess(req, res, app.company_id)) return;
    const buffer = await getFile(app.interview_recording_path);
    const type = app.interview_recording_path.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', 'inline');
    res.send(buffer);
  } catch {
    res.status(404).json({ error: 'That recording could not be retrieved from storage.' });
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
  if (!app.resume_text && !app.resume_path)
    return res.status(400).json({ error: 'This candidate has no resume on file.' });

  const job = app.job_id
    ? await one('SELECT jd_text, description, min_experience, max_experience, location FROM jobs WHERE id=$1', [app.job_id])
    : null;

  await q(`UPDATE applications SET ai_status='PENDING', ai_error=NULL WHERE id=$1`, [app.id]);
  res.json({ ok: true });

  // Run in the background so the button returns instantly.
  (async () => {
    try {
      let text = app.resume_text;
      // A failed extraction leaves no text — pull the file back from storage and try again.
      if (!text && app.resume_path) {
        const buffer = await getFile(app.resume_path);
        text = await extractText(buffer, '', app.resume_filename || '');
        await q('UPDATE applications SET resume_text=$1 WHERE id=$2', [text, app.id]);
      }
      await summariseResume(app.id, {
        resumeText: text,
        position: app.position_applied,
        company: app.company_name,
        experience: app.total_experience,
        jobDescription: job?.jd_text || toText(job?.description),
        experienceRange: describeRange(job?.min_experience, job?.max_experience),
        jobLocation: job?.location,
        candidateLocation: [app.area, app.city, app.pincode].map((x) => (x || '').trim()).filter(Boolean).join(', ') || app.current_location,
      });
    } catch (err) {
      console.error('reanalyse failed:', err.message);
      await q(`UPDATE applications SET ai_status='FAILED', ai_error=$2 WHERE id=$1`,
              [app.id, err.message.slice(0, 300)]);
    }
  })();
});

/** Re-send (or send) the HR notification email for one application. Used by the pipeline's
    send-log column when a notification failed or was skipped (e.g. email was not yet configured). */
r.post('/:id/notify', async (req, res, next) => {
  try {
    const app = await one('SELECT company_id FROM applications WHERE id=$1', [req.params.id]);
    if (!app) return res.status(404).json({ error: 'Application not found.' });
    if (!assertCompanyAccess(req, res, app.company_id)) return;

    const result = await notifyHrOfApplication(Number(req.params.id));
    if (!result.sent) return res.status(400).json({ error: result.reason || 'Could not send the email.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Re-score every resume that previously failed (runs in the background, paced to avoid rate limits). */
r.post('/rescore-failed', async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT count(*)::int AS n FROM applications
         WHERE ai_status IN ('FAILED', 'PENDING', 'NOT_SCORED', 'SKIPPED')
           AND resume_path IS NOT NULL AND COALESCE(ai_attempts, 0) < 8`
    );
    rescoreFailed(500).catch((e) => console.error('manual rescore error:', e.message));
    res.json({ queued: rows[0].n });
  } catch (err) {
    next(err);
  }
});

/** Send (or re-send) the candidate their AI first-round interview link, and mark it invited. */
r.post('/:id/send-interview', async (req, res, next) => {
  try {
    const app = await one('SELECT company_id, interview_status FROM applications WHERE id=$1', [req.params.id]);
    if (!app) return res.status(404).json({ error: 'Application not found.' });
    if (!assertCompanyAccess(req, res, app.company_id)) return;
    if (app.interview_status === 'DONE')
      return res.status(400).json({ error: 'This candidate has already completed the AI interview.' });

    const result = await emailAiInterview(Number(req.params.id));
    if (!result.sent) return res.status(400).json({ error: result.reason || 'Could not send the interview link.' });

    // Mark as invited (unless they've already started), so the pipeline can show the state.
    await q(
      `UPDATE applications SET interview_status='INVITED', updated_at=now()
        WHERE id=$1 AND (interview_status IS NULL OR interview_status NOT IN ('IN_PROGRESS','DONE'))`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Delete one application row from the pipeline, permanently.
    status_history rows cascade-delete automatically. If the candidate was already made an
    employee (status Joined), that employee record is KEPT but detached from this application
    (its application_id is cleared), so the delete can't fail on that link and no staff record
    is lost. Any resume / offer-letter files in OneDrive are left in place. */
r.delete('/:id', async (req, res, next) => {
  try {
    const app = await one('SELECT company_id FROM applications WHERE id=$1', [req.params.id]);
    if (!app) return res.status(404).json({ error: 'Application not found.' });
    if (!assertCompanyAccess(req, res, app.company_id)) return;

    await tx(async (client) => {
      // Detach any employee record so the foreign key doesn't block the delete.
      await client.query('UPDATE employees SET application_id=NULL WHERE application_id=$1', [req.params.id]);
      // status_history cascades on delete; this removes the application row itself.
      await client.query('DELETE FROM applications WHERE id=$1', [req.params.id]);
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Move a candidate along the pipeline. JOINED creates the employee record. */
r.post('/:id/status', async (req, res) => {
  const { status, note, interview_at, offered_ctc, emp_code, date_of_joining, designation, department } = req.body;
  if (![...PIPELINE, ...CLOSED].includes(status))
    return res.status(400).json({ error: 'That is not a valid status.' });

  const app = await one('SELECT * FROM applications WHERE id=$1', [req.params.id]);
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (!assertCompanyAccess(req, res, app.company_id)) return;

  // Already on this status — do nothing, so re-selecting it can't add a duplicate history row,
  // a second employee record, or a repeat email.
  if (status === app.status) return res.json({ ok: true, unchanged: true });

  // The full application form is now collected AFTER joining (it's emailed on JOINED below), so
  // submitting it is no longer a precondition for marking someone JOINED.

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

  // The full application form is sent to the candidate as onboarding, once they are marked JOINED
  // (see below), not at the office-interview stage.

  // Moving a candidate to the Accepted stage automatically sends them the AI first-round
  // interview link and marks it invited. Fire-and-forget, same as above.
  if (status === 'ACCEPTED') {
    emailAiInterview(app.id)
      .then((out) => {
        if (out.sent) {
          q(`UPDATE applications SET interview_status='INVITED', updated_at=now()
               WHERE id=$1 AND (interview_status IS NULL OR interview_status NOT IN ('IN_PROGRESS','DONE'))`,
            [app.id]).catch((e) => console.error('interview_status update error:', e.message));
        } else {
          console.error('AI interview email not sent:', out.reason);
        }
      })
      .catch((e) => console.error('AI interview email error:', e.message));
    // Same invite over WhatsApp.
    whatsappFirstInterview(app.id)
      .then((out) => { if (!out.sent) console.error('interview WhatsApp not sent:', out.reason); })
      .catch((e) => console.error('interview WhatsApp error:', e.message));
  }

  // On SELECTED (shortlisted after the first round): tell the candidate by email + WhatsApp.
  if (status === 'SELECTED') {
    notifyApplicantSelected(app.id)
      .then((out) => { if (!out.email && !out.whatsapp) console.error('selected notice not sent:', out.reason); })
      .catch((e) => console.error('selected notice error:', e.message));
  }

  // On JOINED: email the new joiner their full application form link (onboarding paperwork), and
  // refresh the master workbook. Both fire-and-forget — a slow send or OneDrive must not fail the
  // HR admin's click, and a bad candidate address is logged, not surfaced.
  if (status === 'JOINED') {
    emailJoiningForm(app.id)
      .then((out) => { if (!out.sent) console.error('joining form email not sent:', out.reason); })
      .catch((e) => console.error('joining form email error:', e.message));
    // Same welcome + form link over WhatsApp.
    whatsappJoined(app.id)
      .then((out) => { if (!out.sent) console.error('joined WhatsApp not sent:', out.reason); })
      .catch((e) => console.error('joined WhatsApp error:', e.message));
    syncWorkbook();
  }
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
      // Same candidate folder as the resume:  {COMPANY}/{Role}/{Name}_{AppID}/offer-letter.pdf
      const folder = `${co.code}/${safeName(app.position_applied)}/${safeName(app.full_name)}_${app.id}`;
      key = `${folder}/offer-letter.pdf`;
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

/** File the submitted application form to OneDrive (Employee Master Data Report) and email it to
 *  HR, on demand — for forms submitted before this was automatic, or to re-file/re-send. */
r.post('/:id/file-form', async (req, res) => {
  const app = await one('SELECT company_id, stage2_submitted_at FROM applications WHERE id=$1', [req.params.id]);
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (!assertCompanyAccess(req, res, app.company_id)) return;
  if (!app.stage2_submitted_at)
    return res.status(400).json({ error: 'This candidate has not submitted the full application form yet.' });

  const out = await fileAndEmailApplicationForm(req.params.id);
  res.json(out);
});

/** Let HR reopen a submitted form (candidate made a mistake, or details changed). */
r.post('/:id/reopen-form', async (req, res) => {
  const app = await one('SELECT company_id FROM applications WHERE id=$1', [req.params.id]);
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (!assertCompanyAccess(req, res, app.company_id)) return;
  await q('UPDATE applications SET stage2_submitted_at=NULL WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Employee joining checklist (HR onboarding form, one per candidate)
// ---------------------------------------------------------------------------

/** The joining checklist for a candidate, plus details pulled from the application to pre-fill a
 *  blank form. Returns an empty checklist (status NONE) when HR hasn't started one yet. */
r.get('/:id/joining-checklist', async (req, res) => {
  const app = await one(
    `SELECT a.id, a.company_id, a.ref_code, a.full_name, a.position_applied, a.phone, a.email,
            a.current_location, a.offer_designation, a.offer_joining_date,
            c.name AS company_name, c.code AS company_code
       FROM applications a JOIN companies c ON c.id = a.company_id
      WHERE a.id = $1`,
    [req.params.id]
  );
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (!assertCompanyAccess(req, res, app.company_id)) return;

  const row = await one(
    `SELECT jc.data, jc.status, jc.submitted_at, u.name AS updated_by_name, jc.updated_at
       FROM joining_checklists jc LEFT JOIN users u ON u.id = jc.updated_by
      WHERE jc.application_id = $1`,
    [req.params.id]
  );

  res.json({
    status: row?.status || 'NONE',
    submitted_at: row?.submitted_at || null,
    updated_by_name: row?.updated_by_name || null,
    updated_at: row?.updated_at || null,
    data: row?.data || null,
    // Seed values for a brand-new form, taken from what the application already knows.
    prefill: {
      employee_name: app.full_name || '',
      designation: app.offer_designation || app.position_applied || '',
      department: '',
      date_of_joining: app.offer_joining_date ? String(app.offer_joining_date).slice(0, 10) : '',
      work_location: app.current_location || '',
      reporting_manager: '',
      contact_no: app.phone || '',
      employee_id: '',
    },
    candidate: {
      id: app.id,
      ref_code: app.ref_code,
      full_name: app.full_name,
      company_name: app.company_name,
      company_code: app.company_code,
    },
  });
});

/** Save the checklist as a draft (create or overwrite). Nothing here is mandatory. */
r.put('/:id/joining-checklist', async (req, res) => {
  const app = await one('SELECT company_id FROM applications WHERE id=$1', [req.params.id]);
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (!assertCompanyAccess(req, res, app.company_id)) return;

  const data = req.body?.data;
  if (!data || typeof data !== 'object')
    return res.status(400).json({ error: 'Nothing to save.' });

  await q(
    `INSERT INTO joining_checklists (application_id, data, status, submitted_at, updated_by, updated_at)
          VALUES ($1, $2::jsonb, 'DRAFT', NULL, $3, now())
     ON CONFLICT (application_id)
     DO UPDATE SET data = $2::jsonb, status = 'DRAFT', submitted_at = NULL,
                   updated_by = $3, updated_at = now()`,
    [req.params.id, JSON.stringify(data), req.user.id]
  );
  res.json({ ok: true, status: 'DRAFT' });
});

/** Final submit — locks the record as SUBMITTED. Employee name is the one hard requirement. */
r.post('/:id/joining-checklist/submit', async (req, res) => {
  const app = await one('SELECT company_id FROM applications WHERE id=$1', [req.params.id]);
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (!assertCompanyAccess(req, res, app.company_id)) return;

  const data = req.body?.data;
  if (!data || typeof data !== 'object')
    return res.status(400).json({ error: 'Nothing to submit.' });
  if (!String(data.employee_name || '').trim())
    return res.status(400).json({ error: 'Employee name is required before submitting.' });

  await q(
    `INSERT INTO joining_checklists (application_id, data, status, submitted_at, updated_by, updated_at)
          VALUES ($1, $2::jsonb, 'SUBMITTED', now(), $3, now())
     ON CONFLICT (application_id)
     DO UPDATE SET data = $2::jsonb, status = 'SUBMITTED', submitted_at = now(),
                   updated_by = $3, updated_at = now()`,
    [req.params.id, JSON.stringify(data), req.user.id]
  );
  res.json({ ok: true, status: 'SUBMITTED' });
});

export default r;
