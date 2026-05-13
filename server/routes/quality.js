const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/tests', async (req, res) => {
  const db = await getDb();
  const { district, water_point_id, safe, limit = 100 } = req.query;
  let sql = `SELECT wqt.*, wp.name as water_point_name, wp.district, wp.type, u.name as tester_name
    FROM water_quality_tests wqt
    JOIN water_points wp ON wqt.water_point_id = wp.id
    LEFT JOIN users u ON wqt.tested_by = u.id
    WHERE 1=1`;
  const params = [];
  if (district) {sql += ' AND wp.district = ?';params.push(district);}
  if (water_point_id) {sql += ' AND wqt.water_point_id = ?';params.push(water_point_id);}
  if (safe !== undefined) {sql += ' AND wqt.overall_safe = ?';params.push(safe === 'true' ? 1 : 0);}
  sql += ` ORDER BY wqt.tested_at DESC LIMIT ${parseInt(limit)}`;
  const data = await db.prepare(sql).all(...params);
  res.json({ success: true, data, total: data.length });
});

router.get('/stats', async (req, res) => {
  const db = await getDb();
  const { district } = req.query;
  const distFilter = district ? 'AND wp.district = ?' : '';
  const params = district ? [district] : [];

  const total = await db.prepare(`SELECT COUNT(*) as count FROM water_quality_tests wqt JOIN water_points wp ON wqt.water_point_id = wp.id WHERE 1=1 ${distFilter}`).get(...params);
  const safe = await db.prepare(`SELECT COUNT(*) as count FROM water_quality_tests wqt JOIN water_points wp ON wqt.water_point_id = wp.id WHERE wqt.overall_safe = 1 ${distFilter}`).get(...params);
  const avgScore = await db.prepare(`SELECT AVG(wqt.water_safety_score) as avg FROM water_quality_tests wqt JOIN water_points wp ON wqt.water_point_id = wp.id WHERE 1=1 ${distFilter}`).get(...params);
  const contaminated = await db.prepare(`SELECT wp.district, wp.name, wqt.e_coli_cfu, wqt.turbidity_ntu, wqt.ph, wqt.tested_at, wqt.water_safety_score FROM water_quality_tests wqt JOIN water_points wp ON wqt.water_point_id = wp.id WHERE wqt.overall_safe = 0 ${distFilter} ORDER BY wqt.tested_at DESC LIMIT 20`).all(...params);
  const byDistrict = await db.prepare(`SELECT wp.district, COUNT(*) as tests, SUM(CASE WHEN wqt.overall_safe=1 THEN 1 ELSE 0 END) as safe_count, AVG(wqt.water_safety_score) as avg_score FROM water_quality_tests wqt JOIN water_points wp ON wqt.water_point_id = wp.id GROUP BY wp.district ORDER BY avg_score ASC`).all();

  res.json({
    success: true,
    data: {
      total_tests: total.count,
      safe_tests: safe.count,
      unsafe_tests: total.count - safe.count,
      safety_rate_pct: total.count ? Math.round(safe.count / total.count * 100) : 0,
      avg_safety_score: Math.round(avgScore.avg || 0),
      contaminated_sources: contaminated,
      by_district: byDistrict
    }
  });
});

router.post('/tests', async (req, res) => {
  const db = await getDb();
  const { water_point_id, turbidity_ntu, ph, tds_ppm, e_coli_cfu, nitrates_ppm, fluoride_ppm, chlorine_residual, temperature_c, notes } = req.body;
  if (!water_point_id) return res.status(400).json({ success: false, error: 'water_point_id required' });

  const safe = (e_coli_cfu || 0) < 10 && (turbidity_ntu || 0) < 5 && ph >= 6.5 && ph <= 8.5 ? 1 : 0;
  const score = Math.max(0, Math.min(100, 100 - ((e_coli_cfu || 0) > 50 ? 40 : (e_coli_cfu || 0) > 10 ? 20 : 0) - ((turbidity_ntu || 0) > 10 ? 30 : (turbidity_ntu || 0) > 5 ? 15 : 0)));

  const result = await db.prepare(`
    INSERT INTO water_quality_tests (water_point_id, tested_by, turbidity_ntu, ph, tds_ppm, e_coli_cfu, nitrates_ppm, fluoride_ppm, chlorine_residual, temperature_c, overall_safe, water_safety_score, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(water_point_id, req.user.id, turbidity_ntu, ph, tds_ppm, e_coli_cfu, nitrates_ppm, fluoride_ppm, chlorine_residual, temperature_c, safe, score, notes);

  if (!safe) {
    await db.prepare(`INSERT INTO alerts (alert_type, severity, water_point_id, district, title, message, source)
      SELECT 'contamination', 'critical', wp.id, wp.district,
        'Water Contamination Detected - ' || wp.name,
        'Water quality test failed. E.coli: ' || ? || ' CFU/100ml, Turbidity: ' || ? || ' NTU. Immediate action required.',
        'quality_test'
      FROM water_points wp WHERE wp.id = ?
    `).run(e_coli_cfu || 0, turbidity_ntu || 0, water_point_id);
  }

  res.status(201).json({ success: true, id: result.lastInsertRowid, safe, score });
});

module.exports = router;