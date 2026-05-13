const express = require('express');
const { getDb } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const db = getDb();
  const { district, status, type } = req.query;
  let sql = 'SELECT * FROM water_points WHERE 1=1';
  const params = [];
  if (district) { sql += ' AND district = ?'; params.push(district); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (type) { sql += ' AND type = ?'; params.push(type); }
  sql += ' ORDER BY district, name';
  const data = db.prepare(sql).all(...params);
  res.json({ success: true, data, total: data.length });
});

router.get('/stats', (req, res) => {
  const db = getDb();
  const { district } = req.query;
  const distFilter = district ? 'AND district = ?' : '';
  const params = district ? [district] : [];

  const total = db.prepare(`SELECT COUNT(*) as count FROM water_points WHERE 1=1 ${distFilter}`).get(...params);
  const byStatus = db.prepare(`SELECT status, COUNT(*) as count FROM water_points WHERE 1=1 ${distFilter} GROUP BY status`).all(...params);
  const byType = db.prepare(`SELECT type, COUNT(*) as count FROM water_points WHERE 1=1 ${distFilter} GROUP BY type`).all(...params);
  const byDistrict = db.prepare(`SELECT district, COUNT(*) as total, SUM(CASE WHEN status='functional' THEN 1 ELSE 0 END) as functional, SUM(beneficiaries) as beneficiaries FROM water_points GROUP BY district ORDER BY total DESC`).all();
  const avgScore = db.prepare(`SELECT AVG(infrastructure_score) as avg_score FROM water_points WHERE 1=1 ${distFilter}`).get(...params);
  const totalBeneficiaries = db.prepare(`SELECT SUM(beneficiaries) as total FROM water_points WHERE 1=1 ${distFilter}`).get(...params);

  res.json({
    success: true,
    data: {
      total: total.count,
      by_status: byStatus,
      by_type: byType,
      by_district: byDistrict,
      avg_infrastructure_score: Math.round(avgScore.avg_score || 0),
      total_beneficiaries: totalBeneficiaries.total || 0
    }
  });
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const wp = db.prepare('SELECT * FROM water_points WHERE id = ?').get(req.params.id);
  if (!wp) return res.status(404).json({ success: false, error: 'Water point not found' });

  const sensors = db.prepare('SELECT * FROM sensors WHERE water_point_id = ?').all(wp.id);
  const recentTests = db.prepare('SELECT * FROM water_quality_tests WHERE water_point_id = ? ORDER BY tested_at DESC LIMIT 5').all(wp.id);
  const recentMaintenance = db.prepare('SELECT mr.*, u.name as technician_name FROM maintenance_requests mr LEFT JOIN users u ON mr.assigned_to = u.id WHERE mr.water_point_id = ? ORDER BY mr.created_at DESC LIMIT 5').all(wp.id);
  const fund = db.prepare('SELECT * FROM maintenance_funds WHERE water_point_id = ?').get(wp.id);
  const alerts = db.prepare('SELECT * FROM alerts WHERE water_point_id = ? AND status = "active" ORDER BY created_at DESC').all(wp.id);

  res.json({ success: true, data: { ...wp, sensors, recentTests, recentMaintenance, fund, alerts } });
});

// Create — restricted to: System Admin, District Water Officer, Field Technician
router.post('/', requireRole('national_admin', 'district_officer', 'technician'), (req, res) => {
  const db = getDb();
  const { name, type, status, lat, lng, district, sub_county, village, yield_lph, depth_m, pump_type, solar_powered, installed_date, beneficiaries, households, notes } = req.body;
  if (!name || !type || !lat || !lng || !district) return res.status(400).json({ success: false, error: 'Required fields missing' });

  const result = db.prepare(`
    INSERT INTO water_points (name, type, status, lat, lng, district, sub_county, village, yield_lph, depth_m, pump_type, solar_powered, installed_date, beneficiaries, households, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, type, status || 'functional', lat, lng, district, sub_county, village, yield_lph, depth_m, pump_type, solar_powered || 0, installed_date, beneficiaries || 0, households || 0, notes);

  db.prepare("INSERT INTO governance_audit (user_id, action, entity_type, entity_id, details) VALUES (?, 'CREATE', 'water_point', ?, ?)").run(req.user.id, result.lastInsertRowid, `Created water point: ${name}`);
  res.status(201).json({ success: true, id: result.lastInsertRowid, message: 'Water point created successfully' });
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const { name, status, beneficiaries, households, notes, infrastructure_score, next_maintenance, last_maintained } = req.body;
  db.prepare(`UPDATE water_points SET name=COALESCE(?,name), status=COALESCE(?,status), beneficiaries=COALESCE(?,beneficiaries), households=COALESCE(?,households), notes=COALESCE(?,notes), infrastructure_score=COALESCE(?,infrastructure_score), next_maintenance=COALESCE(?,next_maintenance), last_maintained=COALESCE(?,last_maintained) WHERE id=?`).run(name, status, beneficiaries, households, notes, infrastructure_score, next_maintenance, last_maintained, req.params.id);
  db.prepare("INSERT INTO governance_audit (user_id, action, entity_type, entity_id, details) VALUES (?, 'UPDATE', 'water_point', ?, ?)").run(req.user.id, req.params.id, `Updated water point #${req.params.id}`);
  res.json({ success: true, message: 'Updated successfully' });
});

module.exports = router;
