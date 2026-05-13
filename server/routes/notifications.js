const express = require('express');
const { getDb } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.post('/send', requireRole('national_admin', 'district_officer'), async (req, res) => {
  const db = await getDb();
  const { recipient_type, recipient_id, recipient_contact, channel, subject, message, reference_type, reference_id } = req.body;

  if (!recipient_type || !message) return res.status(400).json({ success: false, error: 'recipient_type and message required' });
  if (!['sms', 'email', 'whatsapp', 'in_app', 'emergency'].includes(channel)) return res.status(400).json({ success: false, error: 'Invalid channel' });

  const result = await db.prepare(`INSERT INTO notification_log (recipient_type, recipient_id, recipient_contact, channel, subject, message, status, reference_type, reference_id) VALUES (?,?,?,?,?,?,'sent',?,?)`).run(
    recipient_type, recipient_id || null, recipient_contact || null, channel,
    subject || null, message, reference_type || null, reference_id || null
  );

  res.status(201).json({ success: true, id: result.lastInsertRowid, message: `Notification sent via ${channel}` });
});

router.post('/broadcast', requireRole('national_admin', 'district_officer'), async (req, res) => {
  const db = await getDb();
  const { district, channel, subject, message, reference_type, reference_id } = req.body;
  if (!message) return res.status(400).json({ success: false, error: 'Message required' });

  const recipients = await db.prepare(`SELECT id, name, email, phone, role FROM users WHERE district = ? AND active = 1`).all(district || '');
  let sent = 0;
  const ins = db.prepare(`INSERT INTO notification_log (recipient_type, recipient_id, recipient_contact, channel, subject, message, status, reference_type, reference_id) VALUES (?,?,?,?,?,?,?,?,?)`);

  for (const r of recipients) {
    if (channel === 'email' && r.email) {
      ins.run('user', r.id, r.email, 'email', subject, message, 'sent', reference_type, reference_id);
      sent++;
    }
    if (channel === 'sms' && r.phone) {
      ins.run('user', r.id, r.phone, 'sms', subject, message, 'sent', reference_type, reference_id);
      sent++;
    }
    ins.run('user', r.id, null, 'in_app', subject, message, 'sent', reference_type, reference_id);
    sent++;
  }

  res.json({ success: true, recipients: sent, message: `Broadcast sent to ${sent} recipients in ${district || 'all districts'}` });
});

router.get('/', async (req, res) => {
  const db = await getDb();
  const { status, channel, limit = 50 } = req.query;
  let sql = `SELECT * FROM notification_log WHERE 1=1`;
  const params = [];
  if (status) {sql += ' AND status = ?';params.push(status);}
  if (channel) {sql += ' AND channel = ?';params.push(channel);}
  sql += ` ORDER BY sent_at DESC LIMIT ${+limit}`;
  res.json({ success: true, data: await db.prepare(sql).all(...params) });
});

router.get('/stats', async (req, res) => {
  const db = await getDb();
  const total = (await db.prepare(`SELECT COUNT(*) as c FROM notification_log`).get()).c;
  const byChannel = await db.prepare(`SELECT channel, COUNT(*) as c FROM notification_log GROUP BY channel`).all();
  const sent24h = (await db.prepare(`SELECT COUNT(*) as c FROM notification_log WHERE sent_at > datetime('now', '-24 hours')`).get()).c;
  res.json({ success: true, data: { total, by_channel: byChannel, sent_24h: sent24h } });
});

module.exports = router;