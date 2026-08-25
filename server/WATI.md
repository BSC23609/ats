# WhatsApp password reset (WATI)

An HR admin who forgets their password can reset it over WhatsApp: they enter their email, a
six-digit code goes to the mobile on their account, and they set a new password with it.

## What you need

- The **otp_password2** template, already approved on your WATI account (the same one the Metfraa
  and BSC Tickets portals use). Authentication category, one `{{1}}` variable, Copy-code button.
- Each HR admin must have a **mobile number on file**. Add it in HR admins → Edit → WhatsApp mobile.
  No number, no reset by WhatsApp — the code has nowhere to go.

## Turn it on

Set these on Render (service → Environment):

```
WATI_BASE_URL     https://live-mt-server.wati.io/XXXXXX      ← from WATI, no trailing slash
WATI_TOKEN        <the Bearer token from WATI → API Docs>
WATI_OTP_TEMPLATE otp_password2                              ← optional, this is the default
```

Save; Render redeploys. Nothing else to configure.

## How to read the number field

WATI wants the country code. The app is forgiving about how you type it — `9876543210`,
`098765 43210`, `+91 98765 43210` all become `919876543210`. For a non-Indian number, type the
full international form.

## How it behaves

- The code is **six digits, valid ten minutes**, and dies after **five wrong guesses**.
- It is **hashed** in the database, never stored in the clear.
- Asking for a new code cancels the old one.
- The "forgot password" screen gives the **same answer whether or not the email exists** — it never
  reveals who has an account.

## If a code doesn't arrive

| Cause | Check |
|---|---|
| No number on the account | HR admins → Edit → is a WhatsApp mobile set? |
| WATI not configured | `WATI_BASE_URL` and `WATI_TOKEN` set on Render? |
| Template name wrong | It must be `otp_password2`, approved and live in WATI. |
| Number not on WhatsApp | The reset only works for numbers with an active WhatsApp account. |

When WATI isn't configured, the server logs the code to the Render console instead of sending it —
so you can still test the flow before WATI is wired up.
