const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const db = await getDb();
  const { district, status, channel, limit = 100 } = req.query;
  let sql = `SELECT cr.*, wp.name as water_point_name, u.name as assigned_name FROM community_reports cr LEFT JOIN water_points wp ON cr.water_point_id = wp.id LEFT JOIN users u ON cr.assigned_to = u.id WHERE 1=1`;
  const params = [];
  if (district) {sql += ' AND cr.district = ?';params.push(district);}
  if (status) {sql += ' AND cr.status = ?';params.push(status);}
  if (channel) {sql += ' AND cr.channel = ?';params.push(channel);}
  sql += ` ORDER BY cr.created_at DESC LIMIT ${parseInt(limit)}`;
  const data = await db.prepare(sql).all(...params);
  res.json({ success: true, data, total: data.length });
});

router.get('/stats', async (req, res) => {
  const db = await getDb();
  const total = await db.prepare('SELECT COUNT(*) as count FROM community_reports').get();
  const byStatus = await db.prepare('SELECT status, COUNT(*) as count FROM community_reports GROUP BY status').all();
  const byChannel = await db.prepare('SELECT channel, COUNT(*) as count FROM community_reports GROUP BY channel').all();
  const byIssue = await db.prepare('SELECT issue_type, COUNT(*) as count FROM community_reports GROUP BY issue_type ORDER BY count DESC').all();
  const byDistrict = await db.prepare('SELECT district, COUNT(*) as count FROM community_reports GROUP BY district ORDER BY count DESC').all();
  const openCritical = await db.prepare("SELECT COUNT(*) as count FROM community_reports WHERE status = 'open' AND severity = 'high'").get();
  res.json({ success: true, data: { total: total.count, by_status: byStatus, by_channel: byChannel, by_issue: byIssue, by_district: byDistrict, open_critical: openCritical.count } });
});

router.post('/', async (req, res) => {
  const db = await getDb();
  const { reporter_name, reporter_phone, water_point_id, district, sub_county, village, issue_type, description, severity, channel, lat, lng } = req.body;
  if (!district || !issue_type || !description) return res.status(400).json({ success: false, error: 'district, issue_type, and description required' });
  const result = await db.prepare(`
    INSERT INTO community_reports (reporter_name, reporter_phone, water_point_id, district, sub_county, village, issue_type, description, severity, channel, lat, lng)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(reporter_name, reporter_phone, water_point_id, district, sub_county, village, issue_type, description, severity || 'medium', channel || 'app', lat, lng);
  res.status(201).json({ success: true, id: result.lastInsertRowid, message: 'Report submitted successfully' });
});

router.put('/:id', async (req, res) => {
  const db = await getDb();
  const { status, assigned_to, resolution_notes } = req.body;
  await db.prepare("UPDATE community_reports SET status=COALESCE(?,status), assigned_to=COALESCE(?,assigned_to), resolution_notes=COALESCE(?,resolution_notes), updated_at=datetime('now') WHERE id=?").run(status, assigned_to, resolution_notes, req.params.id);
  res.json({ success: true, message: 'Report updated' });
});

module.exports = router;