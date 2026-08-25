/**
 * WATI — WhatsApp, for the password-reset OTP. Same integration as the other group portals.
 *
 * Env:
 *   WATI_BASE_URL   e.g. https://live-mt-server.wati.io/xxxxx  (no trailing slash)
 *   WATI_TOKEN      the Bearer token from WATI → API Docs
 *   WATI_OTP_TEMPLATE  defaults to otp_password2
 *
 * The template otp_password2 is Authentication-category: a single {{1}} variable (the code)
 * and a Copy-code button. Nothing else to configure.
 */

const TEMPLATE = process.env.WATI_OTP_TEMPLATE || 'otp_password2';

export function watiConfigured() {
  return Boolean(process.env.WATI_BASE_URL && process.env.WATI_TOKEN);
}

/** WATI wants the number as digits with country code, no +, no spaces. 98… → 9198… */
export function normalisePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10) d = '91' + d;                 // bare Indian mobile
  if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d;
}

export async function sendOtp(phone, code) {
  if (!watiConfigured()) {
    // In development the code is logged instead of sent, so the flow can be exercised without WATI.
    console.log(`[wati not configured] OTP for ${phone}: ${code}`);
    return { sent: false, reason: 'WATI not configured' };
  }

  const to = normalisePhone(phone);
  if (!to) return { sent: false, reason: 'No usable phone number' };

  const value = String(code || '').trim();
  if (!value) return { sent: false, reason: 'Refusing to send a blank code (Meta rejects it).' };

  const url = `${process.env.WATI_BASE_URL}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(to)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WATI_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template_name: TEMPLATE,
      broadcast_name: `pwd_reset_${Date.now()}`,
      // Authentication templates take exactly one parameter for the code, and the Copy-code
      // button reads that same value.
      parameters: [{ name: '1', value }],
    }),
  });

  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { /* WATI sometimes returns plain text on error */ }

  // WATI answers 200 even when it refuses — the real verdict is in the body.
  const okFlag = data.result === true || data.result === 'success' || data.validWhatsAppNumber === true;
  if (!res.ok || data.result === false || data.result === 'failure') {
    const why = data.info || data.message || (typeof text === 'string' ? text.slice(0, 300) : `HTTP ${res.status}`);
    console.error('WATI send failed:', why);
    return { sent: false, reason: why, raw: data };
  }
  return { sent: true, raw: data };
}
