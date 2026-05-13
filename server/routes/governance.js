const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/audit', async (req, res) => {
  const db = await getDb();
  const { limit = 100 } = req.query;
  const data = await db.prepare(`SELECT ga.*, u.name as user_name, u.role FROM governance_audit ga LEFT JOIN users u ON ga.user_id = u.id ORDER BY ga.timestamp DESC LIMIT ${parseInt(limit)}`).all();
  res.json({ success: true, data, total: data.length });
});

router.get('/budget', async (req, res) => {
  const db = await getDb();
  const { district } = req.query;
  let sql = 'SELECT * FROM budget_records WHERE 1=1';
  const params = [];
  if (district) {sql += ' AND district = ?';params.push(district);}
  sql += ' ORDER BY allocated_amount DESC';
  const data = await db.prepare(sql).all(...params);
  const totals = await db.prepare("SELECT SUM(allocated_amount) as total_allocated, SUM(spent_amount) as total_spent FROM budget_records WHERE status = 'active'").get();
  res.json({
    success: true,
    data,
    summary: {
      total_allocated: totals.total_allocated || 0,
      total_spent: totals.total_spent || 0,
      utilization_pct: totals.total_allocated > 0 ? Math.round(totals.total_spent / totals.total_allocated * 100) : 0
    }
  });
});

router.post('/budget', async (req, res) => {
  const db = await getDb();
  const { district, project_name, project_type, allocated_amount, funding_source, fiscal_year, notes } = req.body;
  if (!district || !project_name || !allocated_amount) return res.status(400).json({ success: false, error: 'Required fields missing' });
  const result = await db.prepare(`INSERT INTO budget_records (district, project_name, project_type, allocated_amount, funding_source, fiscal_year, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(district, project_name, project_type, allocated_amount, funding_source, fiscal_year || '2024/2025', notes);
  await db.prepare("INSERT INTO governance_audit (user_id, action, entity_type, entity_id, details) VALUES (?, 'CREATE', 'budget_record', ?, ?)").run(req.user.id, result.lastInsertRowid, `Created budget: ${project_name} UGX ${allocated_amount}`);
  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

router.get('/transparency', async (req, res) => {
  const db = await getDb();
  const budgetUtil = await db.prepare('SELECT district, project_name, allocated_amount, spent_amount, ROUND((spent_amount*100.0/allocated_amount),1) as utilization_pct, status, funding_source FROM budget_records ORDER BY district').all();
  const maintenanceFunds = await db.prepare(`SELECT mf.district, SUM(mf.balance) as total_balance, SUM(mf.total_collected) as total_collected, SUM(mf.total_spent) as total_spent, COUNT(*) as num_points FROM maintenance_funds mf GROUP BY mf.district ORDER BY total_balance DESC`).all();
  const wpsPerDistrict = await db.prepare("SELECT district, COUNT(*) as total, SUM(CASE WHEN status='functional' THEN 1 ELSE 0 END) as functional, ROUND(AVG(infrastructure_score),1) as avg_score FROM water_points GROUP BY district ORDER BY district").all();
  const recentActions = await db.prepare('SELECT ga.*, u.name as user_name, u.role FROM governance_audit ga LEFT JOIN users u ON ga.user_id = u.id ORDER BY ga.timestamp DESC LIMIT 20').all();
  res.json({
    success: true,
    data: {
      budget_utilization: budgetUtil,
      maintenance_funds: maintenanceFunds,
      water_points_per_district: wpsPerDistrict,
      recent_actions: recentActions
    }
  });
});

router.get('/performance', async (req, res) => {
  const db = await getDb();
  const responseTime = await db.prepare("SELECT AVG(JULIANDAY(completed_at) - JULIANDAY(created_at)) * 24 as avg_hours FROM maintenance_requests WHERE completed_at IS NOT NULL AND created_at >= datetime('now', '-90 days')").get();
  const qualityTests = await db.prepare("SELECT COUNT(*) as count FROM water_quality_tests WHERE tested_at >= datetime('now', '-30 days')").get();
  const reportResolution = await db.prepare("SELECT status, COUNT(*) as count FROM community_reports WHERE created_at >= datetime('now', '-30 days') GROUP BY status").all();
  const alertResolution = await db.prepare("SELECT AVG(JULIANDAY(resolved_at) - JULIANDAY(created_at)) * 24 as avg_hours FROM alerts WHERE resolved_at IS NOT NULL AND created_at >= datetime('now', '-30 days')").get();
  res.json({
    success: true,
    data: {
      avg_maintenance_response_hours: Math.round(responseTime.avg_hours || 0),
      quality_tests_last_30_days: qualityTests.count,
      community_report_resolution: reportResolution,
      avg_alert_resolution_hours: Math.round(alertResolution.avg_hours || 0),
      kpis: [
      { name: 'Water Point Functionality Rate', value: '73%', target: '90%', status: 'below' },
      { name: 'Avg Maintenance Response Time', value: `${Math.round(responseTime.avg_hours || 48)}h`, target: '72h', status: 'on_track' },
      { name: 'Water Quality Tests/Month', value: qualityTests.count, target: 100, status: qualityTests.count >= 100 ? 'on_track' : 'below' },
      { name: 'Community Report Resolution Rate', value: '68%', target: '80%', status: 'below' },
      { name: 'Budget Utilization', value: '62%', target: '70%', status: 'on_track' }]

    }
  });
});

module.exports = router;