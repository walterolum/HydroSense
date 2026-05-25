const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/overview', async (req, res) => {
  const db = await getDb();
  const wps = await db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='functional' THEN 1 ELSE 0 END) as functional, SUM(CASE WHEN status='non_functional' THEN 1 ELSE 0 END) as broken, SUM(beneficiaries) as beneficiaries FROM water_points").get();
  const alerts = await db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN severity='emergency' THEN 1 ELSE 0 END) as emergency, SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) as critical FROM alerts WHERE status='active'").get();
  const maintenance = await db.prepare("SELECT COUNT(*) as pending FROM maintenance_requests WHERE status NOT IN ('completed','cancelled')").get();
  const quality = await db.prepare('SELECT AVG(water_safety_score) as avg_score, SUM(CASE WHEN overall_safe=0 THEN 1 ELSE 0 END) as unsafe FROM water_quality_tests').get();
  const health = await db.prepare("SELECT SUM(cases) as cases, COUNT(*) as incidents FROM health_incidents WHERE outbreak_status IN ('outbreak','alert')").get();
  const climate = await db.prepare("SELECT COUNT(*) as districts_drought FROM drought_index WHERE severity IN ('extreme_drought','severe_drought','moderate_drought')").get();
  const coverage = wps.total > 0 ? Math.round(wps.functional / wps.total * 100) : 0;

  res.json({
    success: true,
    data: {
      water_points: { total: wps.total, functional: wps.functional, broken: wps.broken, coverage_pct: coverage, beneficiaries: wps.beneficiaries || 0 },
      alerts: { total_active: alerts.total, emergency: alerts.emergency, critical: alerts.critical },
      maintenance: { pending: maintenance.pending },
      water_quality: { avg_score: Math.round(quality.avg_score || 0), unsafe_sources: quality.unsafe },
      health: { active_cases: health.cases || 0, active_incidents: health.incidents },
      climate: { districts_in_drought: climate.districts_drought }
    }
  });
});

router.get('/water-security', async (req, res) => {
  const db = await getDb();
  const byDistrict = await db.prepare(`
    SELECT wp.district,
      COUNT(*) as total_points,
      SUM(CASE WHEN wp.status='functional' THEN 1 ELSE 0 END) as functional,
      SUM(wp.beneficiaries) as total_beneficiaries,
      AVG(wp.infrastructure_score) as avg_infra_score,
      AVG(wqt.water_safety_score) as avg_quality_score,
      rs.overall_resilience_score
    FROM water_points wp
    LEFT JOIN water_quality_tests wqt ON wp.id = wqt.water_point_id
    LEFT JOIN resilience_scores rs ON wp.district = rs.district
    GROUP BY wp.district
    ORDER BY functional DESC
  `).all();
  res.json({ success: true, data: byDistrict });
});

router.get('/trends', async (req, res) => {
  const db = await getDb();
  const { months = 6 } = req.query;
  const climateMonthly = await db.prepare(`
    SELECT strftime('%Y-%m', timestamp) as month, district, AVG(rainfall_mm) as avg_rainfall, AVG(temperature_max) as avg_temp
    FROM climate_readings WHERE timestamp >= datetime('now', '-${parseInt(months)} months')
    GROUP BY month, district ORDER BY month
  `).all();
  const maintenanceMonthly = await db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as requests,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
    FROM maintenance_requests WHERE created_at >= datetime('now', '-${parseInt(months)} months')
    GROUP BY month ORDER BY month
  `).all();
  const healthMonthly = await db.prepare(`
    SELECT strftime('%Y-%m', reported_date) as month, SUM(cases) as cases, COUNT(*) as incidents
    FROM health_incidents WHERE reported_date >= datetime('now', '-${parseInt(months)} months')
    GROUP BY month ORDER BY month
  `).all();
  res.json({ success: true, data: { climate: climateMonthly, maintenance: maintenanceMonthly, health: healthMonthly } });
});

router.get('/predictions', (req, res) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const cur = new Date().getMonth();
  const predictions = Array.from({ length: 6 }, (_, i) => {
    const m = (cur + i) % 12;
    const isRainy = [2, 3, 4, 9, 10].includes(m);
    return {
      month: months[m],
      borehole_failure_risk_pct: isRainy ? 15 + Math.random() * 10 : 25 + Math.random() * 20,
      water_demand_increase_pct: isRainy ? 5 + Math.random() * 10 : 20 + Math.random() * 25,
      drought_probability_pct: isRainy ? 5 + Math.random() * 10 : 30 + Math.random() * 40,
      flood_probability_pct: isRainy ? 40 + Math.random() * 40 : 5 + Math.random() * 10,
      maintenance_needed_est: Math.floor(8 + Math.random() * 15),
      contamination_risk: isRainy ? 'high' : 'moderate'
    };
  });
  res.json({ success: true, data: predictions });
});

router.get('/climate-risk', async (req, res) => {
  const db = await getDb();
  const drought = await db.prepare('SELECT * FROM drought_index ORDER BY spi_value ASC').all();
  const flood = await db.prepare('SELECT * FROM flood_alerts ORDER BY water_level_m DESC').all();
  const resilience = await db.prepare('SELECT * FROM resilience_scores ORDER BY overall_resilience_score ASC').all();
  const high_risk_wps = await db.prepare(`
    SELECT wp.*, di.severity as drought_severity, di.spi_value
    FROM water_points wp
    JOIN drought_index di ON wp.district = di.district
    WHERE di.severity IN ('extreme_drought','severe_drought','moderate_drought')
    ORDER BY di.spi_value ASC LIMIT 20
  `).all();
  res.json({ success: true, data: { drought_index: drought, flood_alerts: flood, resilience_scores: resilience, high_risk_water_points: high_risk_wps } });
});

module.exports = router;