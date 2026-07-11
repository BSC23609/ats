# Start here

You do not need to install anything on your PC. GitHub gives you a Linux machine in the browser — Node, Postgres,
a terminal, an editor — and this repo is set up so that machine configures itself.

## 1. Put the code on GitHub

Go to github.com → **New repository** → name it `ats` → **Private** → Create.

On the next screen GitHub shows you an upload link: *"uploading an existing file"*. Click it, drag the unzipped
project folder in, and commit. (No git commands needed. If you'd rather use git, the usual `init / add / commit /
push` works too.)

## 2. Open it in a Codespace

On the repo page: **Code ▾** → **Codespaces** tab → **Create codespace on main**.

Wait about three minutes. It is installing Node, starting Postgres, creating the database, installing the
dependencies and seeding four companies, five logins and four sample openings. You'll see it happening in the
terminal. When it stops, it prints:

```
Ready. Add your Anthropic key to server/.env to switch on resume scoring, then run: npm start
```

## 3. Add your Anthropic key

In the file explorer on the left, open **server/.env**. Find this line:

```
ANTHROPIC_API_KEY=
```

Paste your key after the `=`, and save (Ctrl+S). Get the key from console.anthropic.com → API keys. Top up $5 of
credit; scoring a resume costs about a rupee.

You can skip this. Everything else works — resumes are stored and downloadable, they just aren't scored.

## 4. Run it

In the terminal:

```bash
npm start
```

Both servers start. A box pops up bottom-right saying a port is available — click **Open in Browser**. If you miss
it, go to the **Ports** tab and click the globe icon next to port 5173.

## 5. Try the whole flow

Sign in as `superadmin@bharatsteels.in` / `Bharat@2026`.

1. **Openings** → pick a role → **Upload JD** → paste in a real job description → Save.
2. Open `/careers` in a new tab (add `/careers` to the end of the URL). Apply as a fake candidate and attach a real
   resume PDF.
3. Back in **Pipeline** — within about ten seconds the candidate appears with a score out of 10. Click them: you'll
   see why they got that score, which JD requirements the resume evidences, and which it doesn't.
4. On the candidate page, copy the **form link** and open it. That's what a candidate fills in on interview day.
5. Move them along the pipeline. Mark them Joined and check the employee record appears under **Employees**.

That is the entire system. If it does all that, it works, and you can deploy it for real — see **DEPLOY.md**.

---

### Things worth knowing

**Your Codespace sleeps** after 30 minutes idle and is deleted after 30 days unused. The free allowance is 60
hours/month, which is plenty for testing. Reopen it any time from **Code → Codespaces**; your data survives a sleep.

**The database here is throwaway.** It lives inside the Codespace. This is for trying things out — not for real
candidate data. Real data goes in Neon, per DEPLOY.md.

**The careers page is publicly reachable** while the Codespace runs, if you set port 5173 to Public in the Ports
tab. Handy for showing someone. Don't leave real applications sitting in it.

**Something broke?** Copy the red text from the terminal and send it over. First-run errors are normal and usually
one line to fix.
