const express = require('express');
const { getDb } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.get('/dashboard', (req, res) => {
  const db = getDb();
  const { district } = req.query;

  const f = district ? ' AND district = ?' : '';
  const p = district ? [district] : [];

  const activeIncidents = db.prepare(`SELECT COUNT(*) as c FROM env_incidents WHERE status NOT IN ('resolved') ${f}`).get(...p).c;
  const criticalIncidents = db.prepare(`SELECT COUNT(*) as c FROM env_incidents WHERE severity IN ('critical','emergency') AND status NOT IN ('resolved') ${f}`).get(...p).c;
  const citizenReports = db.prepare(`SELECT COUNT(*) as c FROM citizen_reports WHERE status NOT IN ('resolved') ${f}`).get(...p).c;
  const pendingTasks = db.prepare(`SELECT COUNT(*) as c FROM task_assignments WHERE status IN ('assigned','in_progress') ${f}`).get(...p).c;
  const activeTickets = db.prepare(`SELECT COUNT(*) as c FROM response_tickets WHERE status NOT IN ('resolved','closed') ${f}`).get(...p).c;
  const activeAlerts = db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE status = 'active' ${f.replace('district', 'district')}`).get(...p).c;

  const liveIncidents = db.prepare(`SELECT * FROM env_incidents WHERE status NOT IN ('resolved') ${f} ORDER BY CASE severity WHEN 'emergency' THEN 1 WHEN 'critical' THEN 2 WHEN 'high' THEN 3 ELSE 4 END, created_at DESC LIMIT 10`).all(...p);
  const recentCitizenReports = db.prepare(`SELECT cr.*, COALESCE(ia.ai_risk_score, 0) as ai_risk_score FROM citizen_reports cr LEFT JOIN incident_analysis ia ON cr.id = ia.report_id WHERE cr.status NOT IN ('resolved') ${f} ORDER BY cr.created_at DESC LIMIT 10`).all(...p);
  const recentTickets = db.prepare(`SELECT * FROM response_tickets WHERE status NOT IN ('resolved','closed') ${f} ORDER BY created_at DESC LIMIT 10`).all(...p);
  const activeAgencies = db.prepare(`SELECT aa.*, ei.title as incident_title, ei.severity FROM agency_assignments aa JOIN env_incidents ei ON aa.incident_id = ei.id WHERE aa.status = 'active' ORDER BY aa.assigned_at DESC LIMIT 15`).all();
  const riskLevels = db.prepare(`SELECT district, overall_resilience_score FROM resilience_scores ORDER BY overall_resilience_score ASC LIMIT 5`).all();

  const bySeverity = db.prepare(`SELECT severity, COUNT(*) as c FROM env_incidents WHERE 1=1 ${f} GROUP BY severity`).all(...p);
  const byType = db.prepare(`SELECT incident_type, COUNT(*) as c FROM env_incidents WHERE 1=1 ${f} GROUP BY incident_type ORDER BY c DESC`).all(...p);

  res.json({
    success: true,
    data: {
      summary: { active_incidents: activeIncidents, critical_incidents: criticalIncidents, citizen_reports: citizenReports, pending_tasks: pendingTasks, active_tickets: activeTickets, active_alerts: activeAlerts },
      live_incidents: liveIncidents,
      citizen_reports_list: recentCitizenReports,
      tickets: recentTickets,
      agencies: activeAgencies,
      risk_levels: riskLevels,
      by_severity: bySeverity,
      by_type: byType,
    }
  });
});

router.get('/live-map', (req, res) => {
  const db = getDb();
  const incidents = db.prepare(`SELECT id, title, incident_type, severity, status, district, lat, lng, affected_population, ai_risk_score, created_at FROM env_incidents WHERE lat IS NOT NULL AND status NOT IN ('resolved') ORDER BY created_at DESC`).all();
  const reports = db.prepare(`SELECT id, incident_type, severity, status, district, lat, lng, affected_population FROM citizen_reports WHERE lat IS NOT NULL AND status NOT IN ('resolved') ORDER BY created_at DESC`).all();
  const hotspots = db.prepare(`SELECT * FROM pollution_hotspots WHERE active = 1`).all();

  res.json({ success: true, data: { incidents, reports, hotspots } });
});

router.get('/tickets', (req, res) => {
  const db = getDb();
  const { status, priority, limit = 50 } = req.query;
  let sql = `SELECT rt.*, u.name as created_by_name FROM response_tickets rt LEFT JOIN users u ON rt.created_by = u.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND rt.status = ?'; params.push(status); }
  if (priority) { sql += ' AND rt.priority = ?'; params.push(priority); }
  sql += ` ORDER BY CASE rt.priority WHEN 'emergency' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, rt.created_at DESC LIMIT ${+limit}`;
  res.json({ success: true, data: db.prepare(sql).all(...params) });
});

router.put('/tickets/:id/status', requireRole('national_admin','district_officer'), (req, res) => {
  const db = getDb();
  const { status, resolution_notes } = req.body;
  const valid = ['open', 'in_progress', 'resolved', 'closed'];
  if (!valid.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
  const resolved_at = status === 'resolved' || status === 'closed' ? new Date().toISOString() : null;
  db.prepare(`UPDATE response_tickets SET status = ?, resolution_notes = COALESCE(?, resolution_notes), resolved_at = ? WHERE id = ?`).run(status, resolution_notes || null, resolved_at, req.params.id);
  res.json({ success: true });
});

router.post('/tickets', requireRole('national_admin','district_officer'), (req, res) => {
  const db = getDb();
  const { report_id, incident_id, title, description, priority, assigned_team, assigned_agency, district, location, lat, lng, response_deadline } = req.body;
  if (!title || !district) return res.status(400).json({ success: false, error: 'Title and district required' });

  const ticketNum = `TKT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const result = db.prepare(`INSERT INTO response_tickets (report_id, incident_id, ticket_number, title, description, priority, status, assigned_team, assigned_agency, district, location, lat, lng, response_deadline, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    report_id || null, incident_id || null, ticketNum, title, description || null,
    priority || 'medium', 'open', assigned_team || null, assigned_agency || null,
    district, location || null, lat || null, lng || null,
    response_deadline || null, req.user.id
  );

  res.status(201).json({ success: true, id: result.lastInsertRowid, ticket_number: ticketNum });
});

module.exports = router;
