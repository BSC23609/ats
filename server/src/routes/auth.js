import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, q } from '../db.js';
import { signToken, requireAuth, encrypt } from '../auth.js';

const r = Router();

/** Name, role and the companies this person looks after. */
async function profile(userId) {
  const user = await one(
    `SELECT id, name, email, role, active, smtp_host, smtp_port, smtp_user, from_email, signature,
            (smtp_pass_enc IS NOT NULL) AS smtp_password_set
       FROM users WHERE id = $1`,
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

/** Outgoing mail settings — offer letters go out from this mailbox, under this person's name. */
r.put('/email-settings', requireAuth, async (req, res) => {
  const { smtp_host, smtp_port, smtp_user, smtp_pass, from_email, signature } = req.body;
  if (!smtp_host || !smtp_user || !from_email)
    return res.status(400).json({ error: 'Mail server, username and From address are all required.' });

  await q(
    `UPDATE users SET smtp_host=$1, smtp_port=$2, smtp_user=$3, from_email=$4, signature=$5,
            smtp_pass_enc = COALESCE($6, smtp_pass_enc)
      WHERE id=$7`,
    [
      smtp_host,
      Number(smtp_port) || 587,
      smtp_user,
      from_email,
      signature || null,
      smtp_pass ? encrypt(smtp_pass) : null, // blank means "keep the password already stored"
      req.user.id,
    ]
  );
  res.json({ ok: true });
});

export default r;
