import nodemailer from 'nodemailer';
import { decrypt } from '../auth.js';

/**
 * Emails the offer letter the HR admin uploaded, from that HR admin's own mailbox.
 * Nothing is generated here — the PDF is whatever they attached.
 */
export async function sendOfferLetter({ app, company, sender, fileBuffer }) {
  if (!sender.smtp_host || !sender.smtp_user || !sender.smtp_pass_enc || !sender.from_email)
    throw Object.assign(
      new Error('Set up your outgoing email under Settings before sending offer letters.'),
      { status: 400 }
    );

  const transporter = nodemailer.createTransport({
    host: sender.smtp_host,
    port: sender.smtp_port || 587,
    secure: (sender.smtp_port || 587) === 465,
    auth: { user: sender.smtp_user, pass: decrypt(sender.smtp_pass_enc) },
  });

  const designation = app.offer_designation || app.position_applied;
  const named = company.name.replace(/\.$/, '');

  await transporter.sendMail({
    from: `"${sender.name}" <${sender.from_email}>`,
    to: app.email,
    cc: sender.from_email,     // the HR admin keeps a copy of what went out
    replyTo: sender.from_email,
    subject: `Letter of offer — ${designation}, ${named}`,
    text:
      `Dear ${app.full_name},\n\n` +
      `Please find attached our letter of offer for the position of ${designation} at ${named}.\n\n` +
      `Kindly confirm your acceptance by replying to this email. If you have any questions, reply here and I will help.\n\n` +
      `Regards,\n${sender.name}\n${sender.signature || 'Human Resources'}\n${named}`,
    attachments: [{ filename: `Offer letter — ${app.full_name}.pdf`, content: fileBuffer }],
  });
}
