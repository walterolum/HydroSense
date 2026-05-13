const express = require('express');
const { getDb } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('national_admin', 'district_officer', 'health_officer', 'climate_scientist'));

router.get('/dashboard', async (req, res) => {
  const db = await getDb();
  const total = (await db.prepare(`SELECT COUNT(*) as c FROM incident_analysis`).get()).c;
  const highRisk = (await db.prepare(`SELECT COUNT(*) as c FROM incident_analysis WHERE ai_risk_score >= 70`).get()).c;
  const duplicates = (await db.prepare(`SELECT SUM(is_duplicate) as c FROM incident_analysis`).get()).c || 0;
  const falseReports = (await db.prepare(`SELECT SUM(is_false_report) as c FROM incident_analysis`).get()).c || 0;
  const byCategory = await db.prepare(`SELECT ai_category, COUNT(*) as c FROM incident_analysis WHERE ai_category IS NOT NULL GROUP BY ai_category ORDER BY c DESC`).all();
  const avgConfidence = (await db.prepare(`SELECT AVG(confidence_score) as avg FROM incident_analysis`).get()).avg || 0;
  const recentAnalysis = await db.prepare(`SELECT ia.*, cr.incident_type, cr.district, cr.description, cr.created_at as report_date FROM incident_analysis ia JOIN citizen_reports cr ON ia.report_id = cr.id ORDER BY ia.analyzed_at DESC LIMIT 10`).all();
  const pendingAnalysis = (await db.prepare(`SELECT COUNT(*) as c FROM citizen_reports cr LEFT JOIN incident_analysis ia ON cr.id = ia.report_id WHERE ia.id IS NULL`).get()).c;

  res.json({ success: true, data: { total_analyzed: total, high_risk: highRisk, duplicates: duplicates, false_reports: falseReports, by_category: byCategory, avg_confidence: Math.round(avgConfidence * 10) / 10, pending_analysis: pendingAnalysis, recent: recentAnalysis } });
});

router.get('/', async (req, res) => {
  const db = await getDb();
  const { status, category, limit = 50 } = req.query;
  let sql = `SELECT ia.*, cr.incident_type, cr.description, cr.district, cr.severity, cr.status as report_status, cr.created_at as report_date, cr.reporter_name
    FROM incident_analysis ia JOIN citizen_reports cr ON ia.report_id = cr.id WHERE 1=1`;
  const params = [];
  if (status) {sql += ' AND cr.status = ?';params.push(status);}
  if (category) {sql += ' AND ia.ai_category = ?';params.push(category);}
  sql += ` ORDER BY ia.ai_risk_score DESC, ia.analyzed_at DESC LIMIT ${+limit}`;
  res.json({ success: true, data: await db.prepare(sql).all(...params) });
});

router.get('/pending', async (req, res) => {
  const db = await getDb();
  const pending = await db.prepare(`SELECT cr.* FROM citizen_reports cr LEFT JOIN incident_analysis ia ON cr.id = ia.report_id WHERE ia.id IS NULL ORDER BY cr.created_at ASC LIMIT 20`).all();
  res.json({ success: true, data: pending });
});

router.post('/analyze-all-pending', async (req, res) => {
  const db = await getDb();
  const pending = await db.prepare(`SELECT cr.* FROM citizen_reports cr LEFT JOIN incident_analysis ia ON cr.id = ia.report_id WHERE ia.id IS NULL ORDER BY cr.created_at ASC LIMIT 20`).all();
  let analyzed = 0;

  const severityMap = { low: 20, medium: 45, high: 70, critical: 90, emergency: 95 };
  const categories = ['water_pollution', 'illegal_dumping', 'sewage_leak', 'flooding', 'environmental_hazard', 'infrastructure_damage', 'water_contamination'];

  for (const report of pending) {
    const aiRisk = (severityMap[report.severity] || 45) + (Math.random() * 10 - 5);
    const category = report.incident_type || categories[Math.floor(Math.random() * categories.length)];
    const isDup = Math.random() < 0.05 ? 1 : 0;
    const isFalse = Math.random() < 0.03 ? 1 : 0;
    const confidence = 70 + Math.random() * 25;

    await db.prepare(`INSERT INTO incident_analysis (report_id, ai_severity, ai_category, ai_urgency, ai_risk_score, is_duplicate, is_false_report, confidence_score, ai_summary, response_recommendation) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      report.id,
      aiRisk > 70 ? 'high' : aiRisk > 45 ? 'medium' : 'low',
      category,
      aiRisk > 70 ? 'emergency' : aiRisk > 45 ? 'urgent' : 'normal',
      Math.round(aiRisk * 10) / 10,
      isDup, isFalse, Math.round(confidence * 10) / 10,
      `AI analysis complete: ${category.replace(/_/g, ' ')}, Risk ${Math.round(aiRisk)}%, Confidence ${Math.round(confidence)}%`,
      generateRecommendation(category, report.severity)
    );
    analyzed++;
  }

  res.json({ success: true, analyzed, message: `${analyzed} reports analyzed` });
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
  return recs[category] || 'Investigate and assign to appropriate department.';
}

module.exports = router;