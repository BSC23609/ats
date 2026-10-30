import { one, q } from '../db.js';
import { sendMail, graphConfigured } from './graph.js';

const money = (n) => (n == null || n === '' ? '—' : '₹' + Number(n).toLocaleString('en-IN'));
const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Email the HR team when a candidate applies, and record the outcome on the application row
 * (notify_status / notify_at / notify_error) so the pipeline can show a send log.
 *
 * Recipients are the active HR admins who look after that candidate's company, plus anything in
 * NOTIFY_EMAILS (a comma-separated central inbox, optional). If none resolve, it falls back to
 * hr@bharatsteels.in so a notification never silently goes nowhere.
 *
 * Fire-and-forget safe: it never throws, and a failure is written to notify_error, not surfaced
 * to the candidate.
 */
export async function notifyHrOfApplication(appId) {
  const app = await one(
    `SELECT a.*, c.code AS company_code, c.name AS company_name
       FROM applications a JOIN companies c ON c.id = a.company_id
      WHERE a.id = $1`,
    [appId]
  );
  if (!app) return { sent: false, reason: 'Application not found.' };

  const mark = (status, error) =>
    q(`UPDATE applications SET notify_status=$2, notify_at=now(), notify_error=$3 WHERE id=$1`,
      [appId, status, error ? String(error).slice(0, 300) : null]);

  if (!graphConfigured()) {
    await mark('SKIPPED', 'Email not configured');
    return { sent: false, reason: 'Email not configured.' };
  }

  try {
    // HR admins who hold this company. Super admins carry no company rows, so they aren't spammed
    // with every application across the group.
    const { rows } = await q(
      `SELECT DISTINCT u.email
         FROM users u JOIN user_companies uc ON uc.user_id = u.id
        WHERE uc.company_id = $1 AND u.active AND u.email IS NOT NULL AND u.email <> ''`,
      [app.company_id]
    );
    const extra = (process.env.NOTIFY_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
    let recipients = [...new Set([...rows.map((r) => r.email), ...extra])];
    if (!recipients.length) recipients = ['hr@bharatsteels.in'];

    const base = (process.env.PUBLIC_WEB_URL || '').replace(/\/+$/, '');
    const link = base ? `${base}/applications/${app.id}` : null;
    const location =
      [app.area, app.city, app.pincode].map((x) => (x || '').trim()).filter(Boolean).join(', ') ||
      app.current_location || '—';

    const row = (label, value) =>
      `<tr><td style="padding:6px 14px 6px 0;color:#697178;white-space:nowrap">${label}</td>` +
      `<td style="padding:6px 0;color:#101519;font-weight:500">${value}</td></tr>`;

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#101519">
        <p style="font-size:15px;margin:0 0 4px"><strong>New application received</strong></p>
        <p style="color:#697178;margin:0 0 18px">
          ${esc(app.full_name)} has applied for <strong>${esc(app.position_applied)}</strong>
          at ${esc(app.company_name)}.
        </p>
        <table style="border-collapse:collapse;font-size:14px;margin-bottom:18px">
          ${row('Reference', esc(app.ref_code))}
          ${row('Company', esc(app.company_name))}
          ${row('Role', esc(app.position_applied))}
          ${row('Candidate', esc(app.full_name))}
          ${row('Mobile', esc(app.phone))}
          ${row('Email', esc(app.email))}
          ${row('Location', esc(location))}
          ${row('Experience', app.total_experience != null ? esc(app.total_experience) + ' yrs' : '—')}
          ${row('Expected salary', money(app.expected_ctc))}
          ${row('Notice period', app.notice_period_days != null ? esc(app.notice_period_days) + ' days' : '—')}
          ${row('Resume', app.resume_filename ? 'Attached in the portal' : 'Not attached')}
        </table>
        ${link
          ? `<p style="margin:0 0 20px">
               <a href="${link}" style="background:#0064a0;color:#fff;text-decoration:none;
                  padding:10px 18px;border-radius:4px;font-weight:600;display:inline-block">
                 Open in the ATS
               </a>
             </p>`
          : ''}
        <p style="color:#8b939a;font-size:12px;margin:0">
          Reply to this email to respond to the candidate directly. Sent automatically by the
          Bharat Steel Group recruitment portal.
        </p>
      </div>`;

    const result = await sendMail({
      to: recipients,
      subject: `New application — ${app.full_name} for ${app.position_applied} (${app.company_code})`,
      html,
      replyTo: app.email, // so HR can reply straight to the candidate
    });

    await mark(result.sent ? 'SENT' : 'FAILED', result.sent ? null : result.reason);
    return result;
  } catch (err) {
    await mark('FAILED', err.message);
    return { sent: false, reason: err.message };
  }
}
