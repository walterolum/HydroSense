const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { authMiddleware, requireRole, SECRET } = require('../middleware/auth');
const { sendOTP: sendRealEmail } = require('../utils/email');

const router = express.Router();

/* ── OTP Store (in-memory fallback) ── */
const otpStore = new Map();

/* ── Citizen Registration ── */
router.post('/register', async (req, res) => {
  const db = await getDb();
  const { name, email, password, phone, national_id, community_id, district, sub_county, location, language } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Name is required' });
  if (!email || !email.trim()) return res.status(400).json({ success: false, error: 'Email is required' });
  if (!password || password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
  if (!phone) return res.status(400).json({ success: false, error: 'Phone number is required' });

  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ success: false, error: 'An account with this email already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const result = await db.prepare(`
    INSERT INTO users (name, email, password_hash, role, phone, national_id, community_id, district, sub_county, location, language, active, otp_verified)
    VALUES (?, ?, ?, 'citizen', ?, ?, ?, ?, ?, ?, ?, 1, 0)
  `).run(
    name.trim(),
    email.toLowerCase().trim(),
    hash,
    phone,
    national_id || null,
    community_id || null,
    district || null,
    sub_county || null,
    location || null,
    language || 'en'
  );

  res.status(201).json({
    success: true,
    id: result.lastInsertRowid,
    message: 'Registration successful. Please verify your email with OTP.',
    otp_required: true
  });
});

/* ── Send OTP ── */
router.post('/send-otp', async (req, res) => {
  const db = await getDb();
  const { email, purpose = 'registration' } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await db.prepare(`DELETE FROM otp_codes WHERE email = ? AND used = 0`).run(email.toLowerCase().trim());
  await db.prepare(`INSERT INTO otp_codes (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)`).run(email.toLowerCase().trim(), otp, purpose, expires);

  otpStore.set(email.toLowerCase().trim(), { otp, expires: Date.now() + 10 * 60 * 1000 });

  // Send real email asynchronously
  sendRealEmail(email.toLowerCase().trim(), otp, purpose).catch(console.error);

  console.log(`[OTP] OTP for ${email}: ${otp}`);
  res.json({ success: true, message: 'OTP sent successfully', otp_debug: otp });
});

/* ── Verify OTP ── */
router.post('/verify-otp', async (req, res) => {
  const db = await getDb();
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ success: false, error: 'Email and OTP are required' });

  const record = await db.prepare(`SELECT * FROM otp_codes WHERE email = ? AND otp = ? AND used = 0 AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1`).get(email.toLowerCase().trim(), otp);
  if (!record) return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });

  await db.prepare(`UPDATE otp_codes SET used = 1 WHERE id = ?`).run(record.id);

  const user = await db.prepare(`SELECT id, name, email, role FROM users WHERE email = ?`).get(email.toLowerCase().trim());
  if (user) {
    await db.prepare(`UPDATE users SET otp_verified = 1 WHERE id = ?`).run(user.id);
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, district: user.district },
      SECRET,
      { expiresIn: '24h' }
    );
    return res.json({ success: true, message: 'OTP verified successfully', verified: true, token, user });
  }

  res.json({ success: true, message: 'OTP verified successfully', verified: true });
});

/* ── Resend OTP ── */
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

  const db = await getDb();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await db.prepare(`DELETE FROM otp_codes WHERE email = ? AND used = 0`).run(email.toLowerCase().trim());
  await db.prepare(`INSERT INTO otp_codes (email, otp, purpose, expires_at) VALUES (?, ?, 'registration', ?)`).run(email.toLowerCase().trim(), otp, expires);

  // Send real email asynchronously
  sendRealEmail(email.toLowerCase().trim(), otp, 'registration').catch(console.error);

  console.log(`[OTP] Resent OTP for ${email}: ${otp}`);
  res.json({ success: true, message: 'OTP resent successfully', otp_debug: otp });
});

/* ── Login ── */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });

  const db = await getDb();
  const user = await db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ success: false, error: 'Invalid credentials' });

  await db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, district: user.district, organization: user.organization },
    SECRET,
    { expiresIn: '24h' }
  );

  const { password_hash, ...safeUser } = user;
  res.json({ success: true, token, user: safeUser });
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

/* ── List all users (authenticated) ── */
router.get('/users', authMiddleware, async (req, res) => {
  const db = await getDb();
  const users = await db.prepare('SELECT id, name, email, role, district, sub_county, organization, phone, avatar, active, last_login, created_at FROM users ORDER BY name').all();
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
  const db = await getDb();
  const user = await db.prepare('SELECT id, name FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  await db.prepare('DELETE FROM users WHERE id=?').run(userId);
  res.json({ success: true, message: `User "${user.name}" has been permanently deleted` });
});

/* ── Forgot Password (send OTP) ── */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

  const db = await getDb();
  const user = await db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(404).json({ success: false, error: 'No account found with this email' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await db.prepare(`DELETE FROM otp_codes WHERE email = ? AND purpose = 'password_reset'`).run(email.toLowerCase().trim());
  await db.prepare(`INSERT INTO otp_codes (email, otp, purpose, expires_at) VALUES (?, ?, 'password_reset', ?)`).run(email.toLowerCase().trim(), otp, expires);

  // Send real email asynchronously
  sendRealEmail(email.toLowerCase().trim(), otp, 'password_reset').catch(console.error);

  console.log(`[PASSWORD RESET] OTP for ${email}: ${otp}`);
  res.json({ success: true, message: 'Password reset OTP sent to your email', otp_debug: otp });
});

/* ── Reset Password (with OTP validation) ── */
router.post('/reset-password', async (req, res) => {
  const { email, otp, password } = req.body;
  if (!email || !otp || !password) return res.status(400).json({ success: false, error: 'Email, OTP, and new password are required' });
  if (password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });

  const db = await getDb();
  const record = await db.prepare(`SELECT * FROM otp_codes WHERE email = ? AND otp = ? AND purpose = 'password_reset' AND used = 0 AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1`).get(email.toLowerCase().trim(), otp);
  if (!record) return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });

  await db.prepare(`UPDATE otp_codes SET used = 1 WHERE id = ?`).run(record.id);

  const hash = bcrypt.hashSync(password, 10);
  await db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(hash, email.toLowerCase().trim());

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