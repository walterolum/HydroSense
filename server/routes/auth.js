const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { authMiddleware, requireRole, SECRET } = require('../middleware/auth');
const { sendOTP: sendRealEmail } = require('../utils/email');
const { sendSMS } = require('../utils/sms');

const router = express.Router();

/* ─────────────────────────────────────────────────────────────
   SECURE OTP INFRASTRUCTURE
   - OTPs are bcrypt-hashed before DB storage
   - 5-minute expiry
   - Max 3 send requests per email per 5 min (spam prevention)
   - Max 5 verify attempts then 15-min block (brute-force)
   - 60-second cooldown between resend requests
───────────────────────────────────────────────────────────── */
const MAX_VERIFY_ATTEMPTS = 5;
const BLOCK_DURATION_MS   = 15 * 60 * 1000;   // 15 min
const OTP_EXPIRY_MS       = 5  * 60 * 1000;   // 5 min
const RESEND_COOLDOWN_MS  = 60 * 1000;         // 60 sec
const MAX_SEND_PER_WINDOW = 3;
const SEND_WINDOW_MS      = 5  * 60 * 1000;   // 5 min

/* In-memory rate limiter: { email → { count, windowStart, lastSent } } */
const sendRateMap  = new Map();

function checkSendRate(email) {
  const now  = Date.now();
  const rec  = sendRateMap.get(email);
  if (!rec || now - rec.windowStart > SEND_WINDOW_MS) {
    sendRateMap.set(email, { count: 1, windowStart: now, lastSent: now });
    return { ok: true };
  }
  const cooldownLeft = RESEND_COOLDOWN_MS - (now - rec.lastSent);
  if (cooldownLeft > 0) {
    return { cooldown: true, secondsLeft: Math.ceil(cooldownLeft / 1000) };
  }
  if (rec.count >= MAX_SEND_PER_WINDOW) {
    const windowLeft = Math.ceil((SEND_WINDOW_MS - (now - rec.windowStart)) / 1000);
    return { limited: true, secondsLeft: windowLeft };
  }
  rec.count++;
  rec.lastSent = now;
  return { ok: true };
}

async function generateAndStoreOTP(db, email, purpose, ip) {
  const raw     = Math.floor(100000 + Math.random() * 900000).toString();
  const hashed  = bcrypt.hashSync(raw, 10);
  const expires = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();

  db.prepare(`DELETE FROM otp_codes WHERE email = ? AND used = 0`).run(email);
  db.prepare(`
    INSERT INTO otp_codes (email, otp, purpose, expires_at, attempts, ip_address)
    VALUES (?, ?, ?, ?, 0, ?)
  `).run(email, hashed, purpose, expires, ip || null);

  return raw; // plaintext returned only to delivery functions
}

/* ── OTP Store (legacy in-memory — kept for backward compat, not used for auth) ── */
const otpStore = new Map();

/* ── Public user profile (for QR code scanning, no auth required) ── */
router.get('/users/:id/public', (req, res) => {
  const db = getDb();
  const user = db.prepare(
    'SELECT id, name, email, role, district, organization, avatar FROM users WHERE id=? AND active=1'
  ).get(parseInt(req.params.id));
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  res.json({ success: true, user });
});

/* ── Citizen Registration ── */
router.post('/register', async (req, res) => {
  try {
    const db = getDb();
    const { name, email, password, phone, national_id, community_id, district, sub_county, location, language } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Name is required' });
    if (!email || !email.trim()) return res.status(400).json({ success: false, error: 'Email is required' });
    if (!password || password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    if (!phone) return res.status(400).json({ success: false, error: 'Phone number is required' });

    const emailKey = email.toLowerCase().trim();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(emailKey);
    if (existing) return res.status(409).json({ success: false, error: 'An account with this email already exists' });

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, phone, national_id, community_id, district, sub_county, location, language, active, otp_verified)
      VALUES (?, ?, ?, 'citizen', ?, ?, ?, ?, ?, ?, ?, 1, 1)
    `).run(
      name.trim(), emailKey, hash, phone,
      national_id || null, community_id || null, district || null,
      sub_county || null, location || null, language || 'en'
    );

    const user = db.prepare(
      'SELECT id, name, email, role, district, phone, language, otp_verified, active FROM users WHERE id = ?'
    ).get(result.lastInsertRowid);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, district: user.district },
      SECRET,
      { expiresIn: '365d' }
    );

    // Send welcome notification in the background — never blocks the response
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    setImmediate(async () => {
      try {
        const raw = await generateAndStoreOTP(db, emailKey, 'registration', ip);
        const [emailResult, smsResult] = await Promise.allSettled([
          sendRealEmail(emailKey, raw, 'registration').catch(() => null),
          phone ? sendSMS(phone, raw).catch(() => null) : Promise.resolve(null),
        ]);
        console.log(`[REGISTER] Welcome notification → email:${emailResult?.value?.provider} sms:${smsResult?.value?.provider}`);
      } catch (e) {
        console.warn('[REGISTER] Welcome notification skipped:', e.message);
      }
    });

    console.log(`[REGISTER] New citizen: ${emailKey}`);
    res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to HydroSense.',
      otp_required: false,
      token,
      user,
    });
  } catch (err) {
    console.error('[REGISTER] Error:', err.message);
    res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
  }
});

/* ── Send OTP (rate-limited, hashed) ── */
router.post('/send-otp', async (req, res) => {
  const db = getDb();
  const ip  = req.ip || req.connection?.remoteAddress || 'unknown';
  const { email, purpose = 'registration', device_type = 'smart', phone: bodyPhone } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

  const emailKey = email.toLowerCase().trim();

  /* Rate limit check */
  const rl = checkSendRate(emailKey);
  if (rl.cooldown) return res.status(429).json({ success: false, error: `Please wait ${rl.secondsLeft}s before requesting another code.`, secondsLeft: rl.secondsLeft });
  if (rl.limited)  return res.status(429).json({ success: false, error: `Too many requests. Try again in ${rl.secondsLeft}s.`, secondsLeft: rl.secondsLeft });

  const userRecord = db.prepare('SELECT phone FROM users WHERE email = ?').get(emailKey);
  const phone = bodyPhone || (userRecord?.phone) || null;

  const raw = await generateAndStoreOTP(db, emailKey, purpose, ip);

  /* Helper: log delivery result to DB */
  const logDelivery = (channel, result, recipientPhone = null) => {
    try {
      db.prepare(`
        INSERT INTO otp_delivery_log (email, phone, channel, provider, status, provider_message_id, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(emailKey, recipientPhone, channel, result?.provider || 'unknown', result?.status || 'failed', result?.messageId || null, result?.error || null);
    } catch {}
  };

  // Send via all available channels simultaneously
  const [emailResult, smsResult] = await Promise.all([
    sendRealEmail(emailKey, raw, purpose).catch(() => null),
    phone ? sendSMS(phone, raw).catch(() => null) : Promise.resolve(null),
  ]);
  logDelivery('email', emailResult);
  if (phone) logDelivery('sms', smsResult, phone);

  const emailDelivered = emailResult && emailResult.status !== 'mock';
  const smsDelivered   = smsResult   && smsResult.status   !== 'mock';
  const noneDelivered  = !emailDelivered && !smsDelivered;

  console.log(`[OTP] ${emailKey} → email:${emailResult?.provider} sms:${smsResult?.provider} code:${raw}`);

  return res.json({
    success:         true,
    message:         noneDelivered
      ? 'No delivery service configured — use the code shown on screen'
      : device_type === 'feature'
        ? `Verification code sent via SMS to ${phone ? phone.slice(0, 7) + '****' : 'your phone'}`
        : `Verification code sent to your email${smsDelivered ? ' and phone' : ''}`,
    delivery_method: device_type === 'feature' ? 'sms' : 'email',
    email_provider:  emailResult?.provider || null,
    sms_provider:    smsResult?.provider || null,
    sms_sent:        smsDelivered,
    phone_hint:      phone ? phone.slice(0, 7) + '****' : null,
    expires_in:      300,
    // Show code on screen when no real provider delivered it
    otp_display:     noneDelivered ? raw : null,
  });
});

/* ── Verify OTP (hashed compare, brute-force protection, auto-login) ── */
router.post('/verify-otp', async (req, res) => {
  const db = getDb();
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ success: false, error: 'Email and OTP code are required' });

  const emailKey = email.toLowerCase().trim();

  /* Find the most recent unused, unexpired record */
  const record = db.prepare(`
    SELECT * FROM otp_codes
    WHERE email = ? AND used = 0 AND datetime(expires_at) > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(emailKey);

  if (!record) {
    return res.status(400).json({ success: false, error: 'No valid code found. Please request a new one.' });
  }

  /* Check if temporarily blocked */
  if (record.blocked_until && new Date(record.blocked_until) > new Date()) {
    const remainSec = Math.ceil((new Date(record.blocked_until) - new Date()) / 1000);
    return res.status(429).json({ success: false, error: `Too many failed attempts. Try again in ${Math.ceil(remainSec / 60)} minute(s).`, blockedFor: remainSec });
  }

  /* Hash compare */
  const isValid = bcrypt.compareSync(otp.trim(), record.otp);

  /* Log attempt */
  db.prepare(`INSERT INTO otp_attempt_log (email, ip_address, success) VALUES (?, ?, ?)`).run(emailKey, ip, isValid ? 1 : 0);

  if (!isValid) {
    const newAttempts = (record.attempts || 0) + 1;
    const remaining = MAX_VERIFY_ATTEMPTS - newAttempts;

    if (newAttempts >= MAX_VERIFY_ATTEMPTS) {
      const blockedUntil = new Date(Date.now() + BLOCK_DURATION_MS).toISOString();
      db.prepare(`UPDATE otp_codes SET attempts = ?, blocked_until = ? WHERE id = ?`).run(newAttempts, blockedUntil, record.id);
      return res.status(429).json({ success: false, error: `Account temporarily locked for 15 minutes after ${MAX_VERIFY_ATTEMPTS} failed attempts.`, blockedFor: BLOCK_DURATION_MS / 1000 });
    }

    db.prepare(`UPDATE otp_codes SET attempts = ? WHERE id = ?`).run(newAttempts, record.id);
    return res.status(400).json({ success: false, error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`, attemptsLeft: remaining });
  }

  /* Valid — check if it is for password reset */
  if (record.purpose === 'password_reset') {
    return res.json({ success: true, verified: true, message: 'OTP is valid' });
  }

  /* Valid for registration/login — mark used and activate user */
  db.prepare(`UPDATE otp_codes SET used = 1 WHERE id = ?`).run(record.id);

  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(emailKey);
  if (!user) return res.status(404).json({ success: false, error: 'User account not found' });

  db.prepare(`UPDATE users SET otp_verified = 1, active = 1 WHERE id = ?`).run(user.id);

  const { password_hash, ...safeUser } = user;
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, district: user.district },
    SECRET,
    { expiresIn: '365d' }
  );

  res.json({ success: true, verified: true, message: 'Account verified and activated successfully!', token, user: { ...safeUser, otp_verified: 1, active: 1 } });
});

/* ── Resend OTP (same rate-limit as send, with provider tracking) ── */
router.post('/resend-otp', async (req, res) => {
  const db = getDb();
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const { email, device_type = 'smart', phone: bodyPhone } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

  const emailKey = email.toLowerCase().trim();

  const rl = checkSendRate(emailKey);
  if (rl.cooldown) return res.status(429).json({ success: false, error: `Please wait ${rl.secondsLeft}s before resending.`, secondsLeft: rl.secondsLeft });
  if (rl.limited)  return res.status(429).json({ success: false, error: `Too many requests. Try again in ${rl.secondsLeft}s.`, secondsLeft: rl.secondsLeft });

  const userRecord = db.prepare('SELECT phone FROM users WHERE email = ?').get(emailKey);
  const phone = bodyPhone || (userRecord?.phone) || null;
  const raw   = await generateAndStoreOTP(db, emailKey, 'registration', ip);

  const logDelivery = (channel, result, ph = null) => {
    try {
      db.prepare(`INSERT INTO otp_delivery_log (email, phone, channel, provider, status, provider_message_id) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(emailKey, ph, channel, result?.provider || 'unknown', result?.status || 'failed', result?.messageId || null);
    } catch {}
  };

  const [emailResult, smsResult] = await Promise.all([
    sendRealEmail(emailKey, raw, 'registration').catch(() => null),
    phone ? sendSMS(phone, raw).catch(() => null) : Promise.resolve(null),
  ]);
  logDelivery('email', emailResult);
  if (phone) logDelivery('sms', smsResult, phone);

  const emailOk = emailResult && emailResult.status !== 'mock';
  const smsOk   = smsResult   && smsResult.status   !== 'mock';
  console.log(`[OTP][RESEND] ${emailKey} → email:${emailResult?.provider} sms:${smsResult?.provider}: ${raw}`);
  res.json({
    success:        true,
    message:        !emailOk && !smsOk ? 'Use the code shown on screen' : 'New verification code sent!',
    email_provider: emailResult?.provider || null,
    sms_sent:       smsOk,
    sms_provider:   smsResult?.provider || null,
    expires_in:     300,
    otp_display:    !emailOk && !smsOk ? raw : null,
  });
});

/* ── Login ── */
router.post('/login', async (req, res) => {
  const { email, password, rememberMe } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });

  const db = await getDb();
  const user = await db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ success: false, error: 'Invalid credentials' });

  await db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

  // Long-lived token when user ticks "Remember Me", otherwise 7 days
  const expiry = rememberMe ? '365d' : '7d';
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, district: user.district, organization: user.organization },
    SECRET,
    { expiresIn: expiry }
  );

  const { password_hash, ...safeUser } = user;
  res.json({ success: true, token, user: safeUser, expires_in: expiry });
});

/* ── Refresh token — issues a fresh token for the same user without re-login ── */
router.post('/refresh', authMiddleware, async (req, res) => {
  const db = await getDb();
  const user = await db.prepare('SELECT id, name, email, role, district, sub_county, phone, organization, avatar, active FROM users WHERE id = ? AND active = 1').get(req.user.id);
  if (!user) return res.status(401).json({ success: false, error: 'User account not found or deactivated' });

  const { rememberMe } = req.body;
  const expiry = rememberMe ? '365d' : '7d';
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, district: user.district, organization: user.organization },
    SECRET,
    { expiresIn: expiry }
  );
  const { password_hash, ...safeUser } = user;
  res.json({ success: true, token, user: safeUser, expires_in: expiry });
});

/* ── Get current user ── */
router.get('/me', authMiddleware, async (req, res) => {
  const db = await getDb();
  const user = await db.prepare('SELECT id, name, email, role, district, sub_county, phone, organization, avatar, active, last_login, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  res.json({ success: true, user });
});

/* ── Change own password (any authenticated user) ── */
router.put('/profile/password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ success: false, error: 'Both current and new password are required' });
  if (new_password.length < 6) return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });

  const db = await getDb();
  const user = await db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const valid = bcrypt.compareSync(current_password, user.password_hash);
  if (!valid) return res.status(401).json({ success: false, error: 'Current password is incorrect' });

  const hash = bcrypt.hashSync(new_password, 10);
  await db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, req.user.id);
  res.json({ success: true, message: 'Password changed successfully' });
});

/* ── Update own profile (any authenticated user) ── */
router.put('/profile', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { name, phone, avatar } = req.body;
  const fields = [];const vals = [];
  if (name !== undefined) {fields.push('name=?');vals.push(name.trim());}
  if (phone !== undefined) {fields.push('phone=?');vals.push(phone || null);}
  if (avatar !== undefined) {fields.push('avatar=?');vals.push(avatar || null);}
  if (!fields.length) return res.status(400).json({ success: false, error: 'Nothing to update' });
  vals.push(req.user.id);
  await db.prepare(`UPDATE users SET ${fields.join(',')} WHERE id=?`).run(...vals);
  const updated = await db.prepare('SELECT id, name, email, role, district, sub_county, phone, organization, avatar, active, last_login, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({ success: true, user: updated });
});

/* ── List users ── */
// national_admin: full list with all fields
// other staff: id/name/role/district only (needed for task assignment dropdowns)
router.get('/users', authMiddleware, async (req, res) => {
  const db = await getDb();
  if (req.user.role === 'national_admin') {
    const users = await db.prepare('SELECT id, name, email, role, district, sub_county, organization, phone, avatar, active, last_login, created_at FROM users ORDER BY name').all();
    return res.json({ success: true, data: users });
  }
  // Non-admin staff — limited view, active users only
  const users = await db.prepare('SELECT id, name, role, district, organization, avatar FROM users WHERE active = 1 ORDER BY name').all();
  res.json({ success: true, data: users });
});

/* ── Create user (admin only) ── */
router.post('/users', authMiddleware, requireRole('national_admin'), async (req, res) => {
  const db = await getDb();
  const { name, email, password, role, district, sub_county, organization, phone } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Name is required' });
  if (!email || !email.trim()) return res.status(400).json({ success: false, error: 'Email is required' });
  if (!password || password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
  if (!role) return res.status(400).json({ success: false, error: 'Role is required' });

  const VALID_ROLES = ['national_admin', 'district_officer', 'community_committee', 'citizen', 'ngo_officer', 'technician', 'health_officer', 'climate_scientist'];
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ success: false, error: 'Invalid role' });

  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ success: false, error: 'A user with this email already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const result = await db.prepare(`
    INSERT INTO users (name, email, password_hash, role, district, sub_county, organization, phone, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    name.trim(),
    email.toLowerCase().trim(),
    hash,
    role,
    district || null,
    sub_county || null,
    organization || null,
    phone || null
  );

  res.status(201).json({ success: true, id: result.lastInsertRowid, message: 'User created successfully' });
});

/* ── Update user (admin only) ── */
router.put('/users/:id', authMiddleware, requireRole('national_admin'), async (req, res) => {
  const db = await getDb();
  const { name, email, role, district, sub_county, organization, phone, active } = req.body;
  const userId = parseInt(req.params.id);

  if (isNaN(userId)) return res.status(400).json({ success: false, error: 'Invalid user ID' });

  const target = await db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ success: false, error: 'User not found' });

  // Prevent changing own role
  if (req.user.id === userId && role && role !== req.user.role) {
    return res.status(400).json({ success: false, error: 'You cannot change your own role' });
  }

  // Check email uniqueness
  if (email) {
    const emailConflict = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase().trim(), userId);
    if (emailConflict) return res.status(409).json({ success: false, error: 'Email already in use by another account' });
  }

  const VALID_ROLES = ['national_admin', 'district_officer', 'community_committee', 'citizen', 'ngo_officer', 'technician', 'health_officer', 'climate_scientist'];
  if (role && !VALID_ROLES.includes(role)) return res.status(400).json({ success: false, error: 'Invalid role' });

  const { avatar } = req.body;
  const fields = [];const vals = [];
  if (name !== undefined) {fields.push('name=?');vals.push(name.trim());}
  if (email !== undefined) {fields.push('email=?');vals.push(email.toLowerCase().trim());}
  if (role !== undefined) {fields.push('role=?');vals.push(role);}
  if (district !== undefined) {fields.push('district=?');vals.push(district || null);}
  if (sub_county !== undefined) {fields.push('sub_county=?');vals.push(sub_county || null);}
  if (organization !== undefined) {fields.push('organization=?');vals.push(organization || null);}
  if (phone !== undefined) {fields.push('phone=?');vals.push(phone || null);}
  if (active !== undefined) {fields.push('active=?');vals.push(active ? 1 : 0);}
  if (avatar !== undefined) {fields.push('avatar=?');vals.push(avatar || null);}

  if (!fields.length) return res.status(400).json({ success: false, error: 'No fields to update' });

  vals.push(userId);
  await db.prepare(`UPDATE users SET ${fields.join(',')} WHERE id=?`).run(...vals);
  res.json({ success: true, message: 'User updated successfully' });
});

/* ── Reset password (admin only) ── */
router.put('/users/:id/password', authMiddleware, requireRole('national_admin'), async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
  }
  const db = await getDb();
  const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const hash = bcrypt.hashSync(password, 10);
  await db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, req.params.id);
  res.json({ success: true, message: 'Password reset successfully' });
});

/* ── Permanently delete user (admin only, cannot delete self) ── */
router.delete('/users/:id', authMiddleware, requireRole('national_admin'), async (req, res) => {
  const userId = parseInt(req.params.id);
  if (req.user.id === userId) {
    return res.status(400).json({ success: false, error: 'You cannot delete your own account' });
  }
  const db = getDb();
  const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  try {
    const deleteUser = db.transaction(() => {
      // Nullify all FK references that lack ON DELETE CASCADE/SET NULL
      db.prepare('UPDATE citizen_reports SET user_id=NULL WHERE user_id=?').run(userId);
      db.prepare('UPDATE task_assignments SET assigned_to=NULL WHERE assigned_to=?').run(userId);
      db.prepare('UPDATE task_assignments SET assigned_by=NULL WHERE assigned_by=?').run(userId);
      db.prepare('UPDATE response_tickets SET created_by=NULL WHERE created_by=?').run(userId);
      db.prepare('UPDATE ai_conversations SET user_id=NULL WHERE user_id=?').run(userId);
      db.prepare('UPDATE ai_decision_log SET user_id=NULL WHERE user_id=?').run(userId);
      db.prepare('UPDATE citizen_report_tracking SET updated_by=NULL WHERE updated_by=?').run(userId);
      db.prepare('UPDATE citizen_observations SET user_id=NULL WHERE user_id=?').run(userId);
      db.prepare('UPDATE volunteer_events SET created_by=NULL WHERE created_by=?').run(userId);
      db.prepare('UPDATE maintenance_requests SET reported_by=NULL WHERE reported_by=?').run(userId);
      db.prepare('UPDATE maintenance_requests SET assigned_to=NULL WHERE assigned_to=?').run(userId);
      db.prepare('UPDATE water_quality_tests SET tested_by=NULL WHERE tested_by=?').run(userId);
      db.prepare('UPDATE community_reports SET assigned_to=NULL WHERE assigned_to=?').run(userId);
      db.prepare('UPDATE governance_audit SET user_id=NULL WHERE user_id=?').run(userId);
      db.prepare('UPDATE maintenance_funds SET managed_by=NULL WHERE managed_by=?').run(userId);
      db.prepare('UPDATE env_incidents SET reported_by=NULL WHERE reported_by=?').run(userId);
      db.prepare('DELETE FROM users WHERE id=?').run(userId);
    });
    deleteUser();
    res.json({ success: true, message: `User "${user.name}" has been permanently deleted` });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to delete user' });
  }
});

/* ── Forgot Password (send OTP) ── */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

  const db = await getDb();
  const emailKey = email.toLowerCase().trim();
  const user = await db.prepare('SELECT id, name, email, phone FROM users WHERE email = ?').get(emailKey);
  if (!user) return res.status(404).json({ success: false, error: 'No account found with this email' });

  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const otp = await generateAndStoreOTP(db, emailKey, 'password_reset', ip);

  // Send real email asynchronously
  sendRealEmail(emailKey, otp, 'password_reset').catch(console.error);

  // Send SMS asynchronously if phone number exists
  const phone = user.phone || null;
  if (phone) {
    sendSMS(phone, otp).catch(console.error);
  } else {
    // Fetch it if not in the 'user' object (fallback)
    const userForPhone = await db.prepare('SELECT phone FROM users WHERE email = ?').get(emailKey);
    if (userForPhone && userForPhone.phone) {
      sendSMS(userForPhone.phone, otp).catch(console.error);
    }
  }

  console.log(`[PASSWORD RESET] OTP for ${emailKey}: ${otp}`);
  res.json({ success: true, message: 'Password reset OTP sent to your email and phone', otp_debug: otp });
});

/* ── Reset Password (with OTP validation) ── */
router.post('/reset-password', async (req, res) => {
  const { email, otp, password } = req.body;
  if (!email || !otp || !password) return res.status(400).json({ success: false, error: 'Email, OTP, and new password are required' });
  if (password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });

  const db = await getDb();
  const emailKey = email.toLowerCase().trim();
  const record = db.prepare(`
    SELECT * FROM otp_codes
    WHERE email = ? AND purpose = 'password_reset' AND used = 0 AND datetime(expires_at) > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(emailKey);

  if (!record || !bcrypt.compareSync(otp.trim(), record.otp)) {
    return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
  }

  db.prepare(`UPDATE otp_codes SET used = 1 WHERE id = ?`).run(record.id);

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(hash, emailKey);

  res.json({ success: true, message: 'Password has been reset successfully. You can now log in.' });
});

/* ── Language Preference ── */
router.put('/language', authMiddleware, async (req, res) => {
  const { language } = req.body;
  if (!language) return res.status(400).json({ success: false, error: 'Language code required' });
  (await getDb()).prepare('UPDATE users SET language = ? WHERE id = ?').run(language, req.user.id);
  res.json({ success: true, language });
});

router.get('/language', authMiddleware, async (req, res) => {
  const row = (await getDb()).prepare('SELECT language FROM users WHERE id = ?').get(req.user.id);
  res.json({ success: true, language: row?.language || 'en' });
});

module.exports = router;