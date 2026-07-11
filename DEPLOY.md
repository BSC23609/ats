# Deploying

The app is two pieces that deploy separately, plus a database and a bucket.

| Piece | Where | Why there |
|---|---|---|
| React frontend | **Vercel** | Static files. Free, instant, custom domain in two clicks. |
| Express API | **Render** | Needs a long-lived process (see below). Free tier works. |
| Postgres | **Neon** | Free tier, no server to run. |
| Files | **Cloudflare R2** | Resumes, JDs, offer letters. Free egress. Any S3-compatible bucket works. |

## Why the API is not on Vercel

Two reasons, both of which would bite you quietly rather than loudly:

1. **The resume scoring runs after the response is sent.** The candidate gets "Application received" immediately, and
   Claude reads and scores the resume in the background. A Vercel serverless function is frozen the instant it
   responds, so that work would be killed halfway — the candidate sees success, and HR sees a score that never
   arrives.
2. **Vercel's filesystem is ephemeral.** Even with object storage configured, a serverless setup adds cold starts on
   an API that HR uses interactively.

Render runs an ordinary Node process, so neither problem exists. If you'd rather keep everything on your own
hardware, skip Render and run `npm start` behind nginx or IIS — the code is identical, just set
`STORAGE_DRIVER=local`.

---

## 1. GitHub

```bash
cd bsg-ats
git init && git add . && git commit -m "ATS"
gh repo create bharat-steel/ats --private --source=. --push
```

`.gitignore` already excludes `.env`, `node_modules/` and `uploads/`. Check that `server/.env` is **not** in the
first commit — it holds your API key.

## 2. Neon — the database

1. Create a project at neon.tech. Region: **Singapore** (closest to Chennai).
2. Copy the **pooled** connection string (it has `-pooler` in the host).
3. Run the schema once, from your own machine:

```bash
cd server
DATABASE_URL="postgres://…neon.tech/…?sslmode=require" npm run db:init
```

That creates the tables and seeds the four companies, the super admin and one HR admin each. TLS is handled
automatically — `db.js` detects a Neon URL and turns SSL on.

## 3. Cloudflare R2 — the files

1. R2 → Create bucket, e.g. `bsg-ats-files`. Keep it **private**; the API streams files to signed-in users, so the
   bucket never needs public access.
2. Create an R2 API token with Object Read & Write.
3. Note the endpoint: `https://<account-id>.r2.cloudflarestorage.com`.

## 4. Render — the API

New → Web Service → connect the repo. Render reads `render.yaml`, or set it manually:

- Root directory: `server`
- Build: `npm install`  ·  Start: `npm start`
- Health check: `/api/health`

Environment variables:

```
DATABASE_URL           the Neon pooled string
JWT_SECRET             a long random string (Render can generate it)
ANTHROPIC_API_KEY      from console.anthropic.com
ANTHROPIC_MODEL        claude-sonnet-5
STORAGE_DRIVER         s3
S3_BUCKET              bsg-ats-files
S3_ENDPOINT            https://<account-id>.r2.cloudflarestorage.com
S3_REGION              auto
S3_ACCESS_KEY_ID       from the R2 token
S3_SECRET_ACCESS_KEY   from the R2 token
PUBLIC_WEB_URL         https://careers.bharatsteels.in
WEB_ORIGINS            https://careers.bharatsteels.in
```

`WEB_ORIGINS` is the CORS allowlist. Leave it unset and any site can call your API — set it.

Hit `https://<your-api>.onrender.com/api/health` when it's up. It should report `ok`, whether AI scoring is on, and
which storage driver it's using.

> **On the free tier**, Render sleeps the service after 15 minutes idle and the next request takes ~40 seconds. For
> HR that's an annoyance; for a candidate mid-application it looks broken. The $7 starter plan removes it. Worth it.

## 5. Vercel — the frontend

New Project → same repo → **Root Directory: `web`**. Vercel detects Vite on its own.

One environment variable, at build time:

```
VITE_API_URL = https://bsg-ats-api.onrender.com
```

`vercel.json` already rewrites all paths to `index.html`, which is what makes `/careers` and the interview-day link
`/form/<token>` work on a hard refresh.

## 6. Domains

- `careers.bharatsteels.in` → Vercel (CNAME)
- `ats-api.bharatsteels.in` → Render (CNAME)

Then update `PUBLIC_WEB_URL`, `WEB_ORIGINS` and `VITE_API_URL` to the real names and redeploy both. Getting
`PUBLIC_WEB_URL` wrong is the classic mistake — the interview-day form links are built from it, and they'll point at
`localhost` until you fix it.

---

## After it's up

1. Sign in as `superadmin@bharatsteels.in` and **change every seeded password**.
2. Assign each HR admin their companies (one admin can hold several).
3. Each HR admin sets up outgoing email under Settings — Microsoft 365 is `smtp.office365.com:587` with an **app
   password**. If your tenant has security defaults on, SMTP AUTH is disabled and you'll need to allow it per mailbox.
4. Post the openings and **upload a job description for each one** — without a JD the resume score is based on the
   job title alone and isn't worth much.

## Running costs

| | |
|---|---|
| Neon free tier | ₹0 — plenty for this volume |
| Cloudflare R2 | ₹0 under 10 GB |
| Vercel hobby | ₹0 |
| Render starter | ~₹600/month (free tier works, but sleeps) |
| Claude API | a few paise per resume |
