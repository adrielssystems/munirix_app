import { google } from 'googleapis';

function encodeMimeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(String(subject || ''), 'utf8').toString('base64')}?=`;
}

function toBase64Url(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function isSystemMailerConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN_SYSTEM
  );
}

function createSystemGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN_SYSTEM,
  });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Envía un correo transaccional del sistema usando la cuenta oficial de Munirix (adriels.systems@gmail.com).
 */
export async function sendSystemEmail({ to, subject, html, text }) {
  if (!isSystemMailerConfigured()) {
    return { skipped: true, reason: 'system_mailer_not_configured' };
  }
  if (!to || !subject) {
    throw new Error('Se requieren destinatario (to) y asunto (subject).');
  }

  const fromEmail = process.env.SYSTEM_GMAIL_FROM || 'adriels.systems@gmail.com';
  const fromHeader = fromEmail.includes('<') ? fromEmail : `Munirix <${fromEmail}>`;
  const boundary = `munirix_${Date.now().toString(36)}`;

  const plainBody = text || String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const htmlBody = html || `<p>${plainBody}</p>`;

  const rawMessage = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${encodeMimeSubject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(plainBody, 'utf8').toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(htmlBody, 'utf8').toString('base64'),
    '',
    `--${boundary}--`,
  ].join('\r\n');

  const gmail = createSystemGmailClient();
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: toBase64Url(rawMessage),
    },
  });

  return { ok: true, id: res.data?.id || null };
}
