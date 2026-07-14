# OneDrive

Resumes, job descriptions and offer letters are filed in OneDrive, and a master Excel workbook of
employees and candidates is kept in step automatically.

## What appears in OneDrive

```
ATS/
├── Bharat Steel Group - Employee Master.xlsx
├── Resumes/
│   ├── BSC/           BSC-2607-0004 - S Kumar.pdf
│   ├── METFRAA/       METFRAA-2607-0001 - R Karthikeyan.pdf
│   ├── CRAYON/
│   └── G2/
├── Job Descriptions/
│   ├── METFRAA/       Design Engineer - PEB.pdf
│   └── BSC/           Sales Executive - Steel.docx
└── Offer Letters/
    └── METFRAA/       METFRAA-2607-0001 - R Karthikeyan.pdf
```

Files are named by reference code and candidate, so the folder is browsable without the app.

## The master workbook

Two sheets, rebuilt from the database on every change — never hand-edited, and it cannot drift.

**Employees** — one row per person, carrying the whole printed form: employee code, company,
designation, department, joining date, salary, PAN, Aadhaar, blood group, date of birth, marital
status, spouse, children, father, mother, both addresses, emergency contact, highest qualification,
previous employer and reason for leaving, state of health, and exit details.

**Candidates** — everyone in the pipeline: reference, company, role, status, **match score**,
experience, expected and offered salary, notice period, whether the full form is in, whether the
offer went out, and the AI resume headline.

It rewrites itself when a candidate is marked **Joined**, when an employee record is edited or an
exit is recorded, and whenever anyone clicks **Sync to OneDrive** on the Employees page.

> Because the file is replaced wholesale, **do not edit it in Excel and expect your edits to stick**.
> It is a report, not a database. Change things in the app; the sheet follows.

## Setting it up

You already run this pattern on the other portals, so the app registration may exist — if it does,
reuse it and skip to step 4.

1. **Azure Portal** → App registrations → **New registration**. Name it `BSG-ATS`. Single tenant.
2. **Certificates & secrets** → **New client secret** → copy the *value* immediately (it is shown once).
3. **API permissions** → Add → Microsoft Graph → **Application permissions** → `Files.ReadWrite.All`
   → then **Grant admin consent**. It must be *Application*, not Delegated — no user signs in here.
4. **Overview** → copy the Directory (tenant) ID and the Application (client) ID.
5. Set these on Render:

```
STORAGE_DRIVER       onedrive
GRAPH_TENANT_ID      <directory (tenant) ID>
GRAPH_CLIENT_ID      <application (client) ID>
GRAPH_CLIENT_SECRET  <the secret VALUE, not the secret ID>
GRAPH_DRIVE_USER     hr@bharatsteels.in     ← whose OneDrive holds the folder
GRAPH_ROOT_FOLDER    ATS
```

6. Check `/api/health`. You want:

```json
"onedrive": "connected — hr@bharatsteels.in/ATS"
```

## If it will not connect

| `/api/health` says | Cause |
|---|---|
| `not configured` | One of the four GRAPH_* variables is missing. |
| `unreachable (401)` | Wrong secret, or you pasted the secret **ID** instead of its **value**. |
| `unreachable (403)` | Permission is Delegated, not Application — or admin consent was never granted. |
| `unreachable (404)` | `GRAPH_DRIVE_USER` has no OneDrive. Have them open OneDrive once in a browser to provision it. |

Client secrets expire — Azure defaults to 6 or 24 months. Put the expiry date in a calendar. When it
lapses, uploads stop and `/api/health` turns to `401`, with nothing else broken.
