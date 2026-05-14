const twilio = require('twilio');

/**
 * Send an OTP via SMS
 * @param {string} to - Recipient phone number (e.g. +256700000000)
 * @param {string} otp - The 6-digit OTP code
 */
async function sendSMS(to, otp) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.warn('[SMS] Twilio credentials not set. Skipping real SMS delivery.');
    console.log(`[SMS-MOCK] To: ${to} | OTP: ${otp}`);
    return false;
  }

  try {
    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({
      body: `Your Hydrosense OTP code is: ${otp}. Do not share this with anyone.`,
      from: fromNumber,
      to: to
    });
    console.log(`[SMS] OTP sent to ${to} (SID: ${message.sid})`);
    return true;
  } catch (error) {
    console.error(`[SMS-ERROR] Failed to send SMS to ${to}:`, error.message);
    return false;
  }
}

module.exports = {
  sendSMS
};
