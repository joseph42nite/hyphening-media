/**
 * Marketing Ops Center — Outbound Mail
 * Thin nodemailer wrapper over SMTP (Google Workspace by default).
 * Configured entirely from .env so the provider can change without code changes.
 */

import nodemailer from 'nodemailer';

let transporter = null;

export function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465 = implicit TLS; 587 upgrades via STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Email the sales inbox about a new website lead.
 * Reply-To is the visitor, so replying goes straight to them.
 */
export async function sendLeadNotification(lead) {
  if (!isMailConfigured()) throw new Error('SMTP is not configured (SMTP_HOST / SMTP_USER / SMTP_PASS)');

  const to = process.env.LEAD_NOTIFY_TO || 'deepanjan@hypheningmedia.com';
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const who = lead.company_name ? `${lead.client_name} (${lead.company_name})` : lead.client_name;

  const rows = [
    ['Name', lead.client_name],
    ['Email', lead.email],
    ['Company / Website', lead.company_name],
    ['Area of focus', lead.industry],
    ['Form', lead.source],
    ['Received', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST'],
  ].filter(([, v]) => v);

  const text = [
    'New enquiry from the Hyphening Media website.',
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Message:',
    lead.notes || '(none)',
    '',
    `Saved in the Ops Center as lead #${lead.id}. Reply to this email to answer them directly.`,
  ].join('\n');

  const html = `
    <p>New enquiry from the Hyphening Media website.</p>
    <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      ${rows.map(([k, v]) => `<tr><td style="color:#666">${escapeHtml(k)}</td><td><strong>${escapeHtml(v)}</strong></td></tr>`).join('')}
    </table>
    <p style="font-family:sans-serif;font-size:14px"><strong>Message</strong><br>${escapeHtml(lead.notes || '(none)').replace(/\n/g, '<br>')}</p>
    <p style="font-family:sans-serif;font-size:12px;color:#888">Saved in the Ops Center as lead #${lead.id}. Reply to this email to answer them directly.</p>`;

  return getTransporter().sendMail({
    from,
    to,
    replyTo: lead.email || undefined,
    subject: `[Website enquiry] ${who}`,
    text,
    html,
  });
}
