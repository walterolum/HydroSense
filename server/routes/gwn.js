/**
 * Phase 3 — Guardian Water Network (GWN)
 * Citizen Science Pollution Reporting
 */
const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

/* ── Public: Submit report (anonymous supported) ── */
router.post('/reports', (req, res) => {
  const db = getDb();
  const {
    reporter_name, reporter_phone, reporter_type = 'citizen',
    report_type, description, district, sub_county, village,
    lat, lng, severity = 'medium', is_anonymous = 0, channel = 'app',
    photo_base64, ai_score, ai_risk, ai_action,
  } = req.body;
  if (!report_type || !district) {
    return res.status(400).json({ success: false, error: 'report_type and district are required' });
  }
  const result = db.prepare(`
    INSERT INTO gwn_reports
      (reporter_name, reporter_phone, reporter_type, report_type, description,
       district, sub_county, village, lat, lng, severity, is_anonymous, channel,
       photo_key, ai_score, ai_risk, ai_action)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    is_anonymous ? 'Anonymous' : (reporter_name || 'Anonymous'),
    is_anonymous ? null : reporter_phone,
    reporter_type, report_type, description,
    district, sub_county, village, lat, lng, severity,
    is_anonymous ? 1 : 0, channel,
    photo_base64 || null, ai_score || null, ai_risk || null, ai_action || null,
  );
  if (severity === 'critical') {
    db.prepare(`UPDATE gwn_reports SET escalated=1, escalation_level='national' WHERE id=?`).run(result.lastInsertRowid);
    db.prepare(`INSERT INTO alerts (alert_type, severity, district, title, message, source)
      VALUES ('contamination','critical',?,'GWN Critical Report: ' || ?,'Citizen report: ' || ? || ' in ' || ?,'gwn')`
    ).run(district, report_type, report_type, district);
  }
  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

/* ── Public: List reports ── */
router.get('/reports', (req, res) => {
  const db = getDb();
  const { district, status, type, limit = 50, offset = 0 } = req.query;
  let sql = `SELECT * FROM gwn_reports WHERE 1=1`;
  const p = [];
  if (district) { sql += ' AND district=?'; p.push(district); }
  if (status)   { sql += ' AND status=?';   p.push(status); }
  if (type)     { sql += ' AND report_type=?'; p.push(type); }
  sql += ` ORDER BY created_at DESC LIMIT ${+limit} OFFSET ${+offset}`;
  const data = db.prepare(sql).all(...p);
  const total = db.prepare(`SELECT COUNT(*) as c FROM gwn_reports WHERE 1=1${district?' AND district=?':''}${status?' AND status=?':''}${type?' AND report_type=?':''}`).get(...p).c;
  res.json({ success: true, data, total });
});

/* ── Public: Stats ── */
router.get('/stats', (req, res) => {
  const db = getDb();
  const { district } = req.query;
  const f = district ? 'AND district=?' : '';
  const p = district ? [district] : [];
  const total    = db.prepare(`SELECT COUNT(*) as c FROM gwn_reports WHERE 1=1 ${f}`).get(...p).c;
  const verified = db.prepare(`SELECT COUNT(*) as c FROM gwn_reports WHERE status='verified' ${f}`).get(...p).c;
  const critical = db.prepare(`SELECT COUNT(*) as c FROM gwn_reports WHERE severity='critical' ${f}`).get(...p).c;
  const today    = db.prepare(`SELECT COUNT(*) as c FROM gwn_reports WHERE date(created_at)=date('now') ${f}`).get(...p).c;
  const byType   = db.prepare(`SELECT report_type, COUNT(*) as count FROM gwn_reports WHERE 1=1 ${f} GROUP BY report_type ORDER BY count DESC`).all(...p);
  const byStatus = db.prepare(`SELECT status, COUNT(*) as count FROM gwn_reports WHERE 1=1 ${f} GROUP BY status`).all(...p);
  const hotspots = db.prepare(`SELECT * FROM pollution_hotspots WHERE 1=1${district?' AND district=?':''} ORDER BY pollution_score DESC LIMIT 8`).all(...p);
  const recent   = db.prepare(`SELECT * FROM gwn_reports WHERE 1=1 ${f} ORDER BY created_at DESC LIMIT 5`).all(...p);
  res.json({ success: true, data: { total, verified, critical, today, byType, byStatus, hotspots, recent } });
});

/* ── Public: Vote on report ── */
router.post('/reports/:id/vote', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE gwn_reports SET community_votes=community_votes+1 WHERE id=?`).run(req.params.id);
  const r = db.prepare(`SELECT * FROM gwn_reports WHERE id=?`).get(req.params.id);
  if (r && r.community_votes >= 5 && r.status === 'submitted') {
    db.prepare(`UPDATE gwn_reports SET status='verified' WHERE id=?`).run(req.params.id);
  }
  res.json({ success: true });
});

/* ── Protected: Update report ── */
router.put('/reports/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { status, assigned_agency, resolution_notes, escalated, escalation_level, satellite_verified } = req.body;
  const fields = []; const vals = [];
  if (status !== undefined)             { fields.push('status=?');             vals.push(status); }
  if (assigned_agency !== undefined)    { fields.push('assigned_agency=?');    vals.push(assigned_agency); }
  if (resolution_notes !== undefined)   { fields.push('resolution_notes=?');   vals.push(resolution_notes); }
  if (escalated !== undefined)          { fields.push('escalated=?');          vals.push(escalated ? 1 : 0); }
  if (escalation_level !== undefined)   { fields.push('escalation_level=?');   vals.push(escalation_level); }
  if (satellite_verified !== undefined) { fields.push('satellite_verified=?'); vals.push(satellite_verified ? 1 : 0); }
  if (!fields.length) return res.status(400).json({ success: false, error: 'No fields to update' });
  fields.push(`updated_at=datetime('now')`);
  vals.push(req.params.id);
  db.prepare(`UPDATE gwn_reports SET ${fields.join(',')} WHERE id=?`).run(...vals);
  res.json({ success: true });
});

/* ── Public: Hotspots ── */
router.get('/hotspots', (req, res) => {
  const db = getDb();
  const { district } = req.query;
  const rows = district
    ? db.prepare(`SELECT * FROM pollution_hotspots WHERE district=? ORDER BY pollution_score DESC`).all(district)
    : db.prepare(`SELECT * FROM pollution_hotspots ORDER BY pollution_score DESC`).all();
  res.json({ success: true, data: rows });
});

module.exports = router;
