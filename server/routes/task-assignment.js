const express = require('express');
const { getDb } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.get('/', (req, res) => {
  const db = getDb();
  const { status, district, department, limit = 50 } = req.query;
  let sql = `SELECT ta.*, u.name as assigned_to_name, a.name as assigned_by_name, cr.incident_type, cr.description as report_description, cr.district as report_district
    FROM task_assignments ta
    LEFT JOIN users u ON ta.assigned_to = u.id
    LEFT JOIN users a ON ta.assigned_by = a.id
    LEFT JOIN citizen_reports cr ON ta.report_id = cr.id
    WHERE 1=1`;
  const params = [];

  if (req.user.role === 'citizen') {
    sql += ' AND (cr.user_id = ? OR ta.assigned_to = ?)';
    params.push(req.user.id, req.user.id);
  }
  if (status) { sql += ' AND ta.status = ?'; params.push(status); }
  if (district) { sql += ' AND ta.district = ?'; params.push(district); }
  if (department) { sql += ' AND ta.department = ?'; params.push(department); }

  sql += ` ORDER BY ta.created_at DESC LIMIT ${+limit}`;
  res.json({ success: true, data: db.prepare(sql).all(...params) });
});

router.get('/my-tasks', (req, res) => {
  const db = getDb();
  const tasks = db.prepare(`
    SELECT ta.*, u.name as assigned_by_name, cr.incident_type, cr.description as report_description, cr.district as report_district, cr.severity
    FROM task_assignments ta
    LEFT JOIN users u ON ta.assigned_by = u.id
    LEFT JOIN citizen_reports cr ON ta.report_id = cr.id
    WHERE ta.assigned_to = ?
    ORDER BY CASE ta.priority WHEN 'emergency' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, ta.created_at DESC
  `).all(req.user.id);
  res.json({ success: true, data: tasks });
});

router.post('/auto-assign', requireRole('national_admin','district_officer'), (req, res) => {
  const db = getDb();
  const { report_id, incident_id } = req.body;

  const report = report_id ? db.prepare(`SELECT * FROM citizen_reports WHERE id = ?`).get(report_id) : null;
  const incident = incident_id ? db.prepare(`SELECT * FROM env_incidents WHERE id = ?`).get(incident_id) : null;

  const district = report?.district || incident?.district;
  const incidentType = report?.incident_type || incident?.incident_type;

  const officer = db.prepare(`SELECT id, name, role FROM users WHERE district = ? AND role IN ('district_officer','technician','health_officer') AND active = 1 ORDER BY last_login DESC LIMIT 1`).get(district);

  const departmentMap = {
    water_pollution: 'Water Quality', illegal_dumping: 'Enforcement',
    sewage_leak: 'Sanitation', flooding: 'Emergency Response',
    environmental_hazard: 'Environmental Protection',
    infrastructure_damage: 'Infrastructure',
    water_contamination: 'Health & Safety',
    industrial_discharge: 'Environmental Protection',
    sewage_overflow: 'Sanitation',
  };

  const priorityMap = { emergency: 'emergency', critical: 'high', high: 'high', medium: 'medium', low: 'low' };

  const assignment = {
    report_id: report_id || null,
    incident_id: incident_id || null,
    assigned_to: officer?.id || null,
    assigned_by: req.user.id,
    task_type: `${incidentType || 'general'} response`,
    priority: priorityMap[report?.severity || incident?.severity || 'medium'] || 'medium',
    status: 'assigned',
    department: departmentMap[incidentType] || 'General',
    district: district,
    description: report?.description || incident?.description || 'Investigate and respond to reported incident',
    location: report?.village || incident?.village || district,
  };

  const result = db.prepare(`INSERT INTO task_assignments (report_id, incident_id, assigned_to, assigned_by, task_type, priority, status, department, district, description, location) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    assignment.report_id, assignment.incident_id, assignment.assigned_to, assignment.assigned_by,
    assignment.task_type, assignment.priority, assignment.status, assignment.department,
    assignment.district, assignment.description, assignment.location
  );

  if (report_id) {
    db.prepare(`UPDATE citizen_reports SET status = 'assigned', updated_at = datetime('now') WHERE id = ?`).run(report_id);
    db.prepare(`INSERT INTO citizen_report_tracking (report_id, status, note, updated_by) VALUES (?, 'assigned', ?, ?)`).run(report_id, `Task automatically assigned to ${officer?.name || 'appropriate officer'}`, req.user.id);
  }

  const ticketNum = `TKT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  db.prepare(`INSERT INTO response_tickets (report_id, incident_id, ticket_number, title, description, priority, status, assigned_team, district, location, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    report_id || null, incident_id || null, ticketNum,
    `${incidentType || 'Incident'} Response - ${district}`,
    assignment.description, assignment.priority, 'open',
    officer?.name || 'Unassigned', district, assignment.location, req.user.id
  );

  res.status(201).json({ success: true, id: result.lastInsertRowid, ticket: ticketNum, message: `Task assigned to ${officer?.name || 'appropriate district officer'}. Ticket: ${ticketNum}` });
});

router.post('/', requireRole('national_admin','district_officer'), (req, res) => {
  const db = getDb();
  const { report_id, incident_id, assigned_to, task_type, priority, department, district, description, location, due_by } = req.body;
  if (!assigned_to || !task_type) return res.status(400).json({ success: false, error: 'assigned_to and task_type required' });

  const result = db.prepare(`INSERT INTO task_assignments (report_id, incident_id, assigned_to, assigned_by, task_type, priority, status, department, district, description, location, due_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    report_id || null, incident_id || null, assigned_to, req.user.id,
    task_type, priority || 'medium', 'assigned', department || null,
    district || null, description || null, location || null, due_by || null
  );

  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

router.put('/:id/status', (req, res) => {
  const db = getDb();
  const { status, notes } = req.body;
  const valid = ['assigned', 'in_progress', 'completed', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });

  const completed_at = status === 'completed' ? new Date().toISOString() : null;
  db.prepare(`UPDATE task_assignments SET status=?, notes=?, completed_at=? WHERE id=?`).run(status, notes || null, completed_at, req.params.id);

  if (status === 'completed') {
    const task = db.prepare(`SELECT * FROM task_assignments WHERE id = ?`).get(req.params.id);
    if (task?.report_id) {
      db.prepare(`UPDATE citizen_reports SET status = 'resolved', updated_at = datetime('now') WHERE id = ?`).run(task.report_id);
      db.prepare(`INSERT INTO citizen_report_tracking (report_id, status, note, updated_by) VALUES (?, 'resolved', 'Issue resolved and task completed', ?)`).run(task.report_id, req.user.id);
    }
  }

  res.json({ success: true });
});

router.get('/stats', (req, res) => {
  const db = getDb();
  const total = db.prepare(`SELECT COUNT(*) as c FROM task_assignments`).get().c;
  const byStatus = db.prepare(`SELECT status, COUNT(*) as c FROM task_assignments GROUP BY status`).all();
  const byDepartment = db.prepare(`SELECT department, COUNT(*) as c FROM task_assignments WHERE department IS NOT NULL GROUP BY department ORDER BY c DESC`).all();
  const byPriority = db.prepare(`SELECT priority, COUNT(*) as c FROM task_assignments GROUP BY priority`).all();
  const pending = db.prepare(`SELECT COUNT(*) as c FROM task_assignments WHERE status IN ('assigned','in_progress')`).get().c;
  const completed = db.prepare(`SELECT COUNT(*) as c FROM task_assignments WHERE status = 'completed'`).get().c;
  res.json({ success: true, data: { total, by_status: byStatus, by_department: byDepartment, by_priority: byPriority, pending, completed } });
});

module.exports = router;
