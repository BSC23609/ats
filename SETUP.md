# Bharat Steel Group ATS — complete setup

Everything from naming to going live. Work through it in order. Nothing gets installed on your PC.

**Time:** about 30 minutes to have it running and testable. Another 60–90 to have it live on your own domain.

---

# Part 0 — Decisions to make before you touch anything

Five names. Write them down now; you will type them into several different websites and they must match.

| What | Suggested | Where it's used |
|---|---|---|
| GitHub repo | `bharat-steel-ats` | GitHub, and Render/Vercel both read from it |
| Careers site address | `careers.bharatsteels.in` | Candidates see this. Goes on Vercel. |
| API address | `ats-api.bharatsteels.in` | Nobody sees this. Goes on Render. |
| Neon project | `bsg-ats` | Just a label |
| R2 bucket | `bsg-ats-files` | Resumes, JDs, offer letters live here |

**One decision that matters more than it looks:** the careers subdomain. It appears in every job posting, every
interview-day link, and every email a candidate gets. `careers.bharatsteels.in` reads as the group; if you'd rather
each company had its own (`careers.metfraa.com`), that's a bigger change — tell me before you start and I'll adjust
the code. The system supports all four companies on one careers page today.

### Accounts you need

| Account | Sign up with | Cost |
|---|---|---|
| GitHub | your work email | Free |
| Anthropic Console (console.anthropic.com) | work email | Pay per use, ~₹1.20/resume |
| Neon (neon.tech) | sign in with GitHub | Free tier |
| Cloudflare (dash.cloudflare.com) | work email | Free |
| Render (render.com) | sign in with GitHub | Free tier works, $7/mo recommended |
| Vercel (vercel.com) | sign in with GitHub | Free |

Sign in to Neon, Render and Vercel **with GitHub**. It saves a lot of connecting later.

---

# Part 1 — Put the code on GitHub (10 minutes)

Use **push.bat**, not drag-and-drop. Dragging files into the browser silently skips folders whose names begin with a
dot — and `.devcontainer` is one of them. Without it the Codespace won't configure itself, and you'd spend an hour
wondering why.

### 1.1 — Install Git (once)

Download from **https://git-scm.com/download/win** and install with every default option. Nothing to configure.

### 1.2 — Create an empty repo on GitHub

1. **github.com** → top right **+** → **New repository**
2. Name: `bharat-steel-ats`
3. Select **Private**. Not optional — a public repo with a leaked API key gets drained within hours by bots that
   scan GitHub for exactly that.
4. **Do not tick** "Add a README", and leave .gitignore and licence as None. The repo must be completely empty or
   the first push is rejected.
5. **Create repository**. Copy the URL from the address bar:
   `https://github.com/your-name/bharat-steel-ats`

### 1.3 — Push

1. Unzip `bsg-ats.zip`.
2. Double-click **push.bat** inside the folder.
3. It asks for your name and email (stored once, on this PC), then the repository URL you just copied.
4. It lists every file it's about to send, asks for a message (press Enter), and pushes. A browser window opens the
   first time to sign you in to GitHub.

`push.bat` sends everything — dotfiles included — and deliberately excludes `node_modules`, `uploads/` and your
`.env`, so your Anthropic key never reaches GitHub.

**Check afterwards:** on the repo page you should see `.devcontainer`, `server`, `web`, and the four `.md` files.
If `.devcontainer` isn't listed, stop and tell me.

> **From now on**, any time you change something on your PC, just run `push.bat` again. It commits and pushes the
> difference.

---

# Part 2 — Get your Anthropic key (5 minutes)

1. **console.anthropic.com** → sign up → **Settings → Billing** → add **$5** of credit.
2. **API keys** → **Create key** → name it `bsg-ats` → copy it. It starts `sk-ant-`.
3. **Copy it somewhere safe now.** The console will never show it to you again.
4. While you're there: **Settings → Limits** → set a monthly spend limit. ₹2,000 is generous — you'll spend a
   fraction of that. This is your safety net, not a budget.

At about ₹1.20 per resume, $5 scores roughly 350 candidates.

---

# Part 3 — Run it in a Codespace (10 minutes)

This is a full Linux computer in your browser. Nothing installs on your PC.

1. On your repo page: **Code ▾** → **Codespaces** tab → **Create codespace on main**.
2. A VS Code editor opens in the browser. Wait ~3 minutes. In the terminal at the bottom you'll see it start
   Postgres, create the database, install dependencies, and seed the data. It finishes with:
   ```
   Seeded. Every user password: Bharat@2026
   ```
3. In the file list on the left, open **`server`** → **`.env`**. Find:
   ```
   ANTHROPIC_API_KEY=
   ```
   Paste your key after the `=`. **Ctrl+S** to save.
4. In the terminal, type:
   ```
   npm start
   ```
5. A box appears bottom-right: *"Your application running on port 5173 is available."* Click **Open in Browser**.
   (Missed it? **Ports** tab at the bottom → globe icon next to 5173.)

You now have the whole system running.

---

# Part 4 — Test it properly (15 minutes)

Do not skip this. It's how you find out whether it does what you actually want *before* you've spent an evening on
DNS records.

**Sign in:** `superadmin@bharatsteels.in` / `Bharat@2026`

### 4.1 — Post a real opening with a real JD
- **Openings** → **Post an opening** → pick Metfraa, title it something you're actually hiring for → Post.
- On that row, click **Upload JD**. Paste in the real job description — or upload the Word file. Save.
- The row now shows **On file**. Every resume for that role will be scored against it.

### 4.2 — Apply as a candidate
- Add `/careers` to the end of your browser's address bar and press enter.
- Pick the role. Fill it in with a fake name and **attach a real resume PDF** — use one you already have.
- Submit. You get a reference number.

### 4.3 — Look at what HR sees
- Go back, click **Pipeline**. Within ~10 seconds the candidate appears with a **score out of 10**.
- Click them. You should see: the score, a plain-English reason for it, the JD requirements the resume evidences,
  and the ones it doesn't.
- **This is the moment of truth.** Read that score against a resume you know well. If it's judging sensibly, the
  system is worth deploying. If it isn't, tell me what it got wrong and I'll tune the prompt.

### 4.4 — The interview-day form
- On the candidate page, copy the **form link**. Open it in a new tab.
- That is your printed application form — family background, education from SSLC, previous employment with salary
  on joining and leaving, declaration. Fill it in and submit.

### 4.5 — Hire them
- Back on the candidate: move them **Shortlisted → Interview → Selected**.
- Upload any PDF as an offer letter, choose **Save without sending** (email isn't set up yet).
- Move them to **Joined**. Now open **Employees** — their record is there, built from the form. Nobody typed it.

If all five worked, deploy it.

---

# Part 5 — The production database: Neon (10 minutes)

1. **neon.tech** → sign in with GitHub → **Create project**.
2. Name: `bsg-ats`. Region: **Singapore** — the closest to Chennai; anything else adds lag to every page load.
3. On the dashboard, copy the connection string. **Use the one marked "Pooled connection"** — it has `-pooler` in
   the hostname. The unpooled one will exhaust its connections and start failing under load.
4. Back in your Codespace terminal, create the real tables (press Ctrl+C first to stop the servers):
   ```bash
   cd server
   DATABASE_URL="paste-your-neon-string-here" npm run db:init
   cd ..
   ```
   It prints the seeded logins again. Your production database now exists.

---

# Part 6 — File storage: Cloudflare R2 (10 minutes)

Resumes, JDs and offer letters need somewhere permanent. Render's disk gets wiped on every deploy.

1. **dash.cloudflare.com** → **R2** → enable it (it asks for a card; the free tier is 10 GB and you won't approach it).
2. **Create bucket** → name `bsg-ats-files` → **Location: Asia-Pacific** → Create.
3. Leave it **private**. The API hands files to signed-in users; the bucket itself never needs to be public.
4. **Manage R2 API Tokens** → **Create API token** → permission **Object Read & Write** → scope it to this bucket
   → Create.
5. Copy and keep three things:
   - Access Key ID
   - Secret Access Key
   - The endpoint: `https://<your-account-id>.r2.cloudflarestorage.com`

---

# Part 7 — The API: Render (15 minutes)

1. **render.com** → sign in with GitHub → **New +** → **Web Service**.
2. Connect your `bharat-steel-ats` repo.
3. Settings:
   - **Name:** `bsg-ats-api`
   - **Root Directory:** `server` ← easy to miss, and nothing works without it
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Region:** Singapore
   - **Instance type:** Starter ($7/mo). See the warning below.
4. **Environment Variables** — add these one at a time:

   ```
   DATABASE_URL           <your Neon pooled string>
   JWT_SECRET             <click Generate, or any 40+ random characters>
   ANTHROPIC_API_KEY      sk-ant-...
   ANTHROPIC_MODEL        claude-sonnet-5
   STORAGE_DRIVER         s3
   S3_BUCKET              bsg-ats-files
   S3_ENDPOINT            https://<account-id>.r2.cloudflarestorage.com
   S3_REGION              auto
   S3_ACCESS_KEY_ID       <from R2>
   S3_SECRET_ACCESS_KEY   <from R2>
   PUBLIC_WEB_URL         https://careers.bharatsteels.in
   WEB_ORIGINS            https://careers.bharatsteels.in
   ```

   The last two point at the careers site you haven't built yet. Put the final address in now and it'll be correct
   when you get there.

5. **Create Web Service.** Wait for the build.
6. Visit `https://bsg-ats-api.onrender.com/api/health`. You want:
   ```json
   { "ok": true, "ai": true, "storage": "s3 (bsg-ats-files)" }
   ```
   `"ai": false` means the Anthropic key didn't take. `"storage": "local disk..."` means `STORAGE_DRIVER` isn't set
   to `s3`.

> ⚠️ **The free tier sleeps after 15 minutes idle**, and the next request takes ~40 seconds to wake it. While you're
> testing, that's an annoyance. The day a candidate opens your careers page and it hangs for 40 seconds, they close
> the tab. $7/month removes it entirely. This is the one thing I would not economise on.

---

# Part 8 — The careers site: Vercel (10 minutes)

1. **vercel.com** → sign in with GitHub → **Add New → Project** → import `bharat-steel-ats`.
2. **Root Directory:** click Edit → choose **`web`**. Vercel detects Vite automatically.
3. **Environment Variables** — add one:
   ```
   VITE_API_URL = https://bsg-ats-api.onrender.com
   ```
   (Your Render URL. This is baked in at build time, so if you change it later you must redeploy.)
4. **Deploy.**
5. Open the URL Vercel gives you. You should see the sign-in page. Sign in and confirm the pipeline loads — that
   proves Vercel is talking to Render, which is talking to Neon.

---

# Part 9 — Your own domain (15 minutes + DNS wait)

In whatever manages DNS for `bharatsteels.in`:

| Type | Name | Points to |
|---|---|---|
| CNAME | `careers` | `cname.vercel-dns.com` |
| CNAME | `ats-api` | `bsg-ats-api.onrender.com` |

Then:
- **Vercel** → Project → Settings → Domains → add `careers.bharatsteels.in`.
- **Render** → Service → Settings → Custom Domain → add `ats-api.bharatsteels.in`.

Both will issue HTTPS certificates on their own within a few minutes.

**Then update three variables and redeploy:**
- Render: `PUBLIC_WEB_URL` and `WEB_ORIGINS` → `https://careers.bharatsteels.in`
- Vercel: `VITE_API_URL` → `https://ats-api.bharatsteels.in` → then **Redeploy** (Vercel bakes this in at build
  time; changing the variable alone does nothing).

> **The classic mistake:** forgetting `PUBLIC_WEB_URL`. Interview-day form links are built from it. Get it wrong and
> every link you send a candidate points at a dead address — and you won't notice until a candidate tells you.

---

# Part 10 — Email for offer letters (15 minutes)

Offer letters go out from each HR admin's **own mailbox**, so the candidate's reply lands in their inbox rather than
a shared one.

### Do this first, as tenant admin

Microsoft 365 disables SMTP AUTH by default when security defaults are on. If you skip this, your HR staff will type
their password in, hit save, and get a failure they can't diagnose.

1. **Microsoft 365 admin centre** → Users → pick the HR user → **Mail** tab → **Manage email apps** → tick
   **Authenticated SMTP** → Save. Repeat per HR mailbox.
2. Each HR user needs an **app password**, not their normal password. If your tenant has MFA on, they generate one
   at **mysignins.microsoft.com/security-info** → Add sign-in method → App password.

If your tenant blocks app passwords entirely, tell me — the alternative is OAuth2, which is a code change.

### Then, each HR admin

Sign in → **Settings** → Outgoing email:
```
Mail server:  smtp.office365.com
Port:         587
Send from:    their own address
Username:     their own address
App password: the generated one
Signature:    e.g. "Manager — Human Resources"
```
Save. The badge should read **Ready**.

---

# Part 11 — Go live (20 minutes)

Working through this in order, as super admin:

- [ ] **Change all five seeded passwords.** They're published in the README. HR admins page → Reset password.
      Do the super admin's too, under Settings.
- [ ] **Assign each HR admin their companies.** HR admins → Companies. One person can hold several — tick all that
      apply. They see the change at their next sign-in.
- [ ] **Delete the test candidates** you created in the Codespace — those were in the throwaway database, so this is
      only relevant if you tested against Neon.
- [ ] **Post the real openings** for all four companies.
- [ ] **Upload a JD for every single one.** A role without a JD gets scored against its job title alone, and that
      score is close to meaningless. The openings table shows you which ones are missing.
- [ ] **Each HR admin sets up their outgoing email** (Part 10).
- [ ] **Run one real candidate all the way through** — apply, score, interview-day form, offer, joined — before you
      publish the link anywhere.
- [ ] **Publish `careers.bharatsteels.in`** on the group sites and on LinkedIn.

---

# What it costs to run

| | Monthly |
|---|---|
| Neon (Postgres) | ₹0 |
| Cloudflare R2 (files) | ₹0 |
| Vercel (careers site) | ₹0 |
| Render (API) | ~₹600 — the free tier works but sleeps |
| Claude API | ~₹1.20 per resume scored |

**Roughly ₹600–800/month** for a hundred candidates.

---

# When something breaks

| Symptom | Where to look |
|---|---|
| Careers page loads, sign-in fails | Render logs. Usually `DATABASE_URL`. |
| Sign-in works, pipeline is empty and console shows CORS errors | `WEB_ORIGINS` on Render doesn't match your Vercel address exactly (https, no trailing slash). |
| Resumes upload but never get scored | `/api/health` — check `"ai": true`. Then check credit in the Anthropic console. |
| Score appears but says "no job description" | You didn't upload a JD for that opening. |
| Interview-day links point at localhost | `PUBLIC_WEB_URL` on Render. |
| Offer letter won't send | SMTP AUTH is off for that mailbox in M365, or they used their password instead of an app password. |
| First request each morning takes 40 seconds | Render free tier sleeping. Upgrade to Starter. |

**Render → Logs** is where the truth lives. Copy the red text and send it to me.

---

# What isn't built yet

- Candidate acknowledgement emails at each stage (they only hear from you at the offer)
- Interview scheduling with panel records
- Candidate acceptance — the reply comes to the HR admin's inbox, so someone still clicks Joined manually

None of these need the data model to change. Say the word on any of them.
