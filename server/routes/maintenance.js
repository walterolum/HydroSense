const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { notifyForMaintenance } = require('../utils/notify');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const db = await getDb();
  const { status, district, priority } = req.query;
  let sql = `SELECT mr.*, wp.name as water_point_name, wp.district, wp.lat, wp.lng,
    u1.name as reporter_name, u2.name as technician_name
    FROM maintenance_requests mr
    JOIN water_points wp ON mr.water_point_id = wp.id
    LEFT JOIN users u1 ON mr.reported_by = u1.id
    LEFT JOIN users u2 ON mr.assigned_to = u2.id
    WHERE 1=1`;
  const params = [];
  if (status) {sql += ' AND mr.status = ?';params.push(status);}
  if (district) {sql += ' AND wp.district = ?';params.push(district);}
  if (priority) {sql += ' AND mr.priority = ?';params.push(priority);}
  sql += " ORDER BY CASE mr.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, mr.created_at DESC";
  const data = await db.prepare(sql).all(...params);
  res.json({ success: true, data, total: data.length });
});

router.get('/stats', async (req, res) => {
  const db = await getDb();
  const byStatus = await db.prepare('SELECT status, COUNT(*) as count FROM maintenance_requests GROUP BY status').all();
  const byPriority = await db.prepare('SELECT priority, COUNT(*) as count FROM maintenance_requests GROUP BY priority').all();
  const avgResolution = await db.prepare("SELECT AVG(JULIANDAY(completed_at) - JULIANDAY(created_at)) * 24 as avg_hours FROM maintenance_requests WHERE completed_at IS NOT NULL").get();
  const overdue = await db.prepare("SELECT COUNT(*) as count FROM maintenance_requests WHERE status NOT IN ('completed','cancelled') AND created_at < datetime('now', '-7 days')").get();
  const parts = await db.prepare('SELECT * FROM spare_parts ORDER BY part_name').all();
  res.json({
    success: true,
    data: { by_status: byStatus, by_priority: byPriority, avg_resolution_hours: Math.round(avgResolution.avg_hours || 0), overdue: overdue.count, spare_parts: parts }
  });
});

router.post('/', async (req, res) => {
  const db = await getDb();
  const { water_point_id, issue_type, description, priority, estimated_cost, spare_parts } = req.body;
  if (!water_point_id || !issue_type) return res.status(400).json({ success: false, error: 'water_point_id and issue_type required' });

  const result = await db.prepare(`
    INSERT INTO maintenance_requests (water_point_id, reported_by, issue_type, description, priority, estimated_cost, spare_parts)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(water_point_id, req.user.id, issue_type, description, priority || 'medium', estimated_cost, spare_parts);

  try {
    const wp = await db.prepare('SELECT name, district FROM water_points WHERE id = ?').get(water_point_id);
    if (wp) notifyForMaintenance(wp.district, wp.name, result.lastInsertRowid);
  } catch {}

  res.status(201).json({ success: true, id: result.lastInsertRowid, message: 'Maintenance request created' });
});

router.put('/:id', async (req, res) => {
  const db = await getDb();
  const { status, assigned_to, priority, resolution_notes, actual_cost } = req.body;
  const completed_at = status === 'completed' ? new Date().toISOString() : null;
  await db.prepare(`UPDATE maintenance_requests SET status=COALESCE(?,status), assigned_to=COALESCE(?,assigned_to), priority=COALESCE(?,priority), resolution_notes=COALESCE(?,resolution_notes), actual_cost=COALESCE(?,actual_cost), completed_at=COALESCE(?,completed_at) WHERE id=?`).run(status, assigned_to, priority, resolution_notes, actual_cost, completed_at, req.params.id);
  if (status === 'completed') {
    const mr = await db.prepare('SELECT water_point_id FROM maintenance_requests WHERE id = ?').get(req.params.id);
    if (mr) await db.prepare("UPDATE water_points SET last_maintained = datetime('now'), status = 'functional' WHERE id = ? AND status = 'needs_repair'").run(mr.water_point_id);
  }
  res.json({ success: true, message: 'Updated successfully' });
});

router.get('/funds', async (req, res) => {
  const db = await getDb();
  const funds = await db.prepare(`SELECT mf.*, wp.name as water_point_name, wp.district FROM maintenance_funds mf JOIN water_points wp ON mf.water_point_id = wp.id ORDER BY district`).all();
  const total = await db.prepare('SELECT SUM(balance) as total_balance, SUM(total_collected) as total_collected, SUM(total_spent) as total_spent FROM maintenance_funds').get();
  res.json({ success: true, data: funds, summary: total });
});

module.exports = router;