"""
HR email notification on a new application, via Microsoft Graph (app-only sendMail).

Reuses the same Azure app and token as onedrive.py. To enable, the Azure app
needs the APPLICATION permission **Mail.Send** (admin-consent granted), on top of
Files.ReadWrite.All. Mail is sent FROM the GRAPH_SENDER mailbox TO HR_NOTIFY_EMAIL.

Called fire-and-forget from the apply flow, so a mail hiccup never blocks the
candidate's submission.
"""
import httpx

from config import get_settings, STAGE_BY_KEY, load_form_fields
import onedrive

settings = get_settings()
GRAPH = "https://graph.microsoft.com/v1.0"


def notify_configured() -> bool:
    """True only when Graph creds + a sender + at least one recipient are set."""
    return (
        onedrive.graph_configured()
        and bool(settings.GRAPH_SENDER)
        and bool(settings.HR_NOTIFY_EMAIL)
    )


def _recipients():
    return [a.strip() for a in settings.HR_NOTIFY_EMAIL.split(",") if a.strip()]


def _html(candidate) -> str:
    company = candidate.company
    company_name = company.name if company else ""
    company_code = company.code if company else ""
    stage = STAGE_BY_KEY.get(candidate.stage, {}).get("label", candidate.stage)
    link = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/candidates/{candidate.id}"

    data = candidate.form_data or {}
    rows = [
        ("Candidate", candidate.name or "—"),
        ("Position", candidate.position or "—"),
        ("Company", f"{company_name} ({company_code})"),
        ("Source", candidate.source or "—"),
        ("Phone", candidate.phone or "—"),
        ("Email", candidate.email or "—"),
    ]
    # a few extra useful fields if present
    for key, label in (("total_experience", "Experience"),
                        ("current_location", "Location"),
                        ("expected_ctc", "Expected CTC")):
        if data.get(key):
            rows.append((label, str(data.get(key))))

    tr = "".join(
        f'<tr><td style="padding:6px 14px 6px 0;color:#64748b;font-size:13px;">{k}</td>'
        f'<td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:600;">{v}</td></tr>'
        for k, v in rows
    )
    return f"""\
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
  <div style="background:#0f2740;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0;">
    <div style="font-size:12px;letter-spacing:1px;opacity:.8;">NEW JOB APPLICATION</div>
    <div style="font-size:20px;font-weight:800;margin-top:2px;">{candidate.name or 'New candidate'}</div>
    <div style="font-size:13px;opacity:.9;">{candidate.position or ''} &middot; {company_name}</div>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:0;padding:18px 20px;border-radius:0 0 10px 10px;">
    <table style="border-collapse:collapse;width:100%;">{tr}</table>
    <div style="margin-top:18px;">
      <a href="{link}" style="background:#1273b8;color:#fff;text-decoration:none;font-weight:600;
         font-size:14px;padding:10px 18px;border-radius:8px;display:inline-block;">
        Open candidate in ATS
      </a>
    </div>
    <p style="color:#94a3b8;font-size:11px;margin-top:16px;">
      Current status: {stage}. This is an automated notification from the Group ATS.
    </p>
  </div>
</div>"""


def send_new_application_email(candidate):
    """Best-effort HR notification. Never raises to the caller."""
    if not notify_configured():
        return False
    try:
        token = onedrive._get_token()
    except Exception as e:  # noqa: BLE001
        print("notify: token failed:", e)
        return False

    company_code = candidate.company.code if candidate.company else ""
    subject = f"New application: {candidate.name} — {candidate.position} ({company_code})"
    payload = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": _html(candidate)},
            "toRecipients": [{"emailAddress": {"address": a}} for a in _recipients()],
        },
        "saveToSentItems": True,
    }
    url = f"{GRAPH}/users/{settings.GRAPH_SENDER}/sendMail"
    try:
        r = httpx.post(
            url,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=payload, timeout=30,
        )
        if r.status_code == 202:
            return True
        print("notify: sendMail failed", r.status_code, r.text[:300])
        return False
    except Exception as e:  # noqa: BLE001
        print("notify: send error:", e)
        return False
