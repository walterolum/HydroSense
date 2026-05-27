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
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Inter','Segoe UI',-apple-system,BlinkMacSystemFont,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.06),0 2px 8px rgba(0,0,0,0.03);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1e40af,#0e7490);padding:36px 32px 28px;text-align:center;position:relative;">
          <div style="position:absolute;top:0;left:0;right:0;bottom:0;opacity:0.08;background:radial-gradient(circle at 20% 50%,#60a5fa 0%,transparent 50%),radial-gradient(circle at 80% 50%,#22d3ee 0%,transparent 50%);"></div>
          <div style="width:52px;height:52px;background:rgba(255,255,255,0.12);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;border:1px solid rgba(255,255,255,0.15);">
            <span style="font-size:28px;">${icon}</span>
          </div>
          <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.3px;">HYDROSENSE</h1>
          <p style="color:rgba(255,255,255,0.7);margin:3px 0 0;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:1.8px;">Ministry of Water &amp; Environment · Uganda</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 32px 24px;">
          <h2 style="color:#0f172a;margin:0 0 8px;font-size:22px;font-weight:700;letter-spacing:-0.3px;">${title}</h2>
          <p style="color:#475569;margin:0 0 28px;line-height:1.7;font-size:14px;">
            Hello,<br><br>
            You requested to ${action} on the HydroSense water management platform.
            Use the verification code below to continue. This code expires in <strong>5 minutes</strong>.
          </p>

          <!-- OTP Box -->
          <table width="100%" style="margin-bottom:28px;">
            <tr><td align="center" style="background:#f0f9ff;border:1px solid #b3d5f8;border-radius:14px;padding:24px;">
              <p style="margin:0 0 10px;color:#64748b;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:2px;">Your Verification Code</p>
              <span style="font-size:42px;font-weight:800;letter-spacing:14px;color:${btnColor};font-family:'SF Mono','Consolas',monospace;">${otp}</span>
              <p style="margin:10px 0 0;color:#94a3b8;font-size:11px;">Valid for 5 minutes · Single use only</p>
            </td></tr>
          </table>

          <!-- Security note -->
          <table width="100%" style="background:#fffbeb;border-radius:12px;margin-bottom:24px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0;color:#92400e;font-size:12px;line-height:1.6;">
                🔒 <strong>Security notice:</strong> HydroSense will never ask you to share this code.
                If you did not request this, please ignore this email.
              </p>
            </td></tr>
          </table>

          <p style="color:#475569;font-size:13px;line-height:1.7;margin:0;">
            Enter this code in the HydroSense verification screen to ${action}.
            If you're having trouble, contact your community water officer or system administrator.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 32px;text-align:center;">
          <p style="color:#94a3b8;font-size:11px;margin:0 0 8px;line-height:1.5;">
            &copy; ${YEAR} HydroSense Platform &mdash; Climate-Resilient Water Management &mdash; Uganda
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:0;">
              <span style="color:#cbd5e1;font-size:10px;">256-bit Encrypted &nbsp;·&nbsp; JWT Secured &nbsp;·&nbsp; ISO 27001</span>
            </td></tr>
          </table>
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
   WELCOME EMAIL — sent after Google OAuth sign-up
───────────────────────────────────────────────────────── */
function buildWelcomeHTML(name) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Inter','Segoe UI',-apple-system,BlinkMacSystemFont,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.06),0 2px 8px rgba(0,0,0,0.03);">
        <tr><td style="background:linear-gradient(135deg,#1e40af,#0e7490);padding:36px 32px 28px;text-align:center;position:relative;">
          <div style="position:absolute;top:0;left:0;right:0;bottom:0;opacity:0.08;background:radial-gradient(circle at 20% 50%,#60a5fa 0%,transparent 50%),radial-gradient(circle at 80% 50%,#22d3ee 0%,transparent 50%);"></div>
          <div style="width:52px;height:52px;background:rgba(255,255,255,0.12);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;border:1px solid rgba(255,255,255,0.15);">
            <span style="font-size:28px;">💧</span>
          </div>
          <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.3px;">HYDROSENSE</h1>
          <p style="color:rgba(255,255,255,0.7);margin:3px 0 0;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:1.8px;">Ministry of Water &amp; Environment · Uganda</p>
        </td></tr>
        <tr><td style="padding:36px 32px 24px;">
          <h2 style="color:#0f172a;margin:0 0 8px;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Welcome, ${name}! 🎉</h2>
          <p style="color:#475569;margin:0 0 24px;line-height:1.7;font-size:14px;">
            You've successfully signed in with your Google account. Your HydroSense community account is <strong style="color:#16a34a;">now active</strong>.
          </p>
          <table width="100%" style="margin-bottom:24px;">
            <tr><td align="center" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:20px;">
              <p style="margin:0 0 10px;color:#6b7280;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:2px;">Your Account Details</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:3px 0;color:#374151;font-size:13px;"><strong>Role:</strong> Community Member</td></tr>
                <tr><td style="padding:3px 0;color:#374151;font-size:13px;"><strong>Email:</strong> Verified via Google ✓</td></tr>
              </table>
            </td></tr>
          </table>
          <p style="color:#334155;font-size:13px;line-height:1.7;margin:0 0 12px;">
            You can now report environmental incidents, participate in community discussions, track maintenance requests,
            and receive real-time alerts about water quality and climate events in your area.
          </p>
          <p style="color:#64748b;font-size:13px;line-height:1.7;margin:0;">
            Questions? Contact your community water officer or local district office.
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 32px;text-align:center;">
          <p style="color:#94a3b8;font-size:11px;margin:0 0 8px;line-height:1.5;">
            &copy; ${YEAR} HydroSense Platform &mdash; Climate-Resilient Water Management &mdash; Uganda
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:0;">
              <span style="color:#cbd5e1;font-size:10px;">256-bit Encrypted &nbsp;·&nbsp; JWT Secured &nbsp;·&nbsp; ISO 27001</span>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendWelcomeEmail(to, name) {
  const subject = 'Welcome to HydroSense — Community Account Activated';

  const result =
    await sendViaGeneric(to, name, subject) ||
    await sendViaSendGridGeneric(to, name, subject) ||
    await sendViaNodemailerGeneric(to, name, subject);

  if (!result) {
    console.warn(`[EMAIL][MOCK] Welcome email would be sent to ${to} (no provider configured)`);
    return { provider: 'mock', messageId: null, status: 'mock' };
  }
  return result;
}

async function sendViaGeneric(to, name, subject) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { name: FROM_NAME(), email: FROM_ADDR() },
        to: [{ email: to }],
        subject,
        htmlContent: buildWelcomeHTML(name),
        tags: ['welcome', 'google-oauth'],
      }),
    });
    if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(`Brevo ${response.status}: ${e.message || ''}`); }
    const data = await response.json();
    console.log(`[EMAIL][Brevo] Welcome sent to ${to} | msgId: ${data.messageId}`);
    return { provider: 'brevo', messageId: data.messageId, status: 'sent' };
  } catch (err) { console.error(`[EMAIL][Brevo] Error: ${err.message}`); return null; }
}

async function sendViaSendGridGeneric(to, name, subject) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: FROM_ADDR(), name: FROM_NAME() },
        subject,
        content: [{ type: 'text/html', value: buildWelcomeHTML(name) }],
      }),
    });
    if (!response.ok) { const b = await response.text(); throw new Error(`SendGrid ${response.status}: ${b}`); }
    const msgId = response.headers.get('X-Message-Id') || null;
    console.log(`[EMAIL][SendGrid] Welcome sent to ${to} | msgId: ${msgId}`);
    return { provider: 'sendgrid', messageId: msgId, status: 'sent' };
  } catch (err) { console.error(`[EMAIL][SendGrid] Error: ${err.message}`); return null; }
}

async function sendViaNodemailerGeneric(to, name, subject) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || process.env.EMAIL_PASS === 'YOUR_GMAIL_APP_PASSWORD_HERE') return null;
  try {
    const info = await getTransporter().sendMail({
      from: `"${FROM_NAME()}" <${process.env.EMAIL_USER}>`,
      to, subject, html: buildWelcomeHTML(name),
    });
    console.log(`[EMAIL][Gmail] Welcome sent to ${to} | msgId: ${info.messageId}`);
    return { provider: 'nodemailer-gmail', messageId: info.messageId, status: 'sent' };
  } catch (err) { console.error(`[EMAIL][Gmail] Error: ${err.message}`); return null; }
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

/* ─────────────────────────────────────────────────────────
   VERIFICATION EMAIL — sent after email registration
   Contains verification link with token, not OTP
───────────────────────────────────────────────────────── */
function buildVerificationHTML(name, verifyLink) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Inter','Segoe UI',-apple-system,BlinkMacSystemFont,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.06),0 2px 8px rgba(0,0,0,0.03);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1e40af,#0e7490);padding:36px 32px 28px;text-align:center;position:relative;">
          <div style="position:absolute;top:0;left:0;right:0;bottom:0;opacity:0.08;background:radial-gradient(circle at 20% 50%,#60a5fa 0%,transparent 50%),radial-gradient(circle at 80% 50%,#22d3ee 0%,transparent 50%);"></div>
          <div style="width:52px;height:52px;background:rgba(255,255,255,0.12);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;border:1px solid rgba(255,255,255,0.15);">
            <span style="font-size:28px;">💧</span>
          </div>
          <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.3px;">HYDROSENSE</h1>
          <p style="color:rgba(255,255,255,0.7);margin:3px 0 0;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:1.8px;">Ministry of Water &amp; Environment · Uganda</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 32px 24px;">
          <h2 style="color:#0f172a;margin:0 0 8px;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Verify your email</h2>
          <p style="color:#475569;margin:0 0 28px;line-height:1.7;font-size:14px;">
            Hello <strong style="color:#0f172a;">${name}</strong>,<br><br>
            Click the button below to activate your HydroSense community account and start contributing to water safety in Uganda.
          </p>

          <!-- CTA Button -->
          <table width="100%" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${verifyLink}"
                 style="display:inline-block;padding:15px 48px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:14px;box-shadow:0 4px 24px rgba(37,99,235,0.4);">
                Verify Email Address
              </a>
            </td></tr>
          </table>

          <!-- Fallback link -->
          <table width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 8px;color:#64748b;font-size:12px;font-weight:600;">Button not working? Copy this link into your browser:</p>
              <p style="margin:0;color:#2563eb;font-size:11px;word-break:break-all;font-family:'SF Mono','Consolas',monospace;line-height:1.5;">${verifyLink}</p>
            </td></tr>
          </table>

          <!-- Security notice -->
          <table width="100%" style="background:#fffbeb;border-radius:12px;margin-bottom:24px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0;color:#92400e;font-size:12px;line-height:1.6;">
                🔒 <strong>Security notice:</strong> This link expires in <strong>24 hours</strong>. If you didn't create this account, please ignore this email.
              </p>
            </td></tr>
          </table>

          <!-- What you can do once verified -->
          <table width="100%" style="margin-bottom:4px;">
            <tr><td style="padding:0;">
              <p style="color:#334155;font-size:13px;line-height:1.7;margin:0 0 16px;font-weight:600;">Once verified, you'll be able to:</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:4px 0;color:#475569;font-size:13px;">✓ Report water quality &amp; environmental incidents</td></tr>
                <tr><td style="padding:4px 0;color:#475569;font-size:13px;">✓ Track maintenance requests in your community</td></tr>
                <tr><td style="padding:4px 0;color:#475569;font-size:13px;">✓ Receive real-time climate &amp; water alerts</td></tr>
                <tr><td style="padding:4px 0;color:#475569;font-size:13px;">✓ Participate in community discussions</td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 32px;text-align:center;">
          <p style="color:#94a3b8;font-size:11px;margin:0 0 8px;line-height:1.5;">
            &copy; ${YEAR} HydroSense Platform &mdash; Climate-Resilient Water Management &mdash; Uganda
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:0;">
              <span style="color:#cbd5e1;font-size:10px;">256-bit Encrypted &nbsp;·&nbsp; JWT Secured &nbsp;·&nbsp; ISO 27001</span>
            </td></tr>
          </table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendVerificationEmail(to, name, token) {
  const baseUrl = process.env.APP_URL || 'https://hydrosense.ug';
  const verifyLink = `${baseUrl}/verify-email?token=${token}`;
  const subject = 'Verify Your Email — HydroSense Community Account';

  const result =
    await sendViaVerificationBrevo(to, name, subject, verifyLink) ||
    await sendViaVerificationSendGrid(to, name, subject, verifyLink) ||
    await sendViaVerificationNodemailer(to, name, subject, verifyLink);

  if (!result) {
    console.warn(`[EMAIL][MOCK] Verification email would be sent to ${to} (no provider configured)`);
    return { provider: 'mock', messageId: null, status: 'mock' };
  }
  return result;
}

async function sendViaVerificationBrevo(to, name, subject, verifyLink) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { name: FROM_NAME(), email: FROM_ADDR() },
        to: [{ email: to }],
        subject,
        htmlContent: buildVerificationHTML(name, verifyLink),
        tags: ['email-verification', 'registration'],
      }),
    });
    if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(`Brevo ${response.status}: ${e.message || ''}`); }
    const data = await response.json();
    console.log(`[EMAIL][Brevo] Verification sent to ${to} | msgId: ${data.messageId}`);
    return { provider: 'brevo', messageId: data.messageId, status: 'sent' };
  } catch (err) { console.error(`[EMAIL][Brevo] Error: ${err.message}`); return null; }
}

async function sendViaVerificationSendGrid(to, name, subject, verifyLink) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: FROM_ADDR(), name: FROM_NAME() },
        subject,
        content: [{ type: 'text/html', value: buildVerificationHTML(name, verifyLink) }],
      }),
    });
    if (!response.ok) { const b = await response.text(); throw new Error(`SendGrid ${response.status}: ${b}`); }
    const msgId = response.headers.get('X-Message-Id') || null;
    console.log(`[EMAIL][SendGrid] Verification sent to ${to} | msgId: ${msgId}`);
    return { provider: 'sendgrid', messageId: msgId, status: 'sent' };
  } catch (err) { console.error(`[EMAIL][SendGrid] Error: ${err.message}`); return null; }
}

async function sendViaVerificationNodemailer(to, name, subject, verifyLink) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || process.env.EMAIL_PASS === 'YOUR_GMAIL_APP_PASSWORD_HERE') return null;
  try {
    const info = await getTransporter().sendMail({
      from: `"${FROM_NAME()}" <${process.env.EMAIL_USER}>`,
      to, subject, html: buildVerificationHTML(name, verifyLink),
    });
    console.log(`[EMAIL][Gmail] Verification sent to ${to} | msgId: ${info.messageId}`);
    return { provider: 'nodemailer-gmail', messageId: info.messageId, status: 'sent' };
  } catch (err) { console.error(`[EMAIL][Gmail] Error: ${err.message}`); return null; }
}

module.exports = { sendOTP, sendWelcomeEmail, sendVerificationEmail };
