const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Send an OTP email
 * @param {string} to - Recipient email address
 * @param {string} otp - The 6-digit OTP code
 * @param {string} purpose - Purpose of the OTP (registration, password_reset)
 */
async function sendOTP(to, otp, purpose) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('[EMAIL] EMAIL_USER or EMAIL_PASS not set. Skipping real email delivery.');
    console.log(`[EMAIL-MOCK] To: ${to} | OTP: ${otp} | Purpose: ${purpose}`);
    return false;
  }

  const title = purpose === 'password_reset' ? 'Password Reset Code' : 'Verify Your Registration';
  const actionText = purpose === 'password_reset' 
    ? 'use the following code to reset your password' 
    : 'use the following code to verify your email address and complete your registration';

  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="background-color: #2563eb; color: #ffffff; width: 48px; height: 48px; line-height: 48px; font-size: 24px; border-radius: 12px; margin: 0 auto 12px auto;">💧</div>
        <h1 style="color: #1f2937; margin: 0; font-size: 24px; letter-spacing: -0.5px;">HYDROSENSE</h1>
        <p style="color: #6b7280; font-size: 13px; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px;">Ministry of Water & Environment</p>
      </div>
      
      <div style="background-color: #f8fafc; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
        <h2 style="color: #111827; margin-top: 0; font-size: 18px;">${title}</h2>
        <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
          Hello,<br><br>
          Please ${actionText}. This code will expire in 10 minutes.
        </p>
        
        <div style="background-color: #ffffff; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 16px; text-align: center;">
          <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #2563eb;">${otp}</span>
        </div>
      </div>
      
      <p style="color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.5; margin: 0;">
        If you did not request this code, please ignore this email.<br>
        &copy; ${new Date().getFullYear()} Hydrosense Platform. All rights reserved.
      </p>
    </div>
  `;

  const mailOptions = {
    from: '"Hydrosense Platform" <' + process.env.EMAIL_USER + '>',
    to,
    subject: `Your Hydrosense OTP: ${otp}`,
    html
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] OTP sent to ${to} (${info.messageId})`);
    return true;
  } catch (error) {
    console.error(`[EMAIL-ERROR] Failed to send email to ${to}:`, error.message);
    return false;
  }
}

module.exports = {
  sendOTP
};
