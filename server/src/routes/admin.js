import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import { one, q, tx } from '../db.js';
import { requireAuth, requireSuperAdmin, companyFilter, assertCompanyAccess } from '../auth.js';
import { extractText, summariseResume } from '../services/resume.js';
import { putFile, deleteFile } from '../services/storage.js';
import { safeName } from '../services/graph.js';
import { syncWorkbook } from '../services/workbook.js';
import { sanitise } from '../services/html.js';


export const employees = Router();
employees.use(requireAuth);

employees.get('/', async (req, res) => {
  const company = companyFilter(req);
  const { rows } = await q(
    `SELECT e.id, e.emp_code, e.full_name, e.email, e.phone, e.designation, e.department,
            e.date_of_joining, e.annual_ctc, e.status, e.exit_date, e.blood_group,
            c.code AS company_code, c.colour, e.application_id
       FROM employees e JOIN companies c ON c.id = e.company_id
      WHERE ($1::int[] IS NULL OR e.company_id = ANY($1))
        AND ($2::text IS NULL OR e.status = $2)
        AND ($3::text IS NULL OR e.full_name ILIKE '%'||$3||'%' OR e.emp_code ILIKE '%'||$3||'%'
             OR e.designation ILIKE '%'||$3||'%' OR e.department ILIKE '%'||$3||'%')
      ORDER BY e.date_of_joining DESC NULLS LAST`,
    [company, req.query.status || null, req.query.q || null]
  );
  res.json(rows);
});

employees.get('/:id', async (req, res) => {
  const emp = await one(
    `SELECT e.*, c.code AS company_code, c.name AS company_name, c.colour
       FROM employees e JOIN companies c ON c.id = e.company_id WHERE e.id=$1`,
    [req.params.id]
  );
  if (!emp) return res.status(404).json({ error: 'Employee not found.' });
  if (!assertCompanyAccess(req, res, emp.company_id)) return;
  res.json(emp);
});

employees.patch('/:id', async (req, res) => {
  const emp = await one('SELECT company_id FROM employees WHERE id=$1', [req.params.id]);
  if (!emp) return res.status(404).json({ error: 'Employee not found.' });
  if (!assertCompanyAccess(req, res, emp.company_id)) return;

  const f = ['designation', 'department', 'date_of_joining', 'annual_ctc', 'status', 'exit_date', 'exit_reason', 'email', 'phone'];
  const set = f.filter((k) => k in req.body);
  if (!set.length) return res.status(400).json({ error: 'Nothing to update.' });

  const { rows } = await q(
    `UPDATE employees SET ${set.map((k, i) => `${k}=$${i + 1}`).join(', ')} WHERE id=$${set.length + 1} RETURNING *`,
    [...set.map((k) => req.body[k] || null), req.params.id]
  );
  res.json(rows[0]);
  syncWorkbook(); // an edit or an exit changes the master sheet
});

/** Rebuild the workbook on demand — the "Sync to OneDrive" button. */
employees.post('/sync-workbook', async (req, res, next) => {
  try {
    const url = await syncWorkbook({ throwOnError: true });
    res.json({ ok: true, url });
  } catch (err) {
    next(err);
  }
});

export const jobs = Router();
jobs.use(requireAuth);

jobs.get('/', async (req, res) => {
  const company = companyFilter(req);
  const { rows } = await q(
    `SELECT j.id, j.company_id, j.title, j.department, j.location, j.employment_type,
            j.min_experience, j.max_experience, j.description, j.status, j.created_at,
            j.jd_filename, (j.jd_text IS NOT NULL) AS has_jd,
            c.code AS company_code, c.colour,
            (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id) AS applicant_count
       FROM jobs j JOIN companies c ON c.id = j.company_id
      WHERE ($1::int[] IS NULL OR j.company_id = ANY($1))
      ORDER BY j.status, j.created_at DESC`,
    [company]
  );
  res.json(rows);
});

jobs.post('/', async (req, res) => {
  const b = req.body;
  const companyId = Number(b.company_id);
  if (!companyId || !b.title) return res.status(400).json({ error: 'Company and job title are required.' });
  if (!assertCompanyAccess(req, res, companyId)) return;

  // An upper bound below the lower bound would silently filter out every candidate.
  const min = Number(b.min_experience) || 0;
  const max = b.max_experience === '' || b.max_experience == null ? null : Number(b.max_experience);
  if (max != null && max < min)
    return res.status(400).json({ error: 'Maximum experience cannot be less than the minimum.' });

  const { rows } = await q(
    `INSERT INTO jobs (company_id, title, department, location, employment_type,
                       min_experience, max_experience, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [companyId, b.title, b.department || null, b.location || null, b.employment_type || 'Full-time',
     min, max, sanitise(b.description), req.user.id]
  );
  res.status(201).json(rows[0]);
});

jobs.patch('/:id', async (req, res) => {
  const job = await one('SELECT company_id FROM jobs WHERE id=$1', [req.params.id]);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (!assertCompanyAccess(req, res, job.company_id)) return;

  const f = ['title', 'department', 'location', 'employment_type',
             'min_experience', 'max_experience', 'description', 'status'];
  const set = f.filter((k) => k in req.body);
  if (!set.length) return res.status(400).json({ error: 'Nothing to update.' });
  const { rows } = await q(
    `UPDATE jobs SET ${set.map((k, i) => `${k}=$${i + 1}`).join(', ')} WHERE id=$${set.length + 1} RETURNING *`,
    [...set.map((k) => (k === 'description' ? sanitise(req.body[k]) : req.body[k])), req.params.id]
  );
  res.json(rows[0]);
});

/**
 * Delete an opening. Super admin only — an HR admin can close a role, but removing it outright
 * takes a record out of the system and that is not theirs to do.
 *
 * Candidates who applied are NEVER deleted. If any exist, the call is refused unless ?force=true,
 * and even then the candidates survive: their link to the opening is cut, and they keep the role
 * they applied for as plain text. Losing a job posting is an administrative tidy-up; losing a
 * person's application is data loss.
 */
jobs.delete('/:id', requireSuperAdmin, async (req, res) => {
  const job = await one('SELECT * FROM jobs WHERE id=$1', [req.params.id]);
  if (!job) return res.status(404).json({ error: 'Opening not found.' });

  const { rows } = await q('SELECT count(*)::int AS n FROM applications WHERE job_id=$1', [job.id]);
  const applicants = rows[0].n;

  if (applicants > 0 && req.query.force !== 'true') {
    return res.status(409).json({
      error:
        `${applicants} ${applicants === 1 ? 'candidate has' : 'candidates have'} applied for this opening. ` +
        `They will be kept, but will no longer be linked to it.`,
      applicants,
    });
  }

  await tx(async (client) => {
    // Cut the link, keep the people.
    await client.query('UPDATE applications SET job_id=NULL WHERE job_id=$1', [job.id]);
    await client.query('DELETE FROM jobs WHERE id=$1', [job.id]);
  });

  // The JD document goes too — it describes a role that no longer exists.
  if (job.jd_path) await deleteFile(job.jd_path).catch(() => {});

  res.json({ ok: true, applicants_detached: applicants });
});

export const users = Router();
users.use(requireAuth);

users.get('/companies', async (_req, res) => {
  const { rows } = await q('SELECT id, code, name, colour, active FROM companies ORDER BY id');
  res.json(rows);
});

// Everything below is super-admin only.

/** One row per admin, with every company they look after folded in. */
users.get('/', requireSuperAdmin, async (_req, res) => {
  const { rows } = await q(
    `SELECT u.id, u.name, u.email, u.role, u.active, u.created_at,
            COALESCE(
              (SELECT json_agg(json_build_object('id', c.id, 'code', c.code, 'colour', c.colour) ORDER BY c.id)
                 FROM user_companies uc JOIN companies c ON c.id = uc.company_id
                WHERE uc.user_id = u.id),
              '[]'::json
            ) AS companies
       FROM users u
      ORDER BY u.role, u.name`
  );
  res.json(rows);
});

users.post('/', requireSuperAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;
  const companyIds = (req.body.company_ids || []).map(Number).filter(Boolean);

  if (!name || !email || !password || !role)
    return res.status(400).json({ error: 'Name, email, password and role are required.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (role === 'HR_ADMIN' && !companyIds.length)
    return res.status(400).json({ error: 'Choose at least one company for this HR admin.' });

  try {
    const created = await tx(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1,$2,$3,$4) RETURNING id, name, email, role, active`,
        [name, email.toLowerCase(), await bcrypt.hash(password, 10), role]
      );
      const user = rows[0];
      // A super admin reaches every company by role, so no rows are written for them.
      if (role === 'HR_ADMIN')
        for (const cid of companyIds)
          await client.query('INSERT INTO user_companies (user_id, company_id) VALUES ($1,$2)', [user.id, cid]);
      return user;
    });
    res.status(201).json(created);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That email already has an account.' });
    throw e;
  }
});

users.patch('/:id', requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id && req.body.active === false)
    return res.status(400).json({ error: 'You cannot deactivate your own account.' });

  // Demoting yourself out of SUPER_ADMIN would lock you out of this very page.
  if (id === req.user.id && req.body.role && req.body.role !== 'SUPER_ADMIN')
    return res.status(400).json({ error: 'You cannot remove your own super admin role.' });

  const sets = [];
  const vals = [];
  for (const k of ['name', 'email', 'active', 'role']) {
    if (k in req.body) {
      sets.push(`${k}=$${sets.length + 1}`);
      vals.push(k === 'email' ? String(req.body[k]).toLowerCase().trim() : req.body[k]);
    }
  }
  if (req.body.password) {
    if (req.body.password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    sets.push(`password_hash=$${sets.length + 1}`);
    vals.push(await bcrypt.hash(req.body.password, 10));
  }

  const changingCompanies = Array.isArray(req.body.company_ids);
  if (!sets.length && !changingCompanies) return res.status(400).json({ error: 'Nothing to update.' });

  // An HR admin with no company can sign in and see nothing — catch it here rather than
  // letting someone create a ghost account.
  const endRole = req.body.role || (await one('SELECT role FROM users WHERE id=$1', [id]))?.role;
  if (endRole === 'HR_ADMIN' && changingCompanies && !req.body.company_ids.length)
    return res.status(400).json({ error: 'An HR admin must look after at least one company.' });

  try {
    await tx(async (client) => {
      if (sets.length) {
        vals.push(id);
        await client.query(`UPDATE users SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
      }
      // A super admin reaches every company by role, so their membership rows are cleared.
      if (endRole === 'SUPER_ADMIN') {
        await client.query('DELETE FROM user_companies WHERE user_id=$1', [id]);
      } else if (changingCompanies) {
        // Replace the whole set — the form always sends the complete list.
        await client.query('DELETE FROM user_companies WHERE user_id=$1', [id]);
        for (const cid of req.body.company_ids.map(Number).filter(Boolean))
          await client.query('INSERT INTO user_companies (user_id, company_id) VALUES ($1,$2)', [id, cid]);
      }
    });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Another account already uses that email.' });
    throw e;
  }

  res.json({ ok: true });
});

/* ---------- the job description ----------
   The JD is what every resume for this role is scored against. Upload it once per opening. */
const jdUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ].includes(file.mimetype);
    cb(ok ? null : new Error('The job description must be a PDF, Word file or plain text, under 8 MB.'), ok);
  },
});

jobs.post('/:id/jd', jdUpload.single('jd'), async (req, res, next) => {
  try {
    const job = await one('SELECT * FROM jobs WHERE id=$1', [req.params.id]);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    if (!assertCompanyAccess(req, res, job.company_id)) return;

    // The JD can be uploaded as a file, or pasted straight in as text.
    let text = (req.body.jd_text || '').trim();
    let key = job.jd_path;
    let filename = job.jd_filename;

    if (req.file) {
      const company = await one('SELECT code FROM companies WHERE id=$1', [job.company_id]);
      const ext = path.extname(req.file.originalname) || '.pdf';
      key = `Job Descriptions/${company.code}/${safeName(job.title)}${ext}`;
      await putFile(key, req.file.buffer, req.file.mimetype);
      filename = req.file.originalname;
      text = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
    }

    if (!text)
      return res.status(400).json({ error: 'Attach a job description file, or paste the text in.' });

    await q('UPDATE jobs SET jd_path=$1, jd_filename=$2, jd_text=$3 WHERE id=$4', [key, filename, text, job.id]);

    // Scores are only comparable if every candidate was scored against the same JD, so
    // re-score everyone already in the pipeline for this role.
    const { rows: apps } = await q(
      `SELECT a.id, a.resume_text, a.position_applied, a.total_experience, c.name AS company_name
         FROM applications a JOIN companies c ON c.id = a.company_id
        WHERE a.job_id = $1 AND a.resume_text IS NOT NULL`,
      [job.id]
    );
    if (apps.length) await q(`UPDATE applications SET ai_status='PENDING' WHERE job_id=$1 AND resume_text IS NOT NULL`, [job.id]);

    res.json({ ok: true, characters: text.length, rescoring: apps.length });

    for (const a of apps)
      await summariseResume(a.id, {
        resumeText: a.resume_text,
        position: a.position_applied,
        company: a.company_name,
        experience: a.total_experience,
        jobDescription: text,
      });
  } catch (err) {
    next(err);
  }
});

/** Read back the JD text, so HR can see exactly what candidates are being scored against. */
jobs.get('/:id/jd', async (req, res) => {
  const job = await one('SELECT company_id, jd_filename, jd_text FROM jobs WHERE id=$1', [req.params.id]);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (!assertCompanyAccess(req, res, job.company_id)) return;
  if (!job.jd_text) return res.status(404).json({ error: 'No job description has been uploaded for this role.' });
  res.json({ jd_filename: job.jd_filename, jd_text: job.jd_text });
});

/** Update a company's name, colour or address. The colour is the rail on every row for that company. */
users.patch('/companies/:id', requireSuperAdmin, async (req, res) => {
  const fields = ['name', 'colour', 'address', 'website', 'active'];
  const set = fields.filter((k) => k in req.body);
  if (!set.length) return res.status(400).json({ error: 'Nothing to update.' });

  const { rows } = await q(
    `UPDATE companies SET ${set.map((k, i) => `${k}=$${i + 1}`).join(', ')}
      WHERE id=$${set.length + 1} RETURNING *`,
    [...set.map((k) => req.body[k]), req.params.id]
  );
  res.json(rows[0]);
});
