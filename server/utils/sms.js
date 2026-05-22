/**
 * HydroSense SMS Utility
 * Provider chain: Africa's Talking (primary for Uganda/Africa) → Twilio (international fallback)
 *
 * Required environment variables:
 *   AT_API_KEY      — Africa's Talking API key
 *   AT_USERNAME     — Africa's Talking username (use 'sandbox' for testing)
 *   AT_SENDER_ID    — Africa's Talking short code / sender ID (optional)
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_PHONE_NUMBER
 */

const twilio = require('twilio');

const SMS_BODY = (otp) => [
  'HydroSense Verification Code',
  '',
  `Your one-time code is: ${otp}`,
  '',
  'Valid for 5 minutes. Do NOT share this code.',
  'If you did not register on HydroSense, ignore this message.',
].join('\n');

/* ─────────────────────────────────────────────────────────
   PROVIDER 1: Africa's Talking
   Best for Uganda / East Africa — lower latency, local delivery
───────────────────────────────────────────────────────── */
async function sendViaAfricasTalking(to, otp) {
  const apiKey   = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;
  if (!apiKey || !username) return null; // not configured

  try {
    const AfricasTalking = require('africastalking');
    const at  = AfricasTalking({ apiKey, username });
    const sms = at.SMS;

    const options = {
      to:      [to],
      message: SMS_BODY(otp),
    };
    if (process.env.AT_SENDER_ID) options.from = process.env.AT_SENDER_ID;

    const result   = await sms.send(options);
    const msgData  = result.SMSMessageData?.Recipients?.[0];
    const status   = msgData?.status || 'Unknown';
    const msgId    = msgData?.messageId || null;
    const cost     = msgData?.cost || '';

    console.log(`[SMS][AT] Sent to ${to} | status: ${status} | cost: ${cost} | id: ${msgId}`);

    if (status === 'Success') return { provider: 'africastalking', messageId: msgId, status: 'sent' };
    throw new Error(`AT status: ${status}`);
  } catch (err) {
    console.error(`[SMS][AT] Error: ${err.message}`);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────
   PROVIDER 2: Twilio (international fallback)
───────────────────────────────────────────────────────── */
async function sendViaTwilio(to, otp) {
  const accountSid  = process.env.TWILIO_ACCOUNT_SID;
  const authToken   = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber  = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return null;

  try {
    const client  = twilio(accountSid, authToken);
    const message = await client.messages.create({ body: SMS_BODY(otp), from: fromNumber, to });
    console.log(`[SMS][Twilio] Sent to ${to} | SID: ${message.sid} | status: ${message.status}`);
    return { provider: 'twilio', messageId: message.sid, status: message.status };
  } catch (err) {
    console.error(`[SMS][Twilio] Error: ${err.message}`);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────
   PUBLIC: sendSMS — tries AT first, falls back to Twilio
   Returns { provider, messageId, status } or false
───────────────────────────────────────────────────────── */
async function sendSMS(to, otp) {
  // Normalize Ugandan numbers: 07xx → +25607xx
  let normalized = to.replace(/\s+/g, '');
  if (/^0\d{9}$/.test(normalized)) normalized = '+256' + normalized.slice(1);
  if (/^\+?256\d{9}$/.test(normalized) && !normalized.startsWith('+')) normalized = '+' + normalized;

  // Try Africa's Talking first
  const atResult = await sendViaAfricasTalking(normalized, otp);
  if (atResult) return atResult;

  // Fallback to Twilio
  const twilioResult = await sendViaTwilio(normalized, otp);
  if (twilioResult) return twilioResult;

  // Both failed / not configured
  console.warn(`[SMS][MOCK] No SMS provider configured. To: ${normalized} | OTP: ${otp}`);
  return { provider: 'mock', messageId: null, status: 'mock' };
}

module.exports = { sendSMS };
