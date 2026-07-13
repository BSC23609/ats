# Get it live — no terminal, no local setup

Three websites, about fifteen minutes. You fill in web forms; they do the rest.

Your code is already on GitHub at **`BSC23609/ats`** — that's all that was needed.

Nothing here touches your PC. Skip Codespaces entirely.

---

## Step 1 — The database (Neon) · 4 minutes

1. Go to **neon.tech** → **Sign in with GitHub**.
2. **Create project**:
   - Name: `bsg-ats`
   - Region: **Singapore** (closest to Chennai — anything else adds lag to every click)
3. It lands you on a page showing a **connection string**. There's a dropdown above it — make sure it says
   **Pooled connection**. The string looks like:

   ```
   postgresql://neondb_owner:AbC123@ep-cool-name-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

4. **Copy it.** Paste it into Notepad for a minute — you need it in Step 2.

That's the database done. You don't create any tables — the API does that by itself the first time it starts.

---

## Step 2 — The API (Render) · 6 minutes

1. **render.com** → **Sign in with GitHub**.
2. **New +** (top right) → **Web Service**.
3. Find **`BSC23609/ats`** in the list → **Connect**.
4. Fill in the form:

   | Field | Value |
   |---|---|
   | Name | `bsg-ats-api` |
   | Region | **Singapore** |
   | Branch | `main` |
   | **Root Directory** | **`server`** ← easy to miss, nothing works without it |
   | Runtime | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | **Starter — $7/mo** (see the note at the bottom) |

5. Scroll to **Environment Variables** → **Add Environment Variable**, four times:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Neon string you copied |
   | `JWT_SECRET` | mash the keyboard — 40+ random characters, anything |
   | `ANTHROPIC_API_KEY` | your `sk-ant-…` key (leave blank for now if you don't have one) |
   | `ANTHROPIC_MODEL` | `claude-sonnet-5` |

6. **Create Web Service**. It builds for 2–3 minutes.

7. Watch the log at the bottom. When it works, you'll see:

   ```
   ATS API listening on 10000
   Empty database — creating tables and seed data…

     ┌──────────────────────────────────────────────────────┐
     │  Set up. Sign in with:                               │
     │    superadmin@bharatsteels.in                        │
     │    Bharat@2026                                       │
     └──────────────────────────────────────────────────────┘
   ```

   **That's the database creating itself.** No terminal, no commands.

8. Copy your API address from the top of the page — something like
   **`https://bsg-ats-api.onrender.com`**. You need it in Step 3.

9. Sanity check: open `https://bsg-ats-api.onrender.com/api/health` in a browser. You want:
   ```json
   {"ok":true,"ai":true,"storage":"local disk (/opt/render/project/src/server/uploads)"}
   ```
   `"ai":false` just means no Anthropic key — everything works, resumes simply aren't scored.

---

## Step 3 — The website (Vercel) · 4 minutes

1. **vercel.com** → **Sign in with GitHub**.
2. **Add New…** → **Project** → find **`ats`** → **Import**.
3. On the configure screen:
   - **Root Directory** → click **Edit** → select the **`web`** folder → Continue
   - Framework: it should say **Vite** on its own. Leave everything else.
4. Expand **Environment Variables** and add one:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | your Render address, e.g. `https://bsg-ats-api.onrender.com` |

   No trailing slash.

5. **Deploy.** Two minutes.

6. Vercel gives you a URL like `https://ats-xyz.vercel.app`. **Open it.** You get the sign-in page.

---

## Step 4 — Tell the API where the website is · 2 minutes

The API needs to know your Vercel address for two reasons: to allow the browser to call it (CORS), and to build the
interview-day form links.

1. Back in **Render** → your service → **Environment** (left menu) → add two more:

   | Key | Value |
   |---|---|
   | `PUBLIC_WEB_URL` | your Vercel URL, e.g. `https://ats-xyz.vercel.app` |
   | `WEB_ORIGINS` | the same URL |

2. **Save changes.** Render redeploys itself (~2 min).

Without this, sign-in fails with a CORS error and every interview-day link you copy will be broken.

---

## Step 5 — Sign in and try it

Open your Vercel URL.

**Email:** `superadmin@bharatsteels.in`
**Password:** `Bharat@2026`

Then, in this order:

1. **Settings** → change that password immediately. It's published in a public README.
2. **Openings** → pick a role → **Upload JD** → paste in a real job description → Save.
3. Add `/careers` to the end of your URL. Apply as a fake candidate with a real resume PDF.
4. **Pipeline** → within ten seconds the candidate appears **with a score out of 10**. Click them and read why.

If that works, the system works.

---

## What you have not set up yet (and don't need to, today)

| | What happens without it |
|---|---|
| **Cloudflare R2** (file storage) | Resumes are stored on Render's disk, which is **wiped on every redeploy**. Fine for testing, not for real candidates. |
| **Custom domain** | You're on `ats-xyz.vercel.app` instead of `careers.bharatsteels.in`. Works, just not yours. |
| **HR email** | Offer letters can be uploaded and stored, but not emailed. |

Add all three once you're satisfied the app does what you want. SETUP.md covers each.

---

## The one thing I'd not economise on

Render's **free tier sleeps after 15 minutes idle**, and the next request takes ~40 seconds to wake it. While you're
testing that's an annoyance. The day a candidate opens your careers page and it hangs for 40 seconds, they close the
tab and you never know it happened.

**Starter is $7/month (~₹600).** It's the difference between a demo and a system.

---

## If something goes wrong

| What you see | What it means |
|---|---|
| Render build fails immediately | **Root Directory** isn't set to `server`. |
| Log says "Could not reach the database" | `DATABASE_URL` is wrong. Re-copy the **pooled** string from Neon. |
| Sign-in says "server could not complete that request" | `WEB_ORIGINS` on Render doesn't exactly match your Vercel URL — check https, and no trailing slash. |
| Sign-in says "email or password is wrong" | The database seeded, but you mistyped. It's `superadmin@bharatsteels.in` / `Bharat@2026`. |
| Resumes upload but never score | Check `/api/health` for `"ai":true`. If false, the Anthropic key isn't set. |

**Render → Logs** is where the truth lives. Copy anything red and send it to me.
