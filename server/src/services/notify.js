import { one, q } from '../db.js';
import { sendMail, graphConfigured } from './graph.js';
import { getFile, putFile } from './storage.js';
import { renderApplicationFormHtml, applicationFormKey, applicationFormFilename } from './appform.js';

const MIME = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
};
const mimeFor = (name) => {
  const ext = (name || '').toLowerCase().match(/\.[a-z0-9]+$/);
  return (ext && MIME[ext[0]]) || 'application/octet-stream';
};

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

    // Attach the resume itself so HR reads it straight from the email. Graph takes the file inline on
    // sendMail while the request stays small; skip anything large so a big file never blocks the alert.
    let attachments;
    let resumeNote = app.resume_filename ? 'Attached in the portal' : 'Not attached';
    if (app.resume_path) {
      try {
        const buf = await getFile(app.resume_path);
        if (buf && buf.length <= 3 * 1024 * 1024) {
          attachments = [{
            name: app.resume_filename || `${app.ref_code} resume`,
            contentType: mimeFor(app.resume_filename),
            contentBytes: buf.toString('base64'),
          }];
          resumeNote = 'Attached to this email';
        } else if (buf) {
          resumeNote = 'In the portal (too large to attach)';
        }
      } catch (e) {
        console.error('resume attach failed:', e.message); // fall back to the portal link
      }
    }

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
          ${row('Resume', resumeNote)}
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
      attachments,         // the resume file, when it is small enough to go inline
      // Send the HR alert from the alerts mailbox (ai@ "BSG Alerts") when NOTIFY_FROM is set.
      // Candidate-facing emails are unaffected — they keep using GRAPH_MAIL_FROM (hr@).
      from: process.env.NOTIFY_FROM || undefined,
    });

    await mark(result.sent ? 'SENT' : 'FAILED', result.sent ? null : result.reason);
    return result;
  } catch (err) {
    await mark('FAILED', err.message);
    return { sent: false, reason: err.message };
  }
}

/**
 * Email the candidate their full-application-form link when HR moves them to Interview.
 * Sent to the candidate (app.email), from GRAPH_MAIL_FROM, with reply-to set to the HR mailbox
 * so the candidate can reply to a real person. Returns { sent, reason } — it never throws.
 */
export async function emailInterviewForm(appId) {
  try {
    const app = await one(
      `SELECT a.*, c.code AS company_code, c.name AS company_name
         FROM applications a JOIN companies c ON c.id = a.company_id
        WHERE a.id = $1`,
      [appId]
    );
    if (!app) return { sent: false, reason: 'Application not found.' };
    if (!app.email) return { sent: false, reason: 'Candidate has no email on file.' };
    if (!graphConfigured()) return { sent: false, reason: 'Email not configured.' };

    const base = (process.env.PUBLIC_WEB_URL || '').replace(/\/+$/, '');
    if (!base) return { sent: false, reason: 'PUBLIC_WEB_URL is not set.' };
    const link = `${base}/form/${app.stage2_token}`;

    const hrReply = process.env.GRAPH_MAIL_FROM || process.env.GRAPH_DRIVE_USER || 'hr@bharatsteels.in';
    const when = app.interview_at
      ? new Date(app.interview_at).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })
      : null;

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#101519">
        <p>Dear ${esc(app.full_name)},</p>
        <p>
          Thank you for applying for <strong>${esc(app.position_applied)}</strong> at
          ${esc(app.company_name)}. We would like to take your application forward to the interview stage.
        </p>
        ${when ? `<p><strong>Interview:</strong> ${esc(when)}</p>` : ''}
        <p>
          Please complete your full application form using the secure link below before your interview.
          It only takes a few minutes.
        </p>
        <p style="margin:22px 0">
          <a href="${link}" style="background:#0064a0;color:#fff;text-decoration:none;
             padding:12px 22px;border-radius:4px;font-weight:600;display:inline-block">
            Complete your application form
          </a>
        </p>
        <p style="color:#697178;font-size:13px">
          Or paste this link into your browser:<br>
          <a href="${link}">${link}</a>
        </p>
        <p style="color:#697178;font-size:13px;margin-top:20px">
          Reference: ${esc(app.ref_code)}. If you have any questions, simply reply to this email.
        </p>
        <p>Warm regards,<br>Recruitment Team, ${esc(app.company_name)}</p>
      </div>`;

    return await sendMail({
      to: app.email,
      subject: `Interview — complete your application form (${app.company_code} · ${app.ref_code})`,
      html,
      replyTo: hrReply,
    });
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

/**
 * Email the new joiner their full application form link, as onboarding — sent when HR marks the
 * candidate JOINED. Same secure /form/{token} link, but welcome-worded (no interview mention).
 * Returns { sent, reason }; never throws.
 */
export async function emailJoiningForm(appId) {
  try {
    const app = await one(
      `SELECT a.*, c.code AS company_code, c.name AS company_name
         FROM applications a JOIN companies c ON c.id = a.company_id
        WHERE a.id = $1`,
      [appId]
    );
    if (!app) return { sent: false, reason: 'Application not found.' };
    if (!app.email) return { sent: false, reason: 'Candidate has no email on file.' };
    if (!graphConfigured()) return { sent: false, reason: 'Email not configured.' };

    const base = (process.env.PUBLIC_WEB_URL || '').replace(/\/+$/, '');
    if (!base) return { sent: false, reason: 'PUBLIC_WEB_URL is not set.' };
    const link = `${base}/form/${app.stage2_token}`;

    const hrReply = process.env.GRAPH_MAIL_FROM || process.env.GRAPH_DRIVE_USER || 'hr@bharatsteels.in';

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#101519">
        <p>Dear ${esc(app.full_name)},</p>
        <p>
          Welcome to <strong>${esc(app.company_name)}</strong>. We are glad to have you on board as
          <strong>${esc(app.position_applied)}</strong>.
        </p>
        <p>
          To complete your joining formalities, please fill in your full application form using the
          secure link below. It only takes a few minutes, and the details go straight to our HR records.
        </p>
        <p style="margin:22px 0">
          <a href="${link}" style="background:#0064a0;color:#fff;text-decoration:none;
             padding:12px 22px;border-radius:4px;font-weight:600;display:inline-block">
            Complete your joining form
          </a>
        </p>
        <p style="color:#697178;font-size:13px">
          Or paste this link into your browser:<br>
          <a href="${link}">${link}</a>
        </p>
        <p style="color:#697178;font-size:13px;margin-top:20px">
          Reference: ${esc(app.ref_code)}. If you have any questions, simply reply to this email.
        </p>
        <p>Warm regards,<br>HR Team, ${esc(app.company_name)}</p>
      </div>`;

    return await sendMail({
      to: app.email,
      subject: `Welcome aboard — complete your joining form (${app.company_code} · ${app.ref_code})`,
      html,
      replyTo: hrReply,
    });
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

/** Email the candidate their private AI first-round interview link. */
export async function emailAiInterview(appId) {
  try {
    const app = await one(
      `SELECT a.*, c.code AS company_code, c.name AS company_name
         FROM applications a JOIN companies c ON c.id = a.company_id
        WHERE a.id = $1`,
      [appId]
    );
    if (!app) return { sent: false, reason: 'Application not found.' };
    if (!app.email) return { sent: false, reason: 'Candidate has no email on file.' };
    if (!app.interview_token) return { sent: false, reason: 'No interview link for this candidate.' };
    if (!graphConfigured() && !process.env.BREVO_API_KEY) return { sent: false, reason: 'Email not configured.' };

    const base = (process.env.PUBLIC_WEB_URL || '').replace(/\/+$/, '');
    if (!base) return { sent: false, reason: 'PUBLIC_WEB_URL is not set.' };
    const link = `${base}/interview/${app.interview_token}`;

    const hrReply = process.env.GRAPH_MAIL_FROM || process.env.GRAPH_DRIVE_USER || 'hr@bharatsteels.in';

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#101519">
        <p>Dear ${esc(app.full_name)},</p>
        <p>
          Thank you for applying for <strong>${esc(app.position_applied)}</strong> at
          ${esc(app.company_name)}. As the first step, we would like you to complete a short
          <strong>short video interview</strong>. It takes about five minutes.
        </p>
        <p style="margin:6px 0 0"><strong>Before you start:</strong></p>
        <ul style="margin:6px 0 0;padding-left:20px;color:#3a434b">
          <li>Use a laptop or phone with a working camera and microphone.</li>
          <li>Find a quiet, well-lit spot and a stable internet connection.</li>
          <li>You'll introduce yourself first, then answer a few questions. Each answer is up to 30 seconds.</li>
        </ul>
        <p style="margin:22px 0">
          <a href="${link}" style="background:#0a2b66;color:#fff;text-decoration:none;
             padding:12px 22px;border-radius:4px;font-weight:600;display:inline-block">
            Start interview
          </a>
        </p>
        <p style="color:#697178;font-size:13px">
          Or paste this link into your browser:<br>
          <a href="${link}">${link}</a>
        </p>
        <p style="color:#697178;font-size:13px;margin-top:20px">
          Reference: ${esc(app.ref_code)}. Please complete it at the earliest. If you have any questions,
          simply reply to this email.
        </p>
        <p>Warm regards,<br>Recruitment Team, ${esc(app.company_name)}</p>
      </div>`;

    return await sendMail({
      to: app.email,
      subject: `Your first-round interview (${app.company_code} · ${app.ref_code})`,
      html,
      replyTo: hrReply,
    });
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

/**
 * When a candidate submits their full application form: render it as a document, file it in
 * OneDrive under "Employee Master Data Report", and email it to HR with the form attached.
 * Fire-and-forget from the submit route — returns { sent, saved, reason }; never throws.
 */
export async function fileAndEmailApplicationForm(appId) {
  try {
    const app = await one(
      `SELECT a.*, c.code AS company_code, c.name AS company_name
         FROM applications a JOIN companies c ON c.id = a.company_id
        WHERE a.id = $1`,
      [appId]
    );
    if (!app) return { sent: false, saved: false, reason: 'Application not found.' };

    const details = app.details || {};
    const html = renderApplicationFormHtml(app, details);
    const buffer = Buffer.from(html, 'utf8');

    // 1) File it in OneDrive: ATS/Employee Master Data Report/<name>_<ref>.html (folder auto-created).
    let saved = false;
    let saveError = null;
    try {
      await putFile(applicationFormKey(app), buffer, 'text/html; charset=utf-8');
      saved = true;
    } catch (e) {
      saveError = e.message;
      console.error('application form OneDrive save failed:', e.message);
    }

    // 2) Email it to HR, with the form attached.
    let sent = false;
    let sendReason = null;
    if (!graphConfigured()) {
      sendReason = 'Email not configured.';
    } else {
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

      const body = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#101519">
          <p style="font-size:15px;margin:0 0 4px"><strong>Application form submitted</strong></p>
          <p style="color:#697178;margin:0 0 16px">
            ${esc(app.full_name)} (${esc(app.ref_code)}, ${esc(app.company_name)}) has completed their full
            application form. A copy is attached, and it is filed in OneDrive under
            <strong>ATS / Employee Master Data Report</strong>.
          </p>
          ${link
            ? `<p style="margin:0 0 18px">
                 <a href="${link}" style="background:#0064a0;color:#fff;text-decoration:none;
                    padding:10px 18px;border-radius:4px;font-weight:600;display:inline-block">Open in the ATS</a>
               </p>`
            : ''}
          <p style="color:#8b939a;font-size:12px;margin:0">Sent automatically by the Bharat Steel Group recruitment portal.</p>
        </div>`;

      const result = await sendMail({
        to: recipients,
        subject: `Application form — ${app.full_name} (${app.company_code} · ${app.ref_code})`,
        html: body,
        replyTo: app.email,
        attachments: [{
          name: applicationFormFilename(app),
          contentType: 'text/html',
          contentBytes: buffer.toString('base64'),
        }],
        from: process.env.NOTIFY_FROM || undefined,
      });
      sent = !!result.sent;
      sendReason = result.reason || null;
    }

    return { sent, saved, reason: sendReason || saveError || null };
  } catch (err) {
    return { sent: false, saved: false, reason: err.message };
  }
}
