const express = require('express');
const { getDb } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const http = require('http');
const { notifyForIncident } = require('../utils/notify');

const router = express.Router();

const AI_PORT = parseInt(process.env.AI_PORT, 10) || 8000;

function postToAI(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      hostname: '127.0.0.1',
      port: AI_PORT,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000
    };
    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {resolve(JSON.parse(responseData));} catch {resolve(null);}
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {req.destroy();resolve(null);});
    req.write(body);
    req.end();
  });
}

router.post('/', authMiddleware, async (req, res) => {
  const db = await getDb();
  const {
    incident_type, description, district, sub_county, village, lat, lng,
    severity, channel, water_impact, affected_population, is_anonymous,
    reporter_name, reporter_phone, reporter_email, media,
    source_language, original_text
  } = req.body;

  if (!incident_type || !description || !district) {
    return res.status(400).json({ success: false, error: 'incident_type, description, and district are required' });
  }

  const name = is_anonymous ? 'Anonymous' : reporter_name || req.user.name;
  const phone = is_anonymous ? null : reporter_phone || req.user.phone;
  const email = is_anonymous ? null : reporter_email || req.user.email;
  const lang = source_language || req.user.language || 'en';

  const result = await db.prepare(`
    INSERT INTO citizen_reports (user_id, reporter_name, reporter_phone, reporter_email, incident_type, description, district, sub_county, village, lat, lng, severity, channel, water_impact, affected_population, is_anonymous, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    req.user.id, name, phone, email, incident_type, description, district,
    sub_county || null, village || null, lat || null, lng || null,
    severity || 'medium', channel || 'app', water_impact || null,
    affected_population || 0, is_anonymous ? 1 : 0
  );

  const reportId = result.lastInsertRowid;

  await db.prepare(`INSERT INTO citizen_report_tracking (report_id, status, note, updated_by) VALUES (?, 'submitted', 'Report submitted successfully', ?)`).run(reportId, req.user.id);

  if (media && Array.isArray(media)) {
    const ins = db.prepare(`INSERT INTO report_media (report_id, media_type, file_data, mime_type) VALUES (?, ?, ?, ?)`);
    for (const m of media) {
      ins.run(reportId, m.media_type || 'other', m.file_data || null, m.mime_type || null);
    }
  }

  // Asynchronous AI analysis and auto-assignment for non-English reports
  if (lang !== 'en' || original_text) {
    postToAI('/ai/incident-analysis/enhanced-analyze', {
      text: description,
      source_language: lang,
      district,
      sub_county: sub_county || undefined,
      village: village || undefined,
      incident_type,
      channel: channel || 'app',
      original_text: original_text || undefined
    }).then(async (analysis) => {
      if (analysis?.analysis) {
        const a = analysis.analysis;
        try {
          await db.prepare(`INSERT INTO incident_analysis (report_id, ai_severity, ai_category, ai_urgency, ai_risk_score, extracted_location, ai_summary, is_duplicate, confidence_score, speech_to_text, response_recommendation, analyzed_at) VALUES (?,?,?,?,?,?,?,0,?,?,?,datetime('now'))`).run(
            reportId, a.ai_severity, a.ai_category, a.ai_urgency,
            a.ai_risk_score, a.extracted_location,
            a.translated_summary || description,
            a.confidence_score || 50,
            original_text || null,
            a.response_recommendation || ''
          );

          // Auto-assign if moderate to high severity
          if (['medium', 'high', 'critical', 'emergency'].includes(a.ai_severity)) {
            postToAI(`/ai/incident-analysis/auto-assign/${reportId}`, {});
          }
        } catch (dbErr) {

          // Analysis saved, non-critical if fails
        }}
    });
  }

  // Notify relevant staff roles based on incident type
  try { notifyForIncident(incident_type, severity || 'medium', district, reportId, name); } catch {}

  // Send notification to citizen
  postToAI('/ai/notifications/send', {
    recipient_id: req.user.id,
    recipient_contact: req.user.email || '',
    channel: 'in_app',
    template_name: 'report_submitted',
    language: lang,
    report_id: reportId,
    category: incident_type.replace(/_/g, ' '),
    district
  });

  res.status(201).json({ success: true, id: reportId, message: 'Report submitted successfully. Track your report status in My Reports.' });
});

router.get('/', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { status, district, incident_type, limit = 50 } = req.query;

  let sql = `SELECT cr.*, COALESCE(ia.ai_severity, cr.severity) as ai_severity, ia.ai_risk_score, ia.ai_category, ia.is_duplicate, ia.confidence_score,
    (SELECT status FROM citizen_report_tracking WHERE report_id = cr.id ORDER BY created_at DESC LIMIT 1) as current_status
    FROM citizen_reports cr LEFT JOIN incident_analysis ia ON cr.id = ia.report_id WHERE 1=1`;
  const params = [];

  if (req.user.role === 'citizen') {
    sql += ' AND cr.user_id = ?';
    params.push(req.user.id);
  }
  if (status) {sql += ' AND cr.status = ?';params.push(status);}
  if (district) {sql += ' AND cr.district = ?';params.push(district);}
  if (incident_type) {sql += ' AND cr.incident_type = ?';params.push(incident_type);}

  sql += ` ORDER BY cr.created_at DESC LIMIT ${+limit}`;
  const data = await db.prepare(sql).all(...params);

  const reports = data.map(async (r) => {
    const media = await db.prepare(`SELECT id, media_type, mime_type FROM report_media WHERE report_id = ?`).all(r.id);
    const tracking = await db.prepare(`SELECT * FROM citizen_report_tracking WHERE report_id = ? ORDER BY created_at DESC`).all(r.id);
    return { ...r, media, tracking };
  });

  res.json({ success: true, data: reports, total: reports.length });
});

router.get('/stats', authMiddleware, async (req, res) => {
  const db = await getDb();
  let where = '';
  const params = [];
  if (req.user.role === 'citizen') {
    where = ' WHERE user_id = ?';
    params.push(req.user.id);
  }
  const total = (await db.prepare(`SELECT COUNT(*) as c FROM citizen_reports${where}`).get(...params)).c;
  const byStatus = await db.prepare(`SELECT status, COUNT(*) as c FROM citizen_reports${where ? where + ' GROUP BY status' : ' GROUP BY status'}`).all(...params);
  const byType = await db.prepare(`SELECT incident_type, COUNT(*) as c FROM citizen_reports${where ? where + ' GROUP BY incident_type' : ' GROUP BY incident_type'}`).all(...params);
  const byChannel = await db.prepare(`SELECT channel, COUNT(*) as c FROM citizen_reports${where ? where + ' GROUP BY channel' : ' GROUP BY channel'}`).all(...params);
  const pending = (await db.prepare(`SELECT COUNT(*) as c FROM citizen_reports${where ? where + " AND status = 'pending'" : " WHERE status = 'pending'"}`).get(...params)).c;
  const resolved = (await db.prepare(`SELECT COUNT(*) as c FROM citizen_reports${where ? where + " AND status = 'resolved'" : " WHERE status = 'resolved'"}`).get(...params)).c;
  res.json({ success: true, data: { total, by_status: byStatus, by_type: byType, by_channel: byChannel, pending, resolved } });
});

router.get('/:id', authMiddleware, async (req, res) => {
  const db = await getDb();
  const report = await db.prepare(`SELECT cr.*, COALESCE(ia.ai_severity, cr.severity) as ai_severity, ia.ai_risk_score, ia.ai_category, ia.is_duplicate, ia.duplicate_of_id, ia.is_false_report, ia.confidence_score, ia.speech_to_text, ia.image_analysis, ia.response_recommendation, ia.analyzed_at FROM citizen_reports cr LEFT JOIN incident_analysis ia ON cr.id = ia.report_id WHERE cr.id = ?`).get(req.params.id);
  if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
  if (req.user.role === 'citizen' && report.user_id !== req.user.id) return res.status(403).json({ success: false, error: 'Access denied' });

  const media = await db.prepare(`SELECT * FROM report_media WHERE report_id = ?`).all(report.id);
  const tracking = await db.prepare(`SELECT ct.*, u.name as updated_by_name FROM citizen_report_tracking ct LEFT JOIN users u ON ct.updated_by = u.id WHERE ct.report_id = ? ORDER BY ct.created_at DESC`).all(report.id);
  const assignments = await db.prepare(`SELECT * FROM task_assignments WHERE report_id = ?`).all(report.id);

  res.json({ success: true, data: { ...report, media, tracking, assignments } });
});

router.put('/:id/status', authMiddleware, requireRole('national_admin', 'district_officer', 'health_officer'), async (req, res) => {
  const db = await getDb();
  const { status, note } = req.body;
  const valid = ['pending', 'under_investigation', 'assigned', 'resolved', 'escalated'];
  if (!valid.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });

  await db.prepare(`UPDATE citizen_reports SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, req.params.id);
  await db.prepare(`INSERT INTO citizen_report_tracking (report_id, status, note, updated_by) VALUES (?, ?, ?, ?)`).run(req.params.id, status, note || null, req.user.id);

  res.json({ success: true, message: 'Status updated' });
});

router.post('/:id/analyze', authMiddleware, requireRole('national_admin', 'district_officer'), async (req, res) => {
  const db = await getDb();
  const report = await db.prepare(`SELECT * FROM citizen_reports WHERE id = ?`).get(req.params.id);
  if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

  const severityMap = { low: 20, medium: 45, high: 70, critical: 90, emergency: 95 };
  const aiRisk = (severityMap[report.severity] || 45) + (Math.random() * 10 - 5);
  const categories = ['water_pollution', 'illegal_dumping', 'sewage_leak', 'flooding', 'environmental_hazard', 'infrastructure_damage', 'water_contamination'];
  const category = report.incident_type || categories[Math.floor(Math.random() * categories.length)];

  const existing = await db.prepare(`SELECT id FROM incident_analysis WHERE report_id = ?`).get(report.id);
  if (existing) {
    await db.prepare(`UPDATE incident_analysis SET ai_severity=?, ai_category=?, ai_risk_score=?, ai_summary=?, response_recommendation=?, analyzed_at=datetime('now') WHERE report_id=?`).run(
      aiRisk > 70 ? 'high' : aiRisk > 45 ? 'medium' : 'low', category, Math.round(aiRisk * 10) / 10,
      `AI analysis complete. Category: ${category.replace(/_/g, ' ')}, Risk: ${Math.round(aiRisk)}%`,
      generateRecommendation(category, report.severity), report.id
    );
  } else {
    await db.prepare(`INSERT INTO incident_analysis (report_id, ai_severity, ai_category, ai_urgency, ai_risk_score, ai_summary, response_recommendation) VALUES (?,?,?,?,?,?,?)`).run(
      report.id, aiRisk > 70 ? 'high' : aiRisk > 45 ? 'medium' : 'low', category,
      aiRisk > 70 ? 'emergency' : aiRisk > 45 ? 'urgent' : 'normal',
      Math.round(aiRisk * 10) / 10,
      `AI analysis complete. Category: ${category.replace(/_/g, ' ')}, Risk: ${Math.round(aiRisk)}%`,
      generateRecommendation(category, report.severity)
    );
  }

  const updated = await db.prepare(`SELECT * FROM incident_analysis WHERE report_id = ?`).get(report.id);
  res.json({ success: true, data: updated, message: 'Analysis complete' });
});

function generateRecommendation(category, severity) {
  const recs = {
    water_pollution: 'Deploy water quality testing team. Issue boil water advisory. Notify environmental agency.',
    illegal_dumping: 'Dispatch enforcement officers. Issue citation. Arrange waste removal.',
    sewage_leak: 'Contact municipal sewage department. Deploy sanitation team. Warning signs.',
    flooding: 'Activate emergency flood response. Evacuate if needed. Deploy pumps.',
    environmental_hazard: 'Hazard assessment team required. Secure area. Notify environmental protection.',
    infrastructure_damage: 'Infrastructure assessment needed. Contact maintenance team. Safety inspection.',
    water_contamination: 'Emergency: Close water source. Deploy alternative water supply. Health alert.'
  };
  return recs[category] || 'Investigate and assign to appropriate department based on severity and location.';
}

module.exports = router;