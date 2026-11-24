import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { one, q, tx } from '../db.js';
import { extractText, summariseResume } from '../services/resume.js';
import { notifyHrOfApplication, fileAndEmailApplicationForm, emailHrInterviewComplete } from '../services/notify.js';
import { putFile } from '../services/storage.js';
import { safeName } from '../services/graph.js';
import { toText, describeRange } from '../services/html.js';
import { tts, stt, sarvamConfigured } from '../services/sarvam.js';
import { generateQuestions, scoreInterview } from '../services/interview.js';

// The first-round AI interview runs for at most this long, from the first question onward.
const INTERVIEW_MS = 5 * 60 * 1000;

const r = Router();

// Audio clips from the AI interview (one short answer at a time), held in memory for transcription.
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

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
    `SELECT j.id, j.title, j.department, j.location, j.employment_type,
            j.min_experience, j.max_experience, j.description,
            c.id AS company_id, c.code AS company_code, c.name AS company_name, c.colour
       FROM jobs j JOIN companies c ON c.id = j.company_id
      WHERE j.status = 'OPEN' AND c.active
      ORDER BY c.code, j.title`
  );
  res.json(rows);
});

/** One opening by id, for a shared deep link (/careers?job=<id>). Returns it whether or not it is
 *  still open, so a link shared on a job portal always opens that exact role's application form. */
r.get('/openings/:id', async (req, res) => {
  const job = await one(
    `SELECT j.id, j.title, j.department, j.location, j.employment_type,
            j.min_experience, j.max_experience, j.description, j.status,
            c.id AS company_id, c.code AS company_code, c.name AS company_name, c.colour
       FROM jobs j JOIN companies c ON c.id = j.company_id
      WHERE j.id = $1 AND c.active`,
    [req.params.id]
  );
  if (!job) return res.status(404).json({ error: 'This opening is not available.' });
  res.json(job);
});

/** The branded, shareable JD for one role — reads the AI-written jd_doc. Public so a link can be
 *  shared on job portals or sent to a candidate; works whether or not the role is still open. */
r.get('/jobs/:id/jd', async (req, res) => {
  const job = await one(
    `SELECT j.id, j.title, j.department, j.location, j.employment_type,
            j.min_experience, j.max_experience, j.status, j.jd_doc, j.description,
            c.code AS company_code, c.name AS company_name
       FROM jobs j JOIN companies c ON c.id = j.company_id
      WHERE j.id = $1 AND c.active`,
    [req.params.id]
  );
  if (!job) return res.status(404).json({ error: 'This role is not available.' });
  res.json(job);
});

/** Stage 1 — candidate applies from the careers page. */
r.post('/apply', upload.single('resume'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.full_name || !b.email || !b.phone || !b.company_id || !b.position_applied)
      return res.status(400).json({ error: 'Name, email, phone, company and position are required.' });

    if (b.pincode && !/^\d{6}$/.test(String(b.pincode).trim()))
      return res.status(400).json({ error: 'An Indian PIN code is six digits.' });

    const company = await one('SELECT * FROM companies WHERE id=$1 AND active', [b.company_id]);
    if (!company) return res.status(400).json({ error: 'That company is not accepting applications.' });

    // Stop the same person piling up duplicate applications for the same role. When the apply
    // came from a specific opening we match on the job; otherwise on company + role title.
    const email = b.email.trim().toLowerCase();
    const jobId = b.job_id && !Number.isNaN(Number(b.job_id)) ? Number(b.job_id) : null;
    const dup = await one(
      `SELECT ref_code FROM applications
         WHERE lower(email) = $1
           AND ($2::int IS NULL OR job_id = $2)
           AND ($2::int IS NOT NULL OR (company_id = $3 AND lower(position_applied) = lower($4)))
         LIMIT 1`,
      [email, jobId, company.id, b.position_applied.trim()]
    );
    if (dup)
      return res.status(409).json({
        error: `You have already applied for this role (reference ${dup.ref_code}). Our team already has your application — there is no need to apply again.`,
      });

    // Reserve the id first so the resume can be filed under its reference code, then store the
    // file before the row exists — a failed upload should never leave a half-made application.
    const seq = await one(`SELECT nextval('applications_id_seq')::int AS n`);
    const yymm = new Date().toISOString().slice(2, 7).replace('-', '');
    const ref = `${company.code}-${yymm}-${String(seq.n).padStart(4, '0')}`;

    let resumeKey = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.pdf';
      // Filed as:  {COMPANY}/{Role}/{Name}_{AppID}/resume.ext  — one folder per candidate, so the
      // resume, offer letter (and, later, the form PDFs) for one person sit together.
      // Filed directly in the role folder: {COMPANY}/{Role}/{Name}_{AppID}.ext — one resume per candidate.
      resumeKey = `${company.code}/${safeName(b.position_applied)}/${safeName(b.full_name)}_${seq.n}${ext}`;
      await putFile(resumeKey, req.file.buffer, req.file.mimetype);
    }

    const app = await tx(async (client) => {
      const id = seq.n;
      const { rows } = await client.query(
        `INSERT INTO applications
           (id, ref_code, company_id, job_id, full_name, email, phone, position_applied,
            current_location, area, city, pincode,
            total_experience, current_ctc, expected_ctc, notice_period_days, source,
            resume_path, resume_filename, ai_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'PENDING')
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
          // Kept as one line too, so search and the pipeline table stay simple.
          [b.area, b.city, b.pincode].map((x) => (x || '').trim()).filter(Boolean).join(', ') || null,
          (b.area || '').trim() || null,
          (b.city || '').trim() || null,
          (b.pincode || '').trim() || null,
          b.total_experience || 0,
          b.current_ctc || null,
          b.expected_ctc || null,
          b.notice_period_days || null,
          'careers',                 // source ($17) — this was the missing value
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

    // Email the HR team that a candidate applied. Fire-and-forget — the candidate is never held up,
    // and the outcome is recorded on the row (notify_status) for the pipeline's send-log column.
    notifyHrOfApplication(app.id).catch((e) => console.error('HR notify failed:', e.message));

    // Scoring is on-demand: we do NOT auto-read/score the resume. HR scores from the pipeline when
    // they choose to, which keeps AI usage deliberate. Mark the row so the pipeline shows a Score button.
    await q(`UPDATE applications SET ai_status=$2 WHERE id=$1`,
            [app.id, req.file ? 'NOT_SCORED' : 'SKIPPED']);
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

  // File the completed form in OneDrive (ATS / Employee Master Data Report) and email it to HR.
  // Fire-and-forget: a slow OneDrive or mail send must not hold up the candidate's submit.
  fileAndEmailApplicationForm(app.id)
    .then((out) => {
      if (!out.saved) console.error('application form not filed:', out.reason);
      if (!out.sent) console.error('application form not emailed to HR:', out.reason);
    })
    .catch((e) => console.error('application form file/email error:', e.message));
});

/* ---------------- AI video interview (first round) ---------------- */

/** Look up an interview by its private token. */
async function interviewApp(token) {
  return one(
    `SELECT a.id, a.full_name, a.email, a.position_applied, a.interview_status,
            a.interview_transcript, a.interview_result, a.interview_started_at,
            a.resume_text, a.job_id,
            c.name AS company_name,
            COALESCE(j.jd_text, j.description) AS job_description
       FROM applications a
       JOIN companies c ON c.id = a.company_id
       LEFT JOIN jobs j ON j.id = a.job_id
      WHERE a.interview_token = $1`,
    [token]
  );
}

/** Finalise the interview. Mark it DONE and close out immediately, then score the transcript in
 *  the BACKGROUND — the candidate sees the completion screen at once instead of waiting ~30s. */
async function finishInterview(app, transcript, res) {
  const baseResult = { questions: (app.interview_result && app.interview_result.questions) || [] };

  // Record the finished interview straight away (status DONE, transcript saved, score pending).
  await q(
    `UPDATE applications
        SET interview_status='DONE',
            interview_completed_at = now(),
            interview_result = $2,
            interview_transcript = $3,
            updated_at = now()
      WHERE id=$1`,
    [app.id, JSON.stringify(baseResult), JSON.stringify(transcript)]
  );

  const closing =
    'Thank you — that brings us to the end of this first-round interview. ' +
    'Our team will review your responses and be in touch about the next steps. All the best.';
  const voice = await tts(closing);
  res.json({ transcript: transcript.at(-1)?.text || '', done: true, text: closing, audio: voice.audio || null });

  // Score in the background — fills in the score/report after the candidate has already finished.
  scoreInterview({
    position: app.position_applied,
    company: app.company_name,
    jobDescription: app.job_description,
    transcript,
  })
    .then((scored) =>
      q(`UPDATE applications SET interview_score=$2, interview_result=$3, updated_at=now() WHERE id=$1`,
        [app.id, scored.score ?? null, JSON.stringify({ ...baseResult, ...scored })]))
    .catch((err) =>
      q(`UPDATE applications SET interview_result=$2 WHERE id=$1`,
        [app.id, JSON.stringify({ ...baseResult, score: null, error: String(err.message).slice(0, 300) })])
        .catch(() => {}))
    // Once the score is written, email HR that the first-round interview is complete (with details).
    .finally(() =>
      emailHrInterviewComplete(app.id)
        .then((out) => { if (!out.sent) console.error('HR interview-complete email not sent:', out.reason); })
        .catch((e) => console.error('HR interview-complete email error:', e.message)));
}

/** Candidate opens the interview link — basic info + whether it's already done. */
r.get('/interview/:token', async (req, res) => {
  const app = await interviewApp(req.params.token);
  if (!app) return res.status(404).json({ error: 'This interview link is not valid.' });
  res.json({
    full_name: app.full_name,
    position_applied: app.position_applied,
    company_name: app.company_name,
    status: app.interview_status || 'PENDING',
    voice_ready: sarvamConfigured(),
  });
});

/** Start (or restart) the interview — greet the candidate and ask for a self-introduction. */
r.post('/interview/:token/start', async (req, res) => {
  const app = await interviewApp(req.params.token);
  if (!app) return res.status(404).json({ error: 'This interview link is not valid.' });
  if (app.interview_status === 'DONE')
    return res.status(409).json({ error: 'This interview has already been completed.' });

  const first = (app.full_name || '').trim().split(/\s+/)[0] || 'there';
  const greeting =
    `Hello ${first}, and welcome to your first-round interview for the ${app.position_applied} role ` +
    `at ${app.company_name}. This will take about five minutes. ` +
    `To begin, please introduce yourself — tell me about your background, your experience, and why this ` +
    `role interests you. You have up to about a minute and a half for this. ` +
    `After that, I will ask you a few questions, and you can keep those answers brief.`;

  const voice = await tts(greeting);
  if (voice.error) return res.status(502).json({ error: voice.error });

  // Reset the clock and the question set every time the interview is (re)started, so a candidate
  // who opened the link earlier still gets the full 5 minutes and a fresh set of questions.
  await q(
    `UPDATE applications
        SET interview_status='IN_PROGRESS',
            interview_started_at = now(),
            interview_result = NULL,
            interview_transcript = $2,
            updated_at = now()
      WHERE id=$1`,
    [app.id, JSON.stringify([{ role: 'ai', text: greeting }])]
  );

  res.json({ text: greeting, audio: voice.audio, done: false });

  // Pre-generate the questions NOW (from resume + JD) while the candidate gives their ~90s intro,
  // so there is no wait after the introduction. If this hasn't finished by then, /answer falls back
  // to generating them on the spot.
  generateQuestions({
    position: app.position_applied,
    company: app.company_name,
    intro: '',
    resumeText: app.resume_text,
    jobDescription: app.job_description,
    count: 5,
  })
    .then((questions) => {
      if (questions && questions.length)
        return q(`UPDATE applications SET interview_result=$2 WHERE id=$1`,
          [app.id, JSON.stringify({ questions })]);
    })
    .catch((e) => console.error('interview pre-generate questions failed:', e.message));
});

/**
 * Candidate submits one spoken answer (<=30s audio). We transcribe it, then:
 *  - after the self-introduction, generate tailored questions from intro + resume + JD and ask the first;
 *  - after each later answer, ask the next question until the 5-minute cap or the questions run out;
 *  - then score the whole transcript and close.
 */
r.post('/interview/:token/answer', audioUpload.array('audio', 6), async (req, res) => {
  const app = await interviewApp(req.params.token);
  if (!app) return res.status(404).json({ error: 'This interview link is not valid.' });
  if (app.interview_status === 'DONE')
    return res.status(409).json({ error: 'This interview has already been completed.' });
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No audio was received.' });

  // The introduction may arrive as several <=30s clips (Sarvam caps a clip at 30s). Transcribe them
  // in parallel for speed and join them into the full introduction.
  const results = await Promise.all(
    files.map((f) => stt(f.buffer, f.originalname || 'answer.webm', f.mimetype))
  );
  const errored = results.find((r) => r.error);
  if (errored) return res.status(502).json({ error: errored.error });
  const answerText = results.map((r) => (r.transcript || '').trim()).filter(Boolean).join(' ');

  const transcript = Array.isArray(app.interview_transcript) ? app.interview_transcript : [];
  transcript.push({ role: 'candidate', text: answerText });

  // How many answers so far — the first is the self-introduction.
  const answered = transcript.filter((t) => t.role === 'candidate').length;

  // After the self-introduction, build the question set from intro + resume + JD.
  let result = app.interview_result && typeof app.interview_result === 'object' ? app.interview_result : {};
  let questions = Array.isArray(result.questions) && result.questions.length ? result.questions : null;
  if (!questions) {
    // Questions weren't pre-generated in time at /start — build them now from intro + resume + JD.
    try {
      questions = await generateQuestions({
        position: app.position_applied,
        company: app.company_name,
        intro: transcript.find((t) => t.role === 'candidate')?.text || '',
        resumeText: app.resume_text,
        jobDescription: app.job_description,
        count: 5,
      });
    } catch (err) {
      console.error('interview question generation failed:', err.message);
      questions = [];
    }
    // Never end right after the introduction — fall back to a few standard questions.
    if (!questions.length) {
      questions = [
        `Tell me about a project or task from your experience that is most relevant to the ${app.position_applied} role.`,
        'What are your key strengths, and where do you feel you still need to grow?',
        'Why do you want to join us, and what are you looking for in this role?',
        'What are your salary expectations and your availability to join?',
      ];
    }
    result = { ...result, questions };
    await q(`UPDATE applications SET interview_result=$2 WHERE id=$1`, [app.id, JSON.stringify(result)]);
  }

  // Ask the next question unless the 5-minute cap is reached or the questions are exhausted.
  const startedFrom = app.interview_started_at ? new Date(app.interview_started_at).getTime() : Date.now();
  const outOfTime = Date.now() - startedFrom >= INTERVIEW_MS;
  const nextQuestion = questions[answered - 1]; // answered=1 (intro) → questions[0]

  if (!nextQuestion || outOfTime) {
    return finishInterview({ ...app, interview_result: result }, transcript, res);
  }

  transcript.push({ role: 'ai', text: nextQuestion });
  const voice = await tts(nextQuestion);
  if (voice.error) return res.status(502).json({ error: voice.error });

  await q(`UPDATE applications SET interview_transcript=$2, updated_at=now() WHERE id=$1`,
          [app.id, JSON.stringify(transcript)]);

  res.json({ transcript: answerText, done: false, text: nextQuestion, audio: voice.audio });
});

export default r;
