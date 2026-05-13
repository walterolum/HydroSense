const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/my-reports', authMiddleware, (req, res) => {
  const db = getDb();
  const reports = db.prepare(`
    SELECT cr.*, 
      COALESCE(ia.ai_severity, cr.severity) as ai_severity,
      ia.ai_risk_score, ia.ai_category, ia.response_recommendation,
      (SELECT status FROM citizen_report_tracking WHERE report_id = cr.id ORDER BY created_at DESC LIMIT 1) as current_status,
      (SELECT note FROM citizen_report_tracking WHERE report_id = cr.id ORDER BY created_at DESC LIMIT 1) as latest_note
    FROM citizen_reports cr
    LEFT JOIN incident_analysis ia ON cr.id = ia.report_id
    WHERE cr.user_id = ?
    ORDER BY cr.created_at DESC
  `).all(req.user.id);

  const enriched = reports.map(r => {
    const tracking = db.prepare(`SELECT ct.*, u.name as updated_by_name FROM citizen_report_tracking ct LEFT JOIN users u ON ct.updated_by = u.id WHERE ct.report_id = ? ORDER BY ct.created_at DESC`).all(r.id);
    return { ...r, tracking };
  });

  res.json({ success: true, data: enriched });
});

router.get('/my-reports/stats', authMiddleware, (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const total = db.prepare(`SELECT COUNT(*) as c FROM citizen_reports WHERE user_id = ?`).get(uid).c;
  const byStatus = db.prepare(`SELECT status, COUNT(*) as c FROM citizen_reports WHERE user_id = ? GROUP BY status`).all(uid);
  const byType = db.prepare(`SELECT incident_type, COUNT(*) as c FROM citizen_reports WHERE user_id = ? GROUP BY incident_type`).all(uid);
  const pending = db.prepare(`SELECT COUNT(*) as c FROM citizen_reports WHERE user_id = ? AND status IN ('pending','submitted')`).get(uid).c;
  const resolved = db.prepare(`SELECT COUNT(*) as c FROM citizen_reports WHERE user_id = ? AND status = 'resolved'`).get(uid).c;
  const inProgress = db.prepare(`SELECT COUNT(*) as c FROM citizen_reports WHERE user_id = ? AND status IN ('under_investigation','assigned')`).get(uid).c;
  const escalated = db.prepare(`SELECT COUNT(*) as c FROM citizen_reports WHERE user_id = ? AND status = 'escalated'`).get(uid).c;

  const statusFlow = [
    { status: 'submitted', label: 'Submitted', count: db.prepare(`SELECT COUNT(*) as c FROM citizen_reports WHERE user_id = ? AND status = 'pending'`).get(uid).c + pending - inProgress - resolved - escalated },
    { status: 'under_investigation', label: 'Under Investigation', count: inProgress > 0 ? 1 : 0 },
    { status: 'assigned', label: 'Assigned', count: inProgress > 0 ? 1 : 0 },
    { status: 'resolved', label: 'Resolved', count: resolved },
    { status: 'escalated', label: 'Escalated', count: escalated },
  ];

  res.json({ success: true, data: { total, by_status: byStatus, by_type: byType, pending, in_progress: inProgress, resolved, escalated, status_flow: statusFlow } });
});

module.exports = router;
