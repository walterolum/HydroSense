/**
 * Phase 6 — Environmental Incident Command Center
 * Multi-agency coordination and escalation management
 */
const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

/* ── Dashboard summary ── */
router.get('/dashboard', async (req, res) => {
  const db = await getDb();
  const { district } = req.query;
  const f = district ? 'AND district=?' : '';
  const p = district ? [district] : [];
  const active = (await db.prepare(`SELECT COUNT(*) as c FROM env_incidents WHERE status NOT IN ('resolved') ${f}`).get(...p)).c;
  const critical = (await db.prepare(`SELECT COUNT(*) as c FROM env_incidents WHERE severity IN ('critical','emergency') AND status NOT IN ('resolved') ${f}`).get(...p)).c;
  const res24h = (await db.prepare(`SELECT COUNT(*) as c FROM env_incidents WHERE status='resolved' AND resolved_at >= datetime('now','-24 hours') ${f}`).get(...p)).c;
  const avgRisk = await db.prepare(`SELECT AVG(ai_risk_score) as avg FROM env_incidents WHERE 1=1 ${f}`).get(...p);
  const byType = await db.prepare(`SELECT incident_type, COUNT(*) as count FROM env_incidents WHERE 1=1 ${f} GROUP BY incident_type ORDER BY count DESC`).all(...p);
  const bySev = await db.prepare(`SELECT severity, COUNT(*) as count FROM env_incidents WHERE 1=1 ${f} GROUP BY severity`).all(...p);
  const gwnPend = (await db.prepare(`SELECT COUNT(*) as c FROM gwn_reports WHERE status IN ('submitted','verified') ${f}`).get(...p)).c;
  const escalated = (await db.prepare(`SELECT COUNT(*) as c FROM gwn_reports WHERE escalated=1 AND status NOT IN ('resolved') ${f}`).get(...p)).c;
  const recent = await db.prepare(`SELECT * FROM env_incidents WHERE 1=1 ${f} ORDER BY CASE severity WHEN 'emergency' THEN 1 WHEN 'critical' THEN 2 WHEN 'high' THEN 3 ELSE 4 END, created_at DESC LIMIT 5`).all(...p);
  res.json({ success: true, data: { active_incidents: active, critical_incidents: critical, resolved_24h: res24h, avg_ai_risk: Math.round((avgRisk.avg || 0) * 10) / 10, gwn_pending_review: gwnPend, escalated_reports: escalated, by_type: byType, by_severity: bySev, recent_incidents: recent } });
});

/* ── List incidents ── */
router.get('/', async (req, res) => {
  const db = await getDb();
  const { district, status, severity, limit = 50 } = req.query;
  let sql = `SELECT ei.*, (SELECT COUNT(*) FROM agency_assignments aa WHERE aa.incident_id=ei.id) as agency_count FROM env_incidents ei WHERE 1=1`;
  const p = [];
  if (district) {sql += ' AND ei.district=?';p.push(district);}
  if (status) {sql += ' AND ei.status=?';p.push(status);}
  if (severity) {sql += ' AND ei.severity=?';p.push(severity);}
  sql += ` ORDER BY CASE ei.severity WHEN 'emergency' THEN 1 WHEN 'critical' THEN 2 WHEN 'high' THEN 3 ELSE 4 END, ei.created_at DESC LIMIT ${+limit}`;
  res.json({ success: true, data: await db.prepare(sql).all(...p) });
});

/* ── Single incident ── */
router.get('/:id', async (req, res) => {
  const db = await getDb();
  const inc = await db.prepare(`SELECT * FROM env_incidents WHERE id=?`).get(req.params.id);
  if (!inc) return res.status(404).json({ success: false, error: 'Not found' });
  const agencies = await db.prepare(`SELECT * FROM agency_assignments WHERE incident_id=?`).all(req.params.id);
  const related = await db.prepare(`SELECT * FROM gwn_reports WHERE district=? AND status NOT IN ('resolved','rejected') ORDER BY created_at DESC LIMIT 5`).all(inc.district);
  res.json({ success: true, data: { ...inc, agencies, related_gwn: related } });
});

/* ── Create incident ── */
router.post('/', async (req, res) => {
  const db = await getDb();
  const { incident_type, title, description, district, sub_county, village, lat, lng, severity = 'medium', affected_population = 0 } = req.body;
  if (!incident_type || !title || !district) return res.status(400).json({ success: false, error: 'incident_type, title, and district are required' });
  const riskMap = { emergency: 95, critical: 85, high: 68, medium: 45, low: 22 };
  const ai_risk = (riskMap[severity] || 45) + (Math.random() * 8 - 4);
  const result = await db.prepare(`INSERT INTO env_incidents (incident_type, title, description, district, sub_county, village, lat, lng, severity, reported_by, affected_population, ai_risk_score) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(incident_type, title, description, district, sub_county, village, lat, lng, severity, req.user.id, affected_population, Math.round(ai_risk * 10) / 10);
  if (severity === 'critical' || severity === 'emergency') {
    await db.prepare(`INSERT INTO alerts (alert_type, severity, district, title, message, source) VALUES ('contamination',?,?,?,?,'incident_command')`).run(severity, district, `Environmental Incident: ${title}`, description?.slice(0, 200) || '');
  }
  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

/* ── Update status ── */
router.put('/:id/status', async (req, res) => {
  const db = await getDb();
  const { status, notes } = req.body;
  const valid = ['active', 'investigating', 'contained', 'resolved', 'escalated', 'monitoring'];
  if (!valid.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
  const resolved_at = status === 'resolved' ? new Date().toISOString() : null;
  await db.prepare(`UPDATE env_incidents SET status=?, resolution_notes=?, resolved_at=? WHERE id=?`).run(status, notes || null, resolved_at, req.params.id);
  res.json({ success: true });
});

/* ── Escalate ── */
router.post('/:id/escalate', async (req, res) => {
  const db = await getDb();
  const { reason } = req.body;
  const inc = await db.prepare(`SELECT * FROM env_incidents WHERE id=?`).get(req.params.id);
  if (!inc) return res.status(404).json({ success: false, error: 'Not found' });
  await db.prepare(`UPDATE env_incidents SET status='escalated' WHERE id=?`).run(req.params.id);
  await db.prepare(`INSERT INTO alerts (alert_type, severity, district, title, message, source) VALUES ('contamination',?,?,'ESCALATED: ' || ?,?,'incident_escalation')`).run(inc.severity, inc.district, inc.title, `Incident escalated to national level. Reason: ${reason || 'Requires national multi-agency response.'}`);
  res.json({ success: true });
});

/* ── Assign agency ── */
router.post('/:id/agencies', async (req, res) => {
  const db = await getDb();
  const { agency_name, agency_role = 'support', officer_name, contact } = req.body;
  if (!agency_name) return res.status(400).json({ success: false, error: 'agency_name required' });
  const result = await db.prepare(`INSERT INTO agency_assignments (incident_id, agency_name, agency_role, officer_name, contact) VALUES (?,?,?,?,?)`).run(req.params.id, agency_name, agency_role, officer_name, contact);
  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

/* ── Agency list ── */
router.get('/:id/agencies', async (req, res) => {
  const db = await getDb();
  res.json({ success: true, data: await db.prepare(`SELECT * FROM agency_assignments WHERE incident_id=?`).all(req.params.id) });
});

/* ── Pollution hotspots ── */
router.get('/pollution/hotspots', async (req, res) => {
  const db = await getDb();
  const { district } = req.query;
  const rows = district ? await
  db.prepare(`SELECT * FROM pollution_hotspots WHERE district=? ORDER BY pollution_score DESC`).all(district) : await
  db.prepare(`SELECT * FROM pollution_hotspots ORDER BY pollution_score DESC`).all();
  res.json({ success: true, data: rows });
});

module.exports = router;