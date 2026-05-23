/**
 * HydroSense Email Utility
 * Provider chain: Brevo API → SendGrid API → Nodemailer Gmail (fallback)
 *
 * Required environment variables (set at least one email provider):
 *   BREVO_API_KEY       — Brevo (formerly Sendinblue) API key
 *   SENDGRID_API_KEY    — SendGrid API key
 *   EMAIL_USER          — Gmail address (for Nodemailer fallback)
 *   EMAIL_PASS          — Gmail app password (for Nodemailer fallback)
 *   EMAIL_FROM_NAME     — Sender display name (default: HydroSense Platform)
 *   EMAIL_FROM_ADDRESS  — Sender address (default: EMAIL_USER)
 */

const nodemailer = require('nodemailer');

const YEAR = new Date().getFullYear();
const FROM_NAME = () => process.env.EMAIL_FROM_NAME || 'HydroSense Platform';
const FROM_ADDR = () => process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER || 'noreply@hydrosense.ug';

/* ── Professional HTML email template ── */
function buildEmailHTML(otp, purpose) {
  const isReset   = purpose === 'password_reset';
  const title     = isReset ? 'Password Reset Code' : 'Verify Your Account';
  const action    = isReset ? 'reset your password' : 'complete your registration';
  const icon      = isReset ? '🔑' : '💧';
  const btnColor  = isReset ? '#dc2626' : '#2563eb';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1d4ed8,#0891b2);padding:28px 32px;text-align:center;">
          <div style="font-size:36px;margin-bottom:8px;">${icon}</div>
          <h1 style="color:#ffffff;margin:0;font-size:22px;letter-spacing:-0.5px;">HYDROSENSE</h1>
          <p style="color:rgba(255,255,255,0.75);margin:4px 0 0;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;">Ministry of Water &amp; Environment · Uganda</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="color:#111827;margin:0 0 12px;font-size:20px;">${title}</h2>
          <p style="color:#6b7280;margin:0 0 24px;line-height:1.7;font-size:14px;">
            Hello,<br><br>
            You requested to ${action} on the HydroSense water management platform.
            Use the verification code below to continue. This code expires in <strong>5 minutes</strong>.
          </p>

          <!-- OTP Box -->
          <table width="100%" style="margin-bottom:24px;">
            <tr><td align="center" style="background:#f0f9ff;border:2px dashed #93c5fd;border-radius:12px;padding:20px;">
              <p style="margin:0 0 8px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:2px;">Your Verification Code</p>
              <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:${btnColor};font-family:monospace;">${otp}</span>
              <p style="margin:10px 0 0;color:#9ca3af;font-size:11px;">Valid for 5 minutes · Single use only</p>
            </td></tr>
          </table>

          <!-- Security note -->
          <table width="100%" style="background:#fefce8;border-left:4px solid #fbbf24;border-radius:0 8px 8px 0;margin-bottom:24px;">
            <tr><td style="padding:12px 16px;">
              <p style="margin:0;color:#92400e;font-size:12px;line-height:1.6;">
                🔒 <strong>Security Notice:</strong> HydroSense will never ask you to share this code.
                If you did not request this, please ignore this email.
              </p>
            </td></tr>
          </table>

          <!-- What to do next -->
          <p style="color:#374151;font-size:13px;line-height:1.7;margin:0;">
            Enter this code in the HydroSense verification screen to ${action}.
            If you're having trouble, contact your community water officer or system administrator.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center;">
          <p style="color:#9ca3af;font-size:11px;margin:0;line-height:1.6;">
            &copy; ${YEAR} HydroSense Platform · Climate-Resilient Water Management · Uganda<br>
            <span style="color:#d1d5db;">256-bit Encrypted · JWT Secured · ISO 27001</span>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* ─────────────────────────────────────────────────────────
   PROVIDER 1: Brevo (formerly Sendinblue) REST API
   Best deliverability, transactional email specialist
───────────────────────────────────────────────────────── */
async function sendViaBrevo(to, otp, purpose) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender:   { name: FROM_NAME(), email: FROM_ADDR() },
        to:       [{ email: to }],
        subject:  `[HydroSense] Your verification code: ${otp}`,
        htmlContent: buildEmailHTML(otp, purpose),
        tags:     ['otp', 'registration'],
        headers:  { 'X-Mailin-custom': 'hydrosense-otp' },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Brevo API ${response.status}: ${err.message || 'Unknown error'}`);
    }
    const data = await response.json();
    console.log(`[EMAIL][Brevo] Sent to ${to} | msgId: ${data.messageId}`);
    return { provider: 'brevo', messageId: data.messageId, status: 'sent' };
  } catch (err) {
    console.error(`[EMAIL][Brevo] Error: ${err.message}`);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────
   PROVIDER 2: SendGrid REST API
───────────────────────────────────────────────────────── */
async function sendViaSendGrid(to, otp, purpose) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from:    { email: FROM_ADDR(), name: FROM_NAME() },
        subject: `[HydroSense] Your verification code: ${otp}`,
        content: [{ type: 'text/html', value: buildEmailHTML(otp, purpose) }],
        tracking_settings: { click_tracking: { enable: false } },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SendGrid ${response.status}: ${body}`);
    }
    const msgId = response.headers.get('X-Message-Id') || null;
    console.log(`[EMAIL][SendGrid] Sent to ${to} | msgId: ${msgId}`);
    return { provider: 'sendgrid', messageId: msgId, status: 'sent' };
  } catch (err) {
    console.error(`[EMAIL][SendGrid] Error: ${err.message}`);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────
   PROVIDER 3: Nodemailer Gmail SMTP (final fallback)
───────────────────────────────────────────────────────── */
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    pool: true,
    maxConnections: 3,
  });
  return _transporter;
}

async function sendViaNodemailer(to, otp, purpose) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || process.env.EMAIL_PASS === 'YOUR_GMAIL_APP_PASSWORD_HERE') return null;

  try {
    const info = await getTransporter().sendMail({
      from:    `"${FROM_NAME()}" <${process.env.EMAIL_USER}>`,
      to,
      subject: `[HydroSense] Your verification code: ${otp}`,
      html:    buildEmailHTML(otp, purpose),
    });
    console.log(`[EMAIL][Gmail] Sent to ${to} | msgId: ${info.messageId}`);
    return { provider: 'nodemailer-gmail', messageId: info.messageId, status: 'sent' };
  } catch (err) {
    console.error(`[EMAIL][Gmail] Error: ${err.message}`);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────
   PUBLIC: sendOTP — tries providers in priority order
   Returns { provider, messageId, status } or false
───────────────────────────────────────────────────────── */
async function sendOTP(to, otp, purpose = 'registration') {
  const result =
    await sendViaBrevo(to, otp, purpose) ||
    await sendViaSendGrid(to, otp, purpose) ||
    await sendViaNodemailer(to, otp, purpose);

  if (!result) {
    console.warn(`[EMAIL][MOCK] No email provider configured. To: ${to} | OTP: ${otp}`);
    return { provider: 'mock', messageId: null, status: 'mock' };
  }
  return result;
}

module.exports = { sendOTP };
