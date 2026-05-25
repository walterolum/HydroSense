const express = require('express');
const { getDb } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { ROLE_RECEIVES, ensureNotifyColumns } = require('../utils/notify');

const router = express.Router();
router.use(authMiddleware);

// Ensure columns exist on first use
ensureNotifyColumns();

// GET /notifications — role-filtered + personal (recipient_id) notifications
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { limit = 30 } = req.query;
    const role = req.user.role;
    const uid  = req.user.id;
    const district = req.user.district;

    const allowed = ROLE_RECEIVES[role] || [role, 'all'];
    const placeholders = allowed.map(() => '?').join(',');

    // Merge role-based broadcast notifications with personal (recipient_id) ones
    let sql, params;
    if (role === 'national_admin') {
      sql = `SELECT * FROM notification_log
             WHERE channel = 'in_app'
               AND (recipient_type IN (${placeholders}) OR recipient_id = ?)
             ORDER BY sent_at DESC LIMIT ?`;
      params = [...allowed, uid, +limit];
    } else {
      sql = `SELECT * FROM notification_log
             WHERE channel = 'in_app'
               AND (
                 (recipient_type IN (${placeholders}) AND (district = ? OR district IS NULL))
                 OR recipient_id = ?
               )
             ORDER BY sent_at DESC LIMIT ?`;
      params = [...allowed, district || '', uid, +limit];
    }

    const data = db.prepare(sql).all(...params);
    res.json({ success: true, data, total: data.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /notifications/unread-count
router.get('/unread-count', (req, res) => {
  try {
    const db = getDb();
    const role = req.user.role;
    const uid  = req.user.id;
    const district = req.user.district;
    const allowed = ROLE_RECEIVES[role] || [role, 'all'];
    const placeholders = allowed.map(() => '?').join(',');

    let sql, params;
    if (role === 'national_admin') {
      sql = `SELECT COUNT(*) as c FROM notification_log
             WHERE channel = 'in_app' AND read_at IS NULL
               AND (recipient_type IN (${placeholders}) OR recipient_id = ?)`;
      params = [...allowed, uid];
    } else {
      sql = `SELECT COUNT(*) as c FROM notification_log
             WHERE channel = 'in_app' AND read_at IS NULL
               AND (
                 (recipient_type IN (${placeholders}) AND (district = ? OR district IS NULL))
                 OR recipient_id = ?
               )`;
      params = [...allowed, district || '', uid];
    }

    const row = db.prepare(sql).get(...params);
    res.json({ success: true, count: row.c });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PATCH /notifications/:id/read
router.patch('/:id/read', (req, res) => {
  try {
    const db = getDb();
    db.prepare(`UPDATE notification_log SET read_at = datetime('now') WHERE id = ? AND read_at IS NULL`).run(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PATCH /notifications/read-all
router.patch('/read-all', (req, res) => {
  try {
    const db = getDb();
    const role = req.user.role;
    const uid  = req.user.id;
    const district = req.user.district;
    const allowed = ROLE_RECEIVES[role] || [role, 'all'];
    const placeholders = allowed.map(() => '?').join(',');

    let sql, params;
    if (role === 'national_admin') {
      sql = `UPDATE notification_log SET read_at = datetime('now')
             WHERE channel = 'in_app' AND read_at IS NULL
               AND (recipient_type IN (${placeholders}) OR recipient_id = ?)`;
      params = [...allowed, uid];
    } else {
      sql = `UPDATE notification_log SET read_at = datetime('now')
             WHERE channel = 'in_app' AND read_at IS NULL
               AND (
                 (recipient_type IN (${placeholders}) AND (district = ? OR district IS NULL))
                 OR recipient_id = ?
               )`;
      params = [...allowed, district || '', uid];
    }

    db.prepare(sql).run(...params);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /notifications/stats
router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const total = db.prepare(`SELECT COUNT(*) as c FROM notification_log`).get().c;
    const byChannel = db.prepare(`SELECT channel, COUNT(*) as c FROM notification_log GROUP BY channel`).all();
    const sent24h = db.prepare(`SELECT COUNT(*) as c FROM notification_log WHERE sent_at > datetime('now', '-24 hours')`).get().c;
    res.json({ success: true, data: { total, by_channel: byChannel, sent_24h: sent24h } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /notifications/send — admin only manual send
router.post('/send', requireRole('national_admin', 'district_officer'), (req, res) => {
  try {
    const db = getDb();
    const { recipient_type, recipient_id, recipient_contact, channel, subject, message, reference_type, reference_id } = req.body;
    if (!recipient_type || !message) return res.status(400).json({ success: false, error: 'recipient_type and message required' });
    const validChannels = ['sms', 'email', 'whatsapp', 'in_app', 'emergency'];
    if (!validChannels.includes(channel)) return res.status(400).json({ success: false, error: 'Invalid channel' });
    const result = db.prepare(
      `INSERT INTO notification_log (recipient_type, recipient_id, recipient_contact, channel, subject, message, status, reference_type, reference_id)
       VALUES (?,?,?,?,?,?,'sent',?,?)`
    ).run(recipient_type, recipient_id || null, recipient_contact || null, channel, subject || null, message, reference_type || null, reference_id || null);
    res.status(201).json({ success: true, id: result.lastInsertRowid, message: `Notification sent via ${channel}` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /notifications/broadcast
router.post('/broadcast', requireRole('national_admin', 'district_officer'), (req, res) => {
  try {
    const db = getDb();
    const { district, channel, subject, message, reference_type, reference_id } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'Message required' });
    const recipients = db.prepare(`SELECT id, name, email, phone, role FROM users WHERE district = ? AND active = 1`).all(district || '');
    const ins = db.prepare(
      `INSERT INTO notification_log (recipient_type, recipient_id, recipient_contact, channel, subject, message, status, reference_type, reference_id)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    let sent = 0;
    for (const r of recipients) {
      if (channel === 'email' && r.email) { ins.run('user', r.id, r.email, 'email', subject, message, 'sent', reference_type, reference_id); sent++; }
      if (channel === 'sms' && r.phone) { ins.run('user', r.id, r.phone, 'sms', subject, message, 'sent', reference_type, reference_id); sent++; }
      ins.run('user', r.id, null, 'in_app', subject, message, 'sent', reference_type, reference_id); sent++;
    }
    res.json({ success: true, recipients: sent, message: `Broadcast sent to ${sent} recipients in ${district || 'all districts'}` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
