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
      // WATI's dashboard sometimes gives the token already prefixed with "Bearer ". Don't double it.
      Authorization: String(process.env.WATI_TOKEN).startsWith('Bearer')
        ? process.env.WATI_TOKEN
        : `Bearer ${process.env.WATI_TOKEN}`,
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
  try { data = JSON.parse(text); } catch { /* WATI sometimes returns plain text */ }

  // Match the logic proven on the other group portals: WATI is a success UNLESS it explicitly
  // declines. A 200 with a sparse body is an accept — treating it as failure (as before) is what
  // produced "rejected" with an empty reason. Only an HTTP error, or result:false /
  // validWhatsAppNumber:false in the body, is a real rejection.
  const declined =
    !res.ok ||
    data.result === false ||
    data.result === 'false' ||
    data.validWhatsAppNumber === false;

  if (declined) {
    const why =
      data.info ||
      data.message ||
      (data.error && (data.error.message || data.error)) ||
      (text ? text.slice(0, 400) : `HTTP ${res.status} with an empty body`);
    console.error('WATI send failed:', why);
    return { sent: false, reason: String(why), status: res.status, raw: data, body: text.slice(0, 600) };
  }

  return { sent: true, status: res.status, raw: data, body: text.slice(0, 600) };
}
