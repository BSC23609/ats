-- Bharat Steel Group — Applicant Tracking System
-- Postgres 14+

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS status_history CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS user_companies CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

CREATE TABLE companies (
  id          SERIAL PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,          -- BSC | METFRAA | CRAYON | G2
  name        TEXT NOT NULL,
  colour      TEXT NOT NULL DEFAULT '#2563A8',
  address     TEXT,                        -- printed on the offer letter
  website     TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

-- role: SUPER_ADMIN (all companies, manages users) | HR_ADMIN (one company)
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','HR_ADMIN')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,

  -- Outgoing mail. Offer letters are sent FROM the HR admin's own mailbox, so each
  -- admin stores their own SMTP credentials (Microsoft 365: smtp.office365.com:587,
  -- with an app password — not the account password).
  smtp_host     TEXT,
  smtp_port     INT DEFAULT 587,
  smtp_user     TEXT,
  smtp_pass_enc TEXT,                     -- AES-256-GCM, key derived from JWT_SECRET
  from_email    TEXT,
  signature     TEXT,                     -- name + designation printed under the offer letter

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One HR admin can look after several companies. Super admins are not listed here;
-- they reach every company by role.
CREATE TABLE user_companies (
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE jobs (
  id             SERIAL PRIMARY KEY,
  company_id     INT NOT NULL REFERENCES companies(id),
  title          TEXT NOT NULL,
  department     TEXT,
  location       TEXT,
  employment_type TEXT DEFAULT 'Full-time',
  min_experience NUMERIC(4,1) DEFAULT 0,
  description    TEXT,

  -- The uploaded job description. jd_text is what the resume is actually scored against.
  jd_path        TEXT,
  jd_filename    TEXT,
  jd_text        TEXT,

  status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ON_HOLD','CLOSED')),
  created_by     INT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON jobs (company_id, status);

-- Pipeline stages
-- APPLIED -> SHORTLISTED -> INTERVIEW -> SELECTED -> OFFERED -> JOINED
-- terminal: REJECTED | ON_HOLD | WITHDRAWN
CREATE TABLE applications (
  id                 SERIAL PRIMARY KEY,
  ref_code           TEXT UNIQUE NOT NULL,          -- BSC-2607-0134
  company_id         INT NOT NULL REFERENCES companies(id),
  job_id             INT REFERENCES jobs(id),

  -- Stage 1: careers page (candidate)
  full_name          TEXT NOT NULL,
  email              TEXT NOT NULL,
  phone              TEXT NOT NULL,
  position_applied   TEXT NOT NULL,
  current_location   TEXT,          -- the three below, joined up, for display and search
  area               TEXT,
  city               TEXT,
  pincode            TEXT,
  total_experience   NUMERIC(4,1) DEFAULT 0,
  current_ctc        NUMERIC(12,2),
  expected_ctc       NUMERIC(12,2),
  notice_period_days INT,
  source             TEXT DEFAULT 'CAREERS_PAGE',   -- CAREERS_PAGE | REFERRAL | WALK_IN | HR_ENTRY

  resume_path        TEXT,
  resume_filename    TEXT,
  resume_text        TEXT,
  ai_summary         JSONB,                          -- see services/resume.js
  ai_status          TEXT DEFAULT 'PENDING' CHECK (ai_status IN ('PENDING','DONE','FAILED','SKIPPED')),

  -- Stage 2: full application form, filled on interview day via token link
  stage2_token       TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'),
  stage2_submitted_at TIMESTAMPTZ,
  details            JSONB,                          -- entire printed form (see web/src/pages/FullForm.jsx)

  status             TEXT NOT NULL DEFAULT 'APPLIED'
                     CHECK (status IN ('APPLIED','SHORTLISTED','INTERVIEW','SELECTED','OFFERED','JOINED','REJECTED','ON_HOLD','WITHDRAWN')),
  status_note        TEXT,
  interview_at       TIMESTAMPTZ,
  offered_ctc        NUMERIC(12,2),
  offer_designation  TEXT,
  offer_joining_date DATE,
  offer_letter_path  TEXT,
  offer_sent_at      TIMESTAMPTZ,
  offer_sent_by      INT REFERENCES users(id),
  assigned_to        INT REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON applications (company_id, status);
CREATE INDEX ON applications (email);

CREATE TABLE status_history (
  id             SERIAL PRIMARY KEY,
  application_id INT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_status    TEXT,
  to_status      TEXT NOT NULL,
  note           TEXT,
  changed_by     INT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON status_history (application_id);

-- Created automatically when an application is moved to JOINED
CREATE TABLE employees (
  id             SERIAL PRIMARY KEY,
  emp_code       TEXT UNIQUE NOT NULL,
  company_id     INT NOT NULL REFERENCES companies(id),
  application_id INT UNIQUE REFERENCES applications(id),
  full_name      TEXT NOT NULL,
  email          TEXT,
  phone          TEXT,
  designation    TEXT,
  department     TEXT,
  date_of_joining DATE,
  annual_ctc     NUMERIC(12,2),
  pan            TEXT,
  aadhaar        TEXT,
  blood_group    TEXT,
  date_of_birth  DATE,
  emergency_contact TEXT,
  details        JSONB,                       -- snapshot of application.details at joining
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','NOTICE','EXITED')),
  exit_date      DATE,
  exit_reason    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON employees (company_id, status);
