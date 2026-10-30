# Automatic HR email on new applications

When a candidate submits an application on the careers page, the ATS emails the HR admins who
look after that company. The pipeline's **HR email** column shows whether each notification was
sent, and lets you re-send if it failed.

## What you must do once (Azure)

The email uses the **same Microsoft 365 app registration** that already powers OneDrive — it just
needs one more permission.

1. **portal.azure.com** → Microsoft Entra ID → App registrations → open **BSG-ATS**.
2. **API permissions** → Add a permission → Microsoft Graph → **Application permissions**.
3. Search **`Mail.Send`** → tick it → Add permissions.
4. Click **✓ Grant admin consent** → Yes. It must show *Granted* with a green tick.

That is the only change. No new secret, no new app.

## Settings (Render → Environment)

```
GRAPH_MAIL_FROM   hr@bharatsteels.in     ← the mailbox the notifications are sent FROM
NOTIFY_EMAILS                            ← optional extra recipients, comma-separated
```

`GRAPH_MAIL_FROM` must be a real, licensed mailbox in your tenant (hr@bharatsteels.in works —
it is the same one OneDrive uses). Leave `NOTIFY_EMAILS` blank unless you also want a central
inbox copied on every application.

## Who gets the email

- The active **HR admins assigned to that candidate's company** (from HR admins → their companies).
- Plus anyone in `NOTIFY_EMAILS`.
- If none resolve, it falls back to **hr@bharatsteels.in** so a notification never goes nowhere.

Super admins are **not** copied on every application (they hold no single company), so the group
inbox isn't flooded. Add a super admin's address to `NOTIFY_EMAILS` if they want everything.

## Replying

The email's **reply-to is set to the candidate**, so HR can reply straight from their inbox to
contact the applicant. It is sent from `GRAPH_MAIL_FROM`.

## If the column shows "Failed"

Hover the **Failed** chip to see the reason, then **Resend** after fixing it:

| Reason | Fix |
|---|---|
| `403 (grant Mail.Send …)` | The Mail.Send permission is missing or not consented — do the Azure steps above. |
| `Email not configured` → shows as **Not sent** | The GRAPH_* variables aren't set on this service. |
| Any other Graph error | The message text names it; usually the from-mailbox is wrong or unlicensed. |

Until Mail.Send is granted, applications still work normally — the column just shows **Not sent**,
and you can **Send** each one manually once it's configured.
