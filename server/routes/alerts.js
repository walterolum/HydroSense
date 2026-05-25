const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { notifyForAlert } = require('../utils/notify');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const db = await getDb();
  const { status = 'active', severity, district, type, limit = 50 } = req.query;
  let sql = `SELECT a.*, wp.name as water_point_name FROM alerts a LEFT JOIN water_points wp ON a.water_point_id = wp.id WHERE 1=1`;
  const params = [];
  if (status !== 'all') {sql += ' AND a.status = ?';params.push(status);}
  if (severity) {sql += ' AND a.severity = ?';params.push(severity);}
  if (district) {sql += ' AND a.district = ?';params.push(district);}
  if (type) {sql += ' AND a.alert_type = ?';params.push(type);}
  sql += ` ORDER BY CASE a.severity WHEN 'emergency' THEN 1 WHEN 'critical' THEN 2 WHEN 'warning' THEN 3 ELSE 4 END, a.created_at DESC LIMIT ${parseInt(limit)}`;
  const data = await db.prepare(sql).all(...params);
  res.json({ success: true, data, total: data.length });
});

router.get('/stats', async (req, res) => {
  const db = await getDb();
  const total = await db.prepare("SELECT COUNT(*) as count FROM alerts WHERE status = 'active'").get();
  const bySeverity = await db.prepare("SELECT severity, COUNT(*) as count FROM alerts WHERE status = 'active' GROUP BY severity").all();
  const byType = await db.prepare("SELECT alert_type, COUNT(*) as count FROM alerts WHERE status = 'active' GROUP BY alert_type ORDER BY count DESC").all();
  const byDistrict = await db.prepare("SELECT district, COUNT(*) as count FROM alerts WHERE status = 'active' GROUP BY district ORDER BY count DESC LIMIT 10").all();
  res.json({ success: true, data: { total_active: total.count, by_severity: bySeverity, by_type: byType, by_district: byDistrict } });
});

router.post('/', async (req, res) => {
  const db = await getDb();
  const { alert_type, severity, water_point_id, district, title, message } = req.body;
  if (!alert_type || !severity || !title || !message) return res.status(400).json({ success: false, error: 'Required fields missing' });
  const result = await db.prepare(`INSERT INTO alerts (alert_type, severity, water_point_id, district, title, message, source) VALUES (?, ?, ?, ?, ?, ?, 'manual')`).run(alert_type, severity, water_point_id, district, title, message);
  try { notifyForAlert(severity, title, district, result.lastInsertRowid); } catch {}
  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

router.put('/:id/resolve', async (req, res) => {
  const db = await getDb();
  await db.prepare("UPDATE alerts SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?").run(req.params.id);
  await db.prepare("INSERT INTO governance_audit (user_id, action, entity_type, entity_id, details) VALUES (?, 'RESOLVE', 'alert', ?, 'Alert resolved')").run(req.user.id, req.params.id);
  res.json({ success: true, message: 'Alert resolved' });
});

router.put('/:id/acknowledge', async (req, res) => {
  const db = await getDb();
  await db.prepare("UPDATE alerts SET status = 'acknowledged' WHERE id = ?").run(req.params.id);
  res.json({ success: true, message: 'Alert acknowledged' });
});

module.exports = router;