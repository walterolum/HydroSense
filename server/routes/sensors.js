const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const db = getDb();
  const { water_point_id, status, type } = req.query;
  let sql = `SELECT s.*, wp.name as water_point_name, wp.district FROM sensors s JOIN water_points wp ON s.water_point_id = wp.id WHERE 1=1`;
  const params = [];
  if (water_point_id) { sql += ' AND s.water_point_id = ?'; params.push(water_point_id); }
  if (status) { sql += ' AND s.status = ?'; params.push(status); }
  if (type) { sql += ' AND s.sensor_type = ?'; params.push(type); }
  sql += ' ORDER BY s.water_point_id, s.sensor_type';
  const data = db.prepare(sql).all(...params);
  res.json({ success: true, data, total: data.length });
});

router.get('/stats', (req, res) => {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as count FROM sensors').get();
  const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM sensors GROUP BY status').all();
  const byType = db.prepare('SELECT sensor_type, COUNT(*) as count FROM sensors GROUP BY sensor_type').all();
  const lowBattery = db.prepare('SELECT COUNT(*) as count FROM sensors WHERE battery_level < 20').get();
  const offline = db.prepare("SELECT COUNT(*) as count FROM sensors WHERE last_seen < datetime('now', '-1 hour') OR last_seen IS NULL").get();
  res.json({ success: true, data: { total: total.count, by_status: byStatus, by_type: byType, low_battery: lowBattery.count, offline: offline.count } });
});

router.get('/:id/readings', (req, res) => {
  const db = getDb();
  const { hours = 24 } = req.query;
  const readings = db.prepare(`SELECT * FROM sensor_readings WHERE sensor_id = ? AND timestamp >= datetime('now', '-${parseInt(hours)} hours') ORDER BY timestamp ASC`).all(req.params.id);
  res.json({ success: true, data: readings });
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const sensor = db.prepare('SELECT s.*, wp.name as water_point_name, wp.district FROM sensors s JOIN water_points wp ON s.water_point_id = wp.id WHERE s.id = ?').get(req.params.id);
  if (!sensor) return res.status(404).json({ success: false, error: 'Sensor not found' });
  const recentReadings = db.prepare("SELECT * FROM sensor_readings WHERE sensor_id = ? ORDER BY timestamp DESC LIMIT 100").all(req.params.id);
  res.json({ success: true, data: { ...sensor, recentReadings } });
});

router.post('/reading', (req, res) => {
  const db = getDb();
  const { sensor_id, value } = req.body;
  if (!sensor_id || value === undefined) return res.status(400).json({ success: false, error: 'sensor_id and value required' });
  const sensor = db.prepare('SELECT * FROM sensors WHERE id = ?').get(sensor_id);
  if (!sensor) return res.status(404).json({ success: false, error: 'Sensor not found' });
  db.prepare('INSERT INTO sensor_readings (sensor_id, water_point_id, value, unit) VALUES (?, ?, ?, ?)').run(sensor_id, sensor.water_point_id, value, sensor.unit);
  db.prepare("UPDATE sensors SET last_reading = ?, last_seen = datetime('now') WHERE id = ?").run(value, sensor_id);
  res.json({ success: true, message: 'Reading recorded' });
});

module.exports = router;
