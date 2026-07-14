import jwt from 'jsonwebtoken';
import { q } from './db.js';

const SECRET = () => process.env.JWT_SECRET || 'dev-secret';

/** company_ids: every company this admin looks after. Empty for a super admin — they reach all of them by role. */
export const signToken = (user) =>
  jwt.sign(
    { id: user.id, role: user.role, company_ids: user.company_ids || [], name: user.name, email: user.email },
    SECRET(),
    { expiresIn: '12h' }
  );

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
  try {
    req.user = jwt.verify(token, SECRET());
    next();
  } catch {
    res.status(401).json({ error: 'Your session expired. Sign in again.' });
  }
}

export function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'SUPER_ADMIN')
    return res.status(403).json({ error: 'Only the super admin can do this.' });
  next();
}

/**
 * The whole tenancy model in one function. Returns an int[] of companies to filter on,
 * or null for "no filter" (super admin who has not narrowed the view).
 *
 * A super admin may narrow to one company with ?company=<id>.
 * An HR admin is confined to the companies assigned to them. Asking for one of theirs narrows
 * the view; asking for any other changes nothing — they still see only their own.
 */
export function companyFilter(req) {
  const asked = req.query.company ? Number(req.query.company) : null;

  if (req.user.role === 'SUPER_ADMIN') return asked ? [asked] : null;

  const mine = req.user.company_ids || [];
  if (asked && mine.includes(asked)) return [asked];
  return mine.length ? mine : [-1]; // an admin with no company assigned sees nothing
}

/** Guards a single row. */
export function assertCompanyAccess(req, res, companyId) {
  if (req.user.role === 'SUPER_ADMIN') return true;
  if (!(req.user.company_ids || []).includes(companyId)) {
    res.status(403).json({ error: 'That record belongs to a company you do not look after.' });
    return false;
  }
  return true;
}

export const loadCompanyIds = async (userId) => {
  const { rows } = await q('SELECT company_id FROM user_companies WHERE user_id=$1 ORDER BY company_id', [userId]);
  return rows.map((r) => r.company_id);
};
