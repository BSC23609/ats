import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, q } from '../db.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { signToken, requireAuth, requireSuperAdmin } from '../auth.js';
import { sendOtp, normalisePhone, watiConfigured } from '../services/wati.js';

const r = Router();

/** Name, role and the companies this person looks after. */
async function profile(userId) {
  const user = await one(
    `SELECT id, name, email, role, active, phone FROM users WHERE id = $1`,
    [userId]
  );
  if (!user) return null;

  const { rows: companies } = await q(
    user.role === 'SUPER_ADMIN'
      ? `SELECT id, code, name, colour FROM companies WHERE active ORDER BY id`
      : `SELECT c.id, c.code, c.name, c.colour
           FROM user_companies uc JOIN companies c ON c.id = uc.company_id
          WHERE uc.user_id = $1 AND c.active ORDER BY c.id`,
    user.role === 'SUPER_ADMIN' ? [] : [userId]
  );

  user.companies = companies;
  user.company_ids = companies.map((c) => c.id);
  return user;
}

r.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const found = await one('SELECT id, password_hash FROM users WHERE lower(email)=lower($1) AND active', [
    email || '',
  ]);
  if (!found || !(await bcrypt.compare(password || '', found.password_hash)))
    return res.status(401).json({ error: 'Email or password is wrong.' });

  const user = await profile(found.id);
  // An HR admin who has been assigned no company can sign in but would see nothing — say so plainly.
  if (user.role === 'HR_ADMIN' && !user.company_ids.length)
    return res.status(403).json({ error: 'No company has been assigned to you yet. Ask the super admin.' });

  // The token carries company_ids, so a reassignment takes effect the next time they sign in.
  res.json({ token: signToken(user), user });
});

/* ------------------------------------------------------------------ *
 *  Group single sign-on (app.thebharatsteelgroup.com)
 *  The group portal signs the person in once, then the web app posts its one-minute token here.
 *  It is signed with GROUP_SSO_SECRET, shared only by the portal and this API. We check it, find
 *  the user by email and hand back a normal ATS session — the same as a password login.
 * ------------------------------------------------------------------ */
r.post('/sso', async (req, res) => {
  const secret = process.env.GROUP_SSO_SECRET;
  if (!secret) return res.status(401).json({ error: 'Group sign-in is not set up on ATS yet.' });
  let claims;
  try {
    claims = jwt.verify(String(req.body?.token || ''), secret, {
      algorithms: ['HS256'], issuer: 'bsg-hub',
      audience: process.env.GROUP_SSO_APP_KEY || 'ats', clockTolerance: 10,
    });
  } catch (e) {
    return res.status(401).json({ error: e.name === 'TokenExpiredError'
      ? 'That sign-in link expired. Open ATS again from the group portal.'
      : 'Group sign-in could not be verified.' });
  }
  const ident = String(claims.sub || '').trim().toLowerCase();
  const email = String(claims.email || '').trim().toLowerCase();
  const candidates = [ident.includes('@') ? ident : null, email || null].filter(Boolean);
  let found = null;
  for (const e of candidates) {
    found = await one('SELECT id FROM users WHERE lower(email)=$1 AND active', [e]);
    if (found) break;
  }
  if (!found) return res.status(401).json({ error: 'Your group account is not linked to an ATS user. Ask IT to check your email in the group portal.' });
  const user = await profile(found.id);
  if (user.role === 'HR_ADMIN' && !user.company_ids.length)
    return res.status(403).json({ error: 'No company has been assigned to you yet. Ask the super admin.' });
  res.json({ token: signToken(user), user });
});

r.get('/me', requireAuth, async (req, res) => res.json(await profile(req.user.id)));

r.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });

  const user = await one('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!(await bcrypt.compare(current_password || '', user.password_hash)))
    return res.status(400).json({ error: 'Current password is wrong.' });

  await q('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(new_password, 10), req.user.id]);
  res.json({ ok: true });
});


/* ------------------------------------------------------------------ *
 *  Password reset over WhatsApp
 *
 *  Two steps: request a code, then submit the code with a new password.
 *  Design points, all deliberate:
 *   - The request endpoint ALWAYS replies the same way, whether or not the email exists. Telling
 *     a stranger "no such account" hands them a way to discover who has logins.
 *   - The code is six digits, hashed before storage, valid ten minutes, and dies after five wrong
 *     guesses — so it can't be brute-forced in its short life.
 *   - Any older codes for the same user are cleared when a new one is issued.
 * ------------------------------------------------------------------ */

const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;
const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

r.post('/forgot-password', async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  // The same answer either way — never reveal whether an account exists.
  const vague = { ok: true, message: 'If that email has an account with a mobile number on file, a code is on its way.' };
  if (!email) return res.json(vague);

  const user = await one('SELECT id, phone, active FROM users WHERE email=$1', [email]);
  if (!user || !user.active || !user.phone) return res.json(vague);

  const code = String(crypto.randomInt(100000, 1000000)); // always six digits
  await q('DELETE FROM password_otps WHERE user_id=$1', [user.id]); // one live code at a time
  await q(
    `INSERT INTO password_otps (user_id, code_hash, expires_at)
     VALUES ($1, $2, now() + interval '${OTP_TTL_MIN} minutes')`,
    [user.id, hashCode(code)]
  );

  const sent = await sendOtp(user.phone, code);
  if (!sent.sent) console.error(`OTP for user ${user.id} not delivered: ${sent.reason}`);

  // Still vague — a WATI hiccup should not become a way to probe accounts.
  res.json(vague);
});

r.post('/reset-password', async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const code = String(req.body.code || '').trim();
  const newPassword = req.body.new_password || '';

  if (newPassword.length < 8)
    return res.status(400).json({ error: 'The new password must be at least 8 characters.' });

  const user = await one('SELECT id FROM users WHERE email=$1 AND active', [email]);
  if (!user) return res.status(400).json({ error: 'That code is wrong or has expired.' });

  const otp = await one(
    'SELECT * FROM password_otps WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',
    [user.id]
  );
  if (!otp) return res.status(400).json({ error: 'That code is wrong or has expired.' });

  if (new Date(otp.expires_at) < new Date()) {
    await q('DELETE FROM password_otps WHERE id=$1', [otp.id]);
    return res.status(400).json({ error: 'That code has expired. Ask for a new one.' });
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await q('DELETE FROM password_otps WHERE id=$1', [otp.id]);
    return res.status(400).json({ error: 'Too many wrong tries. Ask for a new code.' });
  }
  if (otp.code_hash !== hashCode(code)) {
    await q('UPDATE password_otps SET attempts = attempts + 1 WHERE id=$1', [otp.id]);
    return res.status(400).json({ error: 'That code is wrong or has expired.' });
  }

  // Correct. Set the password and burn the code.
  await q('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(newPassword, 10), user.id]);
  await q('DELETE FROM password_otps WHERE user_id=$1', [user.id]);
  res.json({ ok: true });
});


/**
 * WATI diagnostic. Super admin only. Sends a real test code to ?phone= (or your own number on
 * file) and returns exactly what WATI said — so a failed reset can be diagnosed without digging
 * through server logs. Mirrors the /reports/wati-test endpoint on the other portals.
 */
r.get('/wati-test', requireAuth, requireSuperAdmin, async (req, res) => {
  const config = {
    WATI_BASE_URL: process.env.WATI_BASE_URL ? 'set' : 'MISSING',
    WATI_TOKEN: process.env.WATI_TOKEN ? 'set' : 'MISSING',
    template: process.env.WATI_OTP_TEMPLATE || 'otp_password2',
    configured: watiConfigured(),
  };

  let phone = req.query.phone;
  if (!phone) {
    const me = await one('SELECT phone FROM users WHERE id=$1', [req.user.id]);
    phone = me?.phone;
  }
  if (!phone)
    return res.json({ config, error: 'No phone to test. Add ?phone=91XXXXXXXXXX or set your own mobile.' });

  const result = await sendOtp(phone, '123456'); // a fixed obvious test code
  res.json({
    config,
    normalised_number: normalisePhone(phone),
    result,
    hint:
      result.sent
        ? 'WATI accepted it. If no message arrives: the number has no WhatsApp, or the template is not approved/live.'
        : 'WATI rejected it — see result.reason above.',
  });
});

export default r;
