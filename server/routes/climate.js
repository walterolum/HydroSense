const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/readings', (req, res) => {
  const db = getDb();
  const { district, months = 12 } = req.query;
  let sql = `SELECT * FROM climate_readings WHERE timestamp >= datetime('now', '-${parseInt(months)} months')`;
  const params = [];
  if (district) { sql += ' AND district = ?'; params.push(district); }
  sql += ' ORDER BY district, timestamp';
  const data = db.prepare(sql).all(...params);
  res.json({ success: true, data });
});

router.get('/drought-index', (req, res) => {
  const db = getDb();
  const data = db.prepare('SELECT * FROM drought_index ORDER BY spi_value ASC').all();
  res.json({ success: true, data });
});

router.get('/flood-alerts', (req, res) => {
  const db = getDb();
  const data = db.prepare('SELECT * FROM flood_alerts ORDER BY water_level_m DESC').all();
  res.json({ success: true, data });
});

router.get('/resilience', (req, res) => {
  const db = getDb();
  const data = db.prepare('SELECT * FROM resilience_scores ORDER BY overall_resilience_score ASC').all();
  res.json({ success: true, data });
});

router.get('/forecast', (req, res) => {
  const { district } = req.query;
  // Simulated AI forecast data
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentMonth = new Date().getMonth();
  const forecast = Array.from({ length: 6 }, (_, i) => {
    const monthIdx = (currentMonth + i) % 12;
    const isRainy = [2,3,4,9,10].includes(monthIdx);
    const rainfall = isRainy ? 80 + Math.random() * 100 : 5 + Math.random() * 30;
    const droughtRisk = rainfall < 30 ? 'high' : rainfall < 60 ? 'moderate' : 'low';
    return {
      month: months[monthIdx],
      predicted_rainfall_mm: parseFloat(rainfall.toFixed(1)),
      drought_risk: droughtRisk,
      flood_risk: isRainy ? (rainfall > 150 ? 'high' : 'moderate') : 'low',
      groundwater_recharge: parseFloat((rainfall * 0.3 + Math.random() * 10).toFixed(1)),
      confidence_pct: 70 + Math.floor(Math.random() * 25)
    };
  });
  res.json({ success: true, district: district || 'All Districts', forecast });
});

router.get('/summary', (req, res) => {
  const db = getDb();
  const droughtCritical = db.prepare("SELECT COUNT(*) as count FROM drought_index WHERE severity IN ('extreme_drought','severe_drought')").get();
  const floodCritical = db.prepare("SELECT COUNT(*) as count FROM flood_alerts WHERE flood_risk IN ('critical','high')").get();
  const avgRainfall = db.prepare("SELECT AVG(rainfall_mm) as avg FROM climate_readings WHERE timestamp >= datetime('now', '-3 months')").get();
  const districtSummary = db.prepare(`
    SELECT cr.district, AVG(cr.rainfall_mm) as avg_rainfall, MAX(cr.temperature_max) as max_temp,
      di.severity as drought_severity, di.spi_value
    FROM climate_readings cr
    LEFT JOIN drought_index di ON cr.district = di.district
    GROUP BY cr.district
    ORDER BY avg_rainfall ASC
  `).all();
  res.json({
    success: true,
    data: {
      districts_in_drought: droughtCritical.count,
      districts_flood_risk: floodCritical.count,
      avg_recent_rainfall_mm: parseFloat((avgRainfall.avg || 0).toFixed(1)),
      district_summary: districtSummary
    }
  });
});

module.exports = router;
