const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { notifyForHealthIncident } = require('../utils/notify');

const router = express.Router();
router.use(authMiddleware);

router.get('/incidents', async (req, res) => {
  const db = await getDb();
  const { district, disease, status } = req.query;
  let sql = `SELECT hi.*, wp.name as water_point_name FROM health_incidents hi LEFT JOIN water_points wp ON hi.water_point_id = wp.id WHERE 1=1`;
  const params = [];
  if (district) {sql += ' AND hi.district = ?';params.push(district);}
  if (disease) {sql += ' AND hi.disease_type = ?';params.push(disease);}
  if (status) {sql += ' AND hi.outbreak_status = ?';params.push(status);}
  sql += ' ORDER BY hi.reported_date DESC';
  const data = await db.prepare(sql).all(...params);
  res.json({ success: true, data, total: data.length });
});

router.get('/stats', async (req, res) => {
  const db = await getDb();
  const total_cases = await db.prepare('SELECT SUM(cases) as total, SUM(deaths) as deaths, SUM(hospitalizations) as hosp FROM health_incidents').get();
  const active_outbreaks = await db.prepare("SELECT COUNT(*) as count FROM health_incidents WHERE outbreak_status IN ('outbreak','alert')").get();
  const water_linked = await db.prepare('SELECT COUNT(*) as count FROM health_incidents WHERE water_source_linked = 1').get();
  const by_disease = await db.prepare('SELECT disease_type, SUM(cases) as total_cases, SUM(deaths) as total_deaths, COUNT(*) as incidents FROM health_incidents GROUP BY disease_type ORDER BY total_cases DESC').all();
  const by_district = await db.prepare('SELECT district, SUM(cases) as total_cases, SUM(deaths) as total_deaths, COUNT(*) as incidents FROM health_incidents GROUP BY district ORDER BY total_cases DESC').all();
  const by_status = await db.prepare('SELECT outbreak_status, COUNT(*) as count FROM health_incidents GROUP BY outbreak_status').all();
  res.json({
    success: true,
    data: {
      total_cases: total_cases.total || 0,
      total_deaths: total_cases.deaths || 0,
      total_hospitalizations: total_cases.hosp || 0,
      active_outbreaks: active_outbreaks.count,
      water_linked_incidents: water_linked.count,
      by_disease,
      by_district,
      by_status
    }
  });
});

router.post('/incidents', async (req, res) => {
  const db = await getDb();
  const { district, sub_county, village, disease_type, cases, deaths, hospitalizations, water_source_linked, water_point_id, lat, lng, investigation_notes } = req.body;
  if (!district || !disease_type) return res.status(400).json({ success: false, error: 'district and disease_type required' });
  const result = await db.prepare(`
    INSERT INTO health_incidents (district, sub_county, village, disease_type, cases, deaths, hospitalizations, water_source_linked, water_point_id, lat, lng, investigation_notes, outbreak_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'monitoring')
  `).run(district, sub_county, village, disease_type, cases || 0, deaths || 0, hospitalizations || 0, water_source_linked ? 1 : 0, water_point_id, lat, lng, investigation_notes);

  if ((cases || 0) >= 10) {
    await db.prepare(`INSERT INTO alerts (alert_type, severity, district, title, message, source) VALUES ('health', ?, ?, ?, ?, 'health_system')`).run(
      (cases || 0) >= 50 ? 'emergency' : 'critical',
      district,
      `Disease Outbreak Alert - ${district}: ${disease_type}`,
      `${cases} cases of ${disease_type} reported in ${sub_county || district}. ${deaths} deaths. ${water_source_linked ? 'Linked to water source.' : ''}`
    );
    try { notifyForHealthIncident(disease_type, district, cases || 0, result.lastInsertRowid); } catch {}
  }
  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

router.put('/incidents/:id', async (req, res) => {
  const db = await getDb();
  const { cases, deaths, outbreak_status, investigation_notes, resolved_date } = req.body;
  await db.prepare('UPDATE health_incidents SET cases=COALESCE(?,cases), deaths=COALESCE(?,deaths), outbreak_status=COALESCE(?,outbreak_status), investigation_notes=COALESCE(?,investigation_notes), resolved_date=COALESCE(?,resolved_date) WHERE id=?').run(cases, deaths, outbreak_status, investigation_notes, resolved_date, req.params.id);
  res.json({ success: true, message: 'Incident updated' });
});

module.exports = router;