'use strict';

const nodemailer = require('nodemailer');

const hasSmtp = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
if (hasSmtp) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function isConfigured() {
  return hasSmtp;
}

/**
 * Attempts to forward a report by email. Returns { sent: boolean, reason?: string }.
 * Never throws — a failed/unconfigured send just means the report stays queued.
 */
async function sendReportEmail({ to, subject, text, attachmentPath }) {
  if (!hasSmtp) {
    return { sent: false, reason: 'SMTP_NOT_CONFIGURED' };
  }
  if (!to) {
    return { sent: false, reason: 'NO_AUTHORITY_EMAIL' };
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      attachments: attachmentPath ? [{ path: attachmentPath }] : [],
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

module.exports = { isConfigured, sendReportEmail };
