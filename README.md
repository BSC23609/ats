# Bharat Steel Group — Applicant Tracking System

Self-hosted recruitment system for the four group companies: **BSC**, **Metfraa**, **Crayon** and **G2**.

Node/Express + Postgres + React (Vite). No cloud dependency except the Anthropic API, which is optional.

---

## How a candidate moves through it

1. **Careers page** (`/careers`, public) — the candidate picks a role and fills the short form: name, contact,
   experience, current and expected salary, notice period, resume.
2. **Resume score** — HR uploads a job description against each opening. Every resume for that role is read and
   scored **out of 10 against that JD**, with the requirements the resume evidences listed beside the ones it does
   not. The pipeline can be sorted best-match-first, so a pile of 60 applicants becomes a reading order. Uploading
   or replacing a JD re-scores everyone already in the pipeline for that role, so the scores stay comparable.

   The score is a triage aid, not a verdict. It reads what a resume *claims* — a well-written resume from a mediocre
   candidate will outscore a terse one from a good candidate. The met/missing requirement lists are the checkable
   part; use those, and never auto-reject on the number.
3. **Interview day** — HR copies the candidate's form link from their detail page. The candidate opens it and
   fills the **full printed application form**: personal details, PAN/Aadhaar, marital status, children, family
   background, emergency contacts, education from SSLC, previous employment with salary on joining and leaving,
   reason for leaving, previous company HR contacts, expected salary, joining date, health, declaration.
4. **Pipeline** — Applied → Shortlisted → Interview → Selected → Offered → Joined, plus Rejected / On hold /
   Withdrawn. Every move is written to the history with a note and the admin who made it.
5. **Offer letter** — the letter is written, signed and sent outside this system, however HR prefers. The signed
   copy is uploaded here for the record: it files itself into OneDrive and the candidate moves to Offered. Nothing
   is emailed from the app.
6. **Joined** — the employee record is created automatically from the full form. No re-typing.

## Who sees what

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | All four companies. Creates and disables HR admins, assigns their companies, resets passwords. |
| `HR_ADMIN` | **One or more** companies, chosen by the super admin. An admin can look after just Metfraa, or Metfraa and Crayon, or all four. |

Scoping is enforced server-side on every query, so an HR admin cannot reach a company they were not assigned
even by editing the URL. Anyone holding more than one company gets a company picker at the top of the pipeline,
employee and openings pages. Company assignments are carried in the sign-in token, so a change takes effect the
next time that admin signs in.

Sign-in is a plain email and password held in this system — no Microsoft 365 SSO.

## Setup

**Easiest — GitHub Codespaces, nothing to install:** see **QUICKSTART.md**. Push the repo, open a Codespace, and it
provisions Postgres, seeds the database and installs everything on its own. `npm start` runs both servers.

**On your own machine:**

```bash
# 1. Database
docker compose up -d                 # or point DATABASE_URL at your own Postgres

# 2. API
cd server
cp .env.example .env                 # set JWT_SECRET and ANTHROPIC_API_KEY
npm install
npm run db:init                      # creates the schema, 4 companies, 5 users, 4 sample openings
npm run dev                          # http://localhost:4000

# 3. Web
cd ../web
npm install
npm run dev                          # http://localhost:5173
```

### Seeded logins

Password for all of them is `SEED_PASSWORD` from `.env` (default `Bharat@2026`). **Change these before going live.**

| Email | Role |
|---|---|
| superadmin@bharatsteels.in | Super admin — all companies |
| hr.bsc@bharatsteels.in | HR admin — Bharat Steel Chennai |
| hr.metfraa@bharatsteels.in | HR admin — Metfraa |
| hr.crayon@bharatsteels.in | HR admin — Crayon Roofings |
| hr.g2@bharatsteels.in | HR admin — G2 |

### The AI overview

Set `ANTHROPIC_API_KEY` in `server/.env`. Leave it blank and everything else still works — the resume is stored and
downloadable, the overview panel just reports that no analysis ran. `POST /api/applications/:id/reanalyse` re-runs it
(useful after adding the key, or when a scanned PDF fails to read).

The model is set by `ANTHROPIC_MODEL` (default `claude-sonnet-5`).

## Deploying

See **DEPLOY.md** — GitHub + Neon (Postgres) + Render (API) + Vercel (frontend) + Cloudflare R2 (files), with the
reason the API does not belong on Vercel. To keep it on your own hardware instead, set `STORAGE_DRIVER=local`, serve
`web/dist` from IIS or nginx, and run the API under pm2.

## Layout

```
server/src
  schema.sql          tables, roles, pipeline statuses
  init-db.js          schema + seed
  auth.js             JWT, requireAuth, requireSuperAdmin, company scoping
  services/resume.js  PDF/DOCX text extraction + the Claude overview
  routes/
    auth.js           login, me, change password
    public.js         openings, stage-1 apply, stage-2 form by token
    applications.js   list, detail, resume download, status moves, re-analyse
    admin.js          employees, jobs, users
web/src
  api.jsx             fetch wrapper, auth context, formatters
  pages/              Login, Careers, FullForm, Pipeline, ApplicationDetail, Employees, Jobs, Users, Settings
  styles.css          the design system
```

## Not built yet

Interview scheduling with panel records and candidate acknowledgement emails at each stage. Both fit on top of
this without reshaping the data model.
