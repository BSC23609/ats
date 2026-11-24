import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { pool, q, one } from './db.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Colours read off each company's logo — they become the rail down the left of every row.
const COMPANIES = [
  ['BSC', 'Bharat Steel (Chennai) Pvt. Ltd.', '#0064A0', 'Chennai, Tamil Nadu', 'bharatsteels.in'],
  ['METFRAA', 'Metfraa Steel Buildings Pvt. Ltd.', '#005A96', 'Chennai, Tamil Nadu', 'metfraa.com'],
  ['CRAYON', 'Crayon Roofings & Structures', '#466E8C', 'Chennai, Tamil Nadu', 'crayonroofings.com'],
  ['G2', 'G2 Steel Services Pvt. Ltd.', '#0A6EB4', 'Chennai, Tamil Nadu', null],
];

/**
 * Small, additive schema changes for databases that already hold candidates.
 * Every statement must be safe to run twice — this fires on every boot.
 * Nothing here ever drops or rewrites a column.
 */
export async function migrate() {
  const steps = [
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS area    TEXT`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS city    TEXT`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS pincode TEXT`,
    `ALTER TABLE jobs         ADD COLUMN IF NOT EXISTS max_experience INT`,
    `ALTER TABLE jobs         ADD COLUMN IF NOT EXISTS jd_doc JSONB`,
    `ALTER TABLE users        ADD COLUMN IF NOT EXISTS phone TEXT`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_error TEXT`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_attempts INT DEFAULT 0`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_recording_path TEXT`,
    // On-demand scoring: allow a NOT_SCORED state (resume on file, awaiting a manual "Score" click).
    `ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_ai_status_check`,
    `ALTER TABLE applications ADD CONSTRAINT applications_ai_status_check CHECK (ai_status IN ('PENDING','DONE','FAILED','SKIPPED','NOT_SCORED'))`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS notify_status TEXT`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS notify_at TIMESTAMPTZ`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS notify_error TEXT`,
    // New pipeline stages (Nov 2026). Map old codes to the new ones, then swap the CHECK
    // constraint. All idempotent: after the first run the UPDATEs touch nothing.
    `UPDATE applications SET status='ACCEPTED'         WHERE status='SHORTLISTED'`,
    `UPDATE applications SET status='OFFICE_INTERVIEW' WHERE status='INTERVIEW'`,
    `ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_check`,
    `ALTER TABLE applications ADD CONSTRAINT applications_status_check CHECK (status IN
       ('APPLIED','ACCEPTED','INTERVIEW_SCORE','OFFICE_INTERVIEW','SELECTED','OFFERED','JOINED','REJECTED','WITHDRAWN','ON_HOLD'))`,
    // One employee record per application, enforced in the database as well as in code.
    `CREATE UNIQUE INDEX IF NOT EXISTS uniq_employee_application ON employees(application_id) WHERE application_id IS NOT NULL`,
    // AI video interview (first round). Every application gets a private interview link token.
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_token TEXT DEFAULT encode(gen_random_bytes(16),'hex')`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_status TEXT`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_transcript JSONB`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_score NUMERIC(4,1)`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_result JSONB`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_recording_path TEXT`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_started_at TIMESTAMPTZ`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_completed_at TIMESTAMPTZ`,
    `UPDATE applications SET interview_token = encode(gen_random_bytes(16),'hex') WHERE interview_token IS NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uniq_application_interview_token ON applications(interview_token)`,
    `CREATE TABLE IF NOT EXISTS password_otps (
       id SERIAL PRIMARY KEY,
       user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       code_hash TEXT NOT NULL,
       expires_at TIMESTAMPTZ NOT NULL,
       attempts INT NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_password_otps_user ON password_otps(user_id)`,
    // Employee joining checklist (HR onboarding form) — one per application, saved as a draft
    // until HR finally submits it. The whole filled form lives in `data` (see web JoiningChecklist).
    `CREATE TABLE IF NOT EXISTS joining_checklists (
       application_id INT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
       data          JSONB NOT NULL DEFAULT '{}'::jsonb,
       status        TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED')),
       submitted_at  TIMESTAMPTZ,
       updated_by    INT REFERENCES users(id),
       created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  ];
  for (const sql of steps) {
    try {
      await q(sql);
    } catch (err) {
      console.error('Migration step failed:', sql, '—', err.message);
    }
  }
}

/**
 * Company names, colours and addresses are configuration, not data — so they are refreshed
 * from the list above every time the API starts. Change a colour here, redeploy, done.
 * Nothing else about the company row is touched.
 */
export async function syncCompanies() {
  for (const [code, name, colour, address, website] of COMPANIES) {
    await q(
      `UPDATE companies SET name=$1, colour=$2, address=$3, website=$4 WHERE code=$5`,
      [name, colour, address, website, code]
    );
  }
}

/** Has this database been set up already? */
export async function isInitialised() {
  const row = await one(`SELECT to_regclass('public.companies') AS t`);
  return Boolean(row?.t);
}

/**
 * Creates every table and seeds the four companies, five logins and four sample openings.
 * DESTRUCTIVE — schema.sql drops the tables first. Only ever called when the database is empty.
 */
export async function initDb() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await q(sql);

  for (const [code, name, colour, address, website] of COMPANIES) {
    await q('INSERT INTO companies (code, name, colour, address, website) VALUES ($1,$2,$3,$4,$5)',
      [code, name, colour, address, website]);
  }

  const password = process.env.SEED_PASSWORD || 'Bharat@2026';
  const hash = await bcrypt.hash(password, 10);

  await q(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Group Super Admin', 'superadmin@bharatsteels.in', $1, 'SUPER_ADMIN')`,
    [hash]
  );

  // One HR admin per company to begin with. The super admin can give any of them more
  // companies later — one person can hold all four.
  for (const [code] of COMPANIES) {
    const { rows } = await q(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'HR_ADMIN') RETURNING id`,
      [`${code} HR Admin`, `hr.${code.toLowerCase()}@bharatsteels.in`, hash]
    );
    await q(
      `INSERT INTO user_companies (user_id, company_id)
       VALUES ($1, (SELECT id FROM companies WHERE code = $2))`,
      [rows[0].id, code]
    );
  }

  await q(`INSERT INTO jobs (company_id, title, department, location, min_experience, description)
    VALUES
      ((SELECT id FROM companies WHERE code='METFRAA'), 'Design Engineer - PEB', 'Design', 'Chennai', 2, 'STAAD.Pro portal frame design, IS 800 / IS 875 compliance.'),
      ((SELECT id FROM companies WHERE code='METFRAA'), 'Site Engineer', 'Projects', 'Tamil Nadu', 3, 'PEB erection supervision at customer sites.'),
      ((SELECT id FROM companies WHERE code='BSC'), 'Sales Executive - Steel', 'Sales', 'Chennai', 1, 'TMT and structural steel dealer sales.'),
      ((SELECT id FROM companies WHERE code='CRAYON'), 'Stores Executive', 'Stores', 'Chennai', 2, 'Roofing sheet and accessories inventory control.')`);

  return { password, companies: COMPANIES.map(([c]) => c) };
}

/** `npm run db:init` — run by hand, from a terminal. */
const runFromCli = async () => {
  const { password } = await initDb();
  console.log(`\nSeeded. Every user password: ${password}`);
  console.log('  superadmin@bharatsteels.in       (SUPER_ADMIN — all companies)');
  COMPANIES.forEach(([c]) => console.log(`  hr.${c.toLowerCase()}@bharatsteels.in`.padEnd(35) + `(HR_ADMIN — ${c})`));
  await pool.end();
};

// Only run when invoked directly, not when imported by the server.
if (process.argv[1] && process.argv[1].endsWith('init-db.js')) {
  runFromCli().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
