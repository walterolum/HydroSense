const bcrypt = require('bcryptjs');
const { getDb } = require('./db');

const db = getDb();

const DISTRICTS = [
  { name: 'Gulu', lat: 2.774, lng: 32.299, region: 'Northern', type: 'semi-arid' },
  { name: 'Arua', lat: 3.020, lng: 30.911, region: 'West Nile', type: 'semi-arid' },
  { name: 'Lira', lat: 2.249, lng: 32.900, region: 'Northern', type: 'semi-arid' },
  { name: 'Moroto', lat: 2.534, lng: 34.663, region: 'Karamoja', type: 'arid' },
  { name: 'Kotido', lat: 2.982, lng: 34.132, region: 'Karamoja', type: 'arid' },
  { name: 'Soroti', lat: 1.714, lng: 33.611, region: 'Eastern', type: 'sub-humid' },
  { name: 'Mbale', lat: 1.075, lng: 34.175, region: 'Eastern', type: 'sub-humid' },
  { name: 'Jinja', lat: 0.424, lng: 33.204, region: 'Eastern', type: 'humid' },
  { name: 'Masaka', lat: -0.338, lng: 31.737, region: 'Central', type: 'humid' },
  { name: 'Mbarara', lat: -0.607, lng: 30.655, region: 'Western', type: 'sub-humid' },
  { name: 'Kasese', lat: 0.187, lng: 30.086, region: 'Western', type: 'humid' },
  { name: 'Kabale', lat: -1.249, lng: 29.990, region: 'Western', type: 'highland' },
  { name: 'Hoima', lat: 1.437, lng: 31.353, region: 'Western', type: 'sub-humid' },
  { name: 'Adjumani', lat: 3.374, lng: 31.793, region: 'West Nile', type: 'refugee' },
  { name: 'Yumbe', lat: 3.459, lng: 31.237, region: 'West Nile', type: 'refugee' }
];

const WATER_POINT_NAMES = [
  'Acholi Borehole BH-001', 'Layibi Community Spring', 'Pece Ward BH-007',
  'Boro Trading Centre BH', 'Lacor Health Centre BH', 'Bungatira Shallow Well',
  'Arua Town BH-A1', 'Ediofe Mission BH', 'Rigbo Sub-county BH',
  'Olevu Piped Scheme', 'Lira Main BH-L3', 'Adyel Division BH',
  'Ojwina Rainwater Tank', 'Abako Community Well', 'Agweng BH-AG2',
  'Moroto Town BH-M1', 'Nadunget Borehole', 'Rupa Sub-county Spring',
  'Soroti Town BH-S4', 'Asuret Borehole', 'Katine Community BH',
  'Mbale Main BH-MB2', 'Wanale Hillside Spring', 'Namatala Piped Scheme',
  'Jinja Central BH-J1', 'Bugembe Shallow Well', 'Wakoli Springs',
  'Masaka Town BH-MK1', 'Nyendo Spring', 'Kimuli Rainwater Harvest',
  'Mbarara Town BH-MM3', 'Kakiika Borehole', 'Rugando Spring',
  'Kasese Main BH-KS1', 'Kilembe Springs', 'Nyamwamba Piped Scheme',
  'Kabale Town BH-KB2', 'Kyenjojo Shallow Well', 'Bufundi Spring',
  'Hoima Main BH-HM1', 'Kigorobya Borehole', 'Buhimba Spring',
  'Adjumani Camp BH-AD1', 'Pakele Borehole', 'Dzaipi Community BH',
  'Yumbe Town BH-YB1', 'Ariwa Borehole', 'Kei Piped Scheme',
  'Kotido Town BH-KT1', 'Panyangara Spring', 'Nakapiripirit BH'
];

const PUMP_TYPES = ['Afridev', 'India Mark II', 'Submersible', 'Solar Pump', 'Rope Pump'];
const ISSUE_TYPES = ['pump_failure', 'breakdown', 'water_quality', 'contamination', 'shortage', 'infrastructure'];

console.log('Starting database seed...');

// Clear existing data
db.exec(`
  DELETE FROM citizen_report_tracking;
  DELETE FROM citizen_reports;
  DELETE FROM resilience_scores;
  DELETE FROM maintenance_funds;
  DELETE FROM budget_records;
  DELETE FROM governance_audit;
  DELETE FROM health_incidents;
  DELETE FROM community_reports;
  DELETE FROM alerts;
  DELETE FROM water_quality_tests;
  DELETE FROM flood_alerts;
  DELETE FROM drought_index;
  DELETE FROM climate_readings;
  DELETE FROM maintenance_requests;
  DELETE FROM sensor_readings;
  DELETE FROM sensors;
  DELETE FROM spare_parts;
  DELETE FROM water_points;
  DELETE FROM users;
  DELETE FROM sqlite_sequence;
`);

// --- USERS ---
const users = [
  { name: 'Dr. Sarah Namukasa', email: 'admin@mwe.go.ug', password: 'password123', role: 'national_admin', district: 'Kampala', organization: 'Ministry of Water & Environment', phone: '+256700111001' },
  { name: 'Eng. James Okello', email: 'officer@gulu.go.ug', password: 'password123', role: 'district_officer', district: 'Gulu', organization: 'Gulu District Water Office', phone: '+256700111002' },
  { name: 'Grace Atim', email: 'committee@arua.ug', password: 'password123', role: 'community_committee', district: 'Arua', organization: 'Arua Water User Committee', phone: '+256700111003' },
  { name: 'John Opio', email: 'john@citizen.ug', password: 'password123', role: 'citizen', district: 'Lira', organization: '', phone: '+256700111004' },
  { name: 'Dr. Amina Hassan', email: 'sarah@actionaid.org', password: 'password123', role: 'ngo_officer', district: 'Moroto', organization: 'ActionAid Uganda', phone: '+256700111005' },
  { name: 'Peter Ssemanda', email: 'tech@maintenance.ug', password: 'password123', role: 'technician', district: 'Gulu', organization: 'Rural Water Maintenance Co.', phone: '+256700111006' },
  { name: 'Dr. Faith Kyomugisha', email: 'health@moh.go.ug', password: 'password123', role: 'health_officer', district: 'Mbarara', organization: 'Ministry of Health', phone: '+256700111007' },
  { name: 'Prof. Emmanuel Mubiru', email: 'climate@nema.go.ug', password: 'password123', role: 'climate_scientist', district: 'Kampala', organization: 'National Environment Mgmt Authority', phone: '+256700111008' },
  { name: 'Eng. Rose Aciro', email: 'officer@lira.go.ug', password: 'password123', role: 'district_officer', district: 'Lira', organization: 'Lira District Water Office', phone: '+256700111009' },
  { name: 'Moses Komakech', email: 'officer@moroto.go.ug', password: 'password123', role: 'district_officer', district: 'Moroto', organization: 'Moroto District Water Office', phone: '+256700111010' }
];

const insertUser = db.prepare(`
  INSERT INTO users (name, email, password_hash, role, district, organization, phone)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

users.forEach(u => {
  const hash = bcrypt.hashSync(u.password, 10);
  insertUser.run(u.name, u.email, hash, u.role, u.district, u.organization, u.phone);
});
console.log(`Inserted ${users.length} users`);

// --- WATER POINTS ---
const insertWP = db.prepare(`
  INSERT INTO water_points (name, type, status, lat, lng, district, sub_county, village, yield_lph, depth_m, water_table_m, pump_type, solar_powered, installed_date, last_maintained, beneficiaries, households, infrastructure_score, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const TYPES = ['borehole', 'spring', 'shallow_well', 'piped_scheme', 'rainwater_harvesting'];
const STATUSES = ['functional', 'functional', 'functional', 'needs_repair', 'non_functional'];
const subCounties = ['Central', 'Northern', 'Eastern', 'Western', 'Lakeside', 'Hillside', 'Valley'];
const villages = ['Pece', 'Laroo', 'Koro', 'Bardege', 'Bobi', 'Layibi', 'Unyama', 'Patiko'];

const wpIds = [];
WATER_POINT_NAMES.forEach((name, i) => {
  const dist = DISTRICTS[i % DISTRICTS.length];
  const lat = dist.lat + (Math.random() - 0.5) * 0.5;
  const lng = dist.lng + (Math.random() - 0.5) * 0.5;
  const type = TYPES[i % TYPES.length];
  const status = STATUSES[i % STATUSES.length];
  const solar = type === 'piped_scheme' ? 1 : (Math.random() > 0.7 ? 1 : 0);
  const score = status === 'functional' ? 70 + Math.floor(Math.random() * 30) : 30 + Math.floor(Math.random() * 30);
  const result = insertWP.run(
    name, type, status,
    parseFloat(lat.toFixed(4)), parseFloat(lng.toFixed(4)),
    dist.name,
    subCounties[i % subCounties.length],
    villages[i % villages.length],
    type === 'borehole' ? 800 + Math.floor(Math.random() * 1200) : null,
    type === 'borehole' ? 30 + Math.floor(Math.random() * 70) : null,
    type === 'borehole' ? 5 + Math.floor(Math.random() * 25) : null,
    type === 'borehole' || type === 'shallow_well' ? PUMP_TYPES[i % PUMP_TYPES.length] : null,
    solar,
    `${2010 + Math.floor(Math.random() * 13)}-${String(Math.ceil(Math.random()*12)).padStart(2,'0')}-${String(Math.ceil(Math.random()*28)).padStart(2,'0')}`,
    `2024-${String(Math.ceil(Math.random()*12)).padStart(2,'0')}-${String(Math.ceil(Math.random()*28)).padStart(2,'0')}`,
    200 + Math.floor(Math.random() * 1800),
    40 + Math.floor(Math.random() * 350),
    score,
    `${dist.type} zone water point serving ${villages[i % villages.length]} village`
  );
  wpIds.push(result.lastInsertRowid);
});
console.log(`Inserted ${wpIds.length} water points`);

// --- SENSORS ---
const insertSensor = db.prepare(`
  INSERT INTO sensors (water_point_id, sensor_type, sensor_name, serial_number, status, min_threshold, max_threshold, unit, last_reading, last_seen, battery_level, signal_strength)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const sensorDefs = [
  { type: 'water_level', name: 'Water Level Sensor', unit: 'm', min: 1, max: 15, base: 8 },
  { type: 'flow_rate', name: 'Flow Rate Meter', unit: 'L/hr', min: 100, max: 2000, base: 900 },
  { type: 'water_quality', name: 'Water Quality Probe', unit: 'NTU', min: 0, max: 5, base: 1.2 },
  { type: 'rainfall', name: 'Rain Gauge', unit: 'mm', min: 0, max: 100, base: 0 },
  { type: 'temperature', name: 'Temp Sensor', unit: '°C', min: 10, max: 40, base: 26 },
  { type: 'solar_power', name: 'Solar Monitor', unit: '%', min: 0, max: 100, base: 65 },
  { type: 'groundwater', name: 'Groundwater Monitor', unit: 'm', min: 2, max: 30, base: 12 }
];

const sensorIds = [];
wpIds.forEach((wpId, i) => {
  // Each borehole gets 2-3 sensors
  const numSensors = 2 + (i % 2);
  for (let s = 0; s < numSensors; s++) {
    const def = sensorDefs[(i + s) % sensorDefs.length];
    const reading = def.base + (Math.random() - 0.5) * def.base * 0.3;
    const battery = 40 + Math.floor(Math.random() * 60);
    const signal = 50 + Math.floor(Math.random() * 50);
    const status = battery < 20 ? 'faulty' : (i % 10 === 0 ? 'maintenance' : 'active');
    const res = insertSensor.run(
      wpId, def.type, def.name,
      `SN-${String(wpId).padStart(3,'0')}-${s+1}`,
      status, def.min, def.max, def.unit,
      parseFloat(reading.toFixed(2)),
      new Date().toISOString(),
      battery, signal
    );
    sensorIds.push(res.lastInsertRowid);
  }
});
console.log(`Inserted ${sensorIds.length} sensors`);

// --- SENSOR READINGS (historical - last 30 days) ---
const insertReading = db.prepare(`
  INSERT INTO sensor_readings (sensor_id, water_point_id, value, unit, timestamp) VALUES (?, ?, ?, ?, ?)
`);
const insertManyReadings = db.transaction(() => {
  sensorIds.slice(0, 30).forEach(sid => {
    const sensor = db.prepare('SELECT * FROM sensors WHERE id = ?').get(sid);
    if (!sensor) return;
    const def = sensorDefs.find(d => d.type === sensor.sensor_type) || sensorDefs[0];
    for (let day = 29; day >= 0; day--) {
      for (let h = 0; h < 24; h += 6) {
        const ts = new Date(Date.now() - day * 86400000 - h * 3600000);
        const val = Math.max(0, def.base + (Math.random() - 0.5) * def.base * 0.4);
        insertReading.run(sid, sensor.water_point_id, parseFloat(val.toFixed(2)), sensor.unit, ts.toISOString());
      }
    }
  });
});
insertManyReadings();
console.log('Inserted historical sensor readings');

// --- CLIMATE DATA (last 12 months) ---
const insertClimate = db.prepare(`
  INSERT INTO climate_readings (district, station, rainfall_mm, temperature_max, temperature_min, humidity_pct, wind_speed_kmh, soil_moisture, timestamp)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertManyClimate = db.transaction(() => {
  DISTRICTS.forEach(dist => {
    for (let month = 11; month >= 0; month--) {
      const ts = new Date(Date.now() - month * 30 * 86400000);
      const isRainySeason = [3,4,5,10,11].includes(ts.getMonth());
      const rainfall = isRainySeason ? 80 + Math.random() * 120 : 5 + Math.random() * 40;
      const tempMax = dist.type === 'arid' ? 35 + Math.random() * 8 : 27 + Math.random() * 8;
      insertClimate.run(
        dist.name, `${dist.name} Met Station`,
        parseFloat(rainfall.toFixed(1)),
        parseFloat(tempMax.toFixed(1)),
        parseFloat((tempMax - 8 - Math.random() * 5).toFixed(1)),
        parseFloat((50 + Math.random() * 40).toFixed(1)),
        parseFloat((5 + Math.random() * 20).toFixed(1)),
        parseFloat((20 + Math.random() * 40).toFixed(1)),
        ts.toISOString()
      );
    }
  });
});
insertManyClimate();
console.log('Inserted climate data');

// --- DROUGHT INDEX ---
const droughtData = [
  { district: 'Moroto', spi: -2.1, severity: 'extreme_drought', recharge: 5 },
  { district: 'Kotido', spi: -1.8, severity: 'severe_drought', recharge: 8 },
  { district: 'Gulu', spi: -0.9, severity: 'moderate_drought', recharge: 22 },
  { district: 'Lira', spi: -0.5, severity: 'mild_drought', recharge: 35 },
  { district: 'Arua', spi: -0.3, severity: 'mild_drought', recharge: 40 },
  { district: 'Soroti', spi: 0.2, severity: 'normal', recharge: 55 },
  { district: 'Mbale', spi: 0.8, severity: 'normal', recharge: 70 },
  { district: 'Jinja', spi: 1.1, severity: 'wet', recharge: 85 },
  { district: 'Masaka', spi: 0.5, severity: 'normal', recharge: 62 },
  { district: 'Mbarara', spi: 0.1, severity: 'normal', recharge: 50 },
  { district: 'Kasese', spi: 0.7, severity: 'normal', recharge: 72 },
  { district: 'Kabale', spi: 0.9, severity: 'normal', recharge: 78 },
  { district: 'Hoima', spi: 0.3, severity: 'normal', recharge: 58 },
  { district: 'Adjumani', spi: -0.7, severity: 'mild_drought', recharge: 30 },
  { district: 'Yumbe', spi: -0.6, severity: 'mild_drought', recharge: 33 }
];

const insertDrought = db.prepare(`
  INSERT INTO drought_index (district, spi_value, severity, groundwater_recharge, timestamp) VALUES (?, ?, ?, ?, datetime('now'))
`);
droughtData.forEach(d => insertDrought.run(d.district, d.spi, d.severity, d.recharge));
console.log('Inserted drought index data');

// --- FLOOD ALERTS ---
const floodData = [
  { district: 'Adjumani', river: 'Nile', level: 4.2, risk: 'high', communities: 'Pakele, Dzaipi, Ciforo' },
  { district: 'Jinja', river: 'Victoria Nile', level: 3.8, risk: 'moderate', communities: 'Walukuba, Mpumudde' },
  { district: 'Masaka', river: 'Katonga', level: 2.1, risk: 'low', communities: 'Nyendo, Kimuli' },
  { district: 'Kasese', river: 'Nyamwamba', level: 5.1, risk: 'critical', communities: 'Kilembe, Kasese Town' },
  { district: 'Mbale', river: 'Doho', level: 2.9, risk: 'moderate', communities: 'Namatala, Wanale' }
];
const insertFlood = db.prepare(`
  INSERT INTO flood_alerts (district, river_name, water_level_m, flood_risk, affected_communities, timestamp) VALUES (?, ?, ?, ?, ?, datetime('now'))
`);
floodData.forEach(f => insertFlood.run(f.district, f.river, f.level, f.risk, f.communities));
console.log('Inserted flood alerts');

// --- WATER QUALITY TESTS ---
const insertQuality = db.prepare(`
  INSERT INTO water_quality_tests (water_point_id, tested_by, turbidity_ntu, ph, tds_ppm, e_coli_cfu, nitrates_ppm, fluoride_ppm, chlorine_residual, temperature_c, overall_safe, water_safety_score, notes, tested_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertManyQuality = db.transaction(() => {
  wpIds.forEach((wpId, i) => {
    for (let t = 0; t < 3; t++) {
      const ts = new Date(Date.now() - t * 30 * 86400000 - Math.random() * 20 * 86400000);
      const ecoli = i % 7 === 0 ? Math.random() * 200 : Math.random() * 5;
      const turbidity = i % 5 === 0 ? 5 + Math.random() * 15 : Math.random() * 4;
      const ph = 6.5 + Math.random() * 1.5;
      const safe = ecoli < 10 && turbidity < 5 ? 1 : 0;
      const score = safe ? 75 + Math.floor(Math.random() * 25) : 30 + Math.floor(Math.random() * 35);
      insertQuality.run(
        wpId, 7,
        parseFloat(turbidity.toFixed(2)), parseFloat(ph.toFixed(2)),
        parseFloat((200 + Math.random() * 400).toFixed(0)),
        parseFloat(ecoli.toFixed(2)),
        parseFloat((1 + Math.random() * 10).toFixed(2)),
        parseFloat((0.2 + Math.random() * 1.0).toFixed(2)),
        parseFloat((0.1 + Math.random() * 0.5).toFixed(2)),
        parseFloat((20 + Math.random() * 10).toFixed(1)),
        safe, score,
        safe ? 'Water meets WHO standards' : 'Elevated contamination - treatment required',
        ts.toISOString()
      );
    }
  });
});
insertManyQuality();
console.log('Inserted water quality tests');

// --- MAINTENANCE REQUESTS ---
const insertMaint = db.prepare(`
  INSERT INTO maintenance_requests (water_point_id, reported_by, assigned_to, status, priority, issue_type, description, estimated_cost, actual_cost, created_at, completed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const maintStatuses = ['pending', 'assigned', 'in_progress', 'completed', 'completed'];
const maintPriorities = ['low', 'medium', 'high', 'critical'];
const maintDescriptions = [
  'Pump handle broken, no water output', 'Rising main pipe leaking at joint', 'Borehole yielding less than expected',
  'Solar panel damaged by storm', 'Water quality test shows contamination', 'Concrete apron cracked',
  'Pump cylinder worn out needs replacement', 'Air valve failure causing surging', 'Gate valve stuck - cannot isolate supply'
];
wpIds.forEach((wpId, i) => {
  if (i % 2 === 0) {
    const daysAgo = Math.floor(Math.random() * 60);
    const ts = new Date(Date.now() - daysAgo * 86400000);
    const status = maintStatuses[i % maintStatuses.length];
    const completed = status === 'completed' ? new Date(ts.getTime() + 5 * 86400000).toISOString() : null;
    insertMaint.run(
      wpId, 4, 6,
      status,
      maintPriorities[i % maintPriorities.length],
      ISSUE_TYPES[i % ISSUE_TYPES.length],
      maintDescriptions[i % maintDescriptions.length],
      parseFloat((50000 + Math.random() * 500000).toFixed(0)),
      status === 'completed' ? parseFloat((50000 + Math.random() * 500000).toFixed(0)) : null,
      ts.toISOString(), completed
    );
  }
});
console.log('Inserted maintenance requests');

// --- ALERTS ---
const insertAlert = db.prepare(`
  INSERT INTO alerts (alert_type, severity, water_point_id, district, title, message, source, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const alertsData = [
  { type: 'drought', sev: 'critical', dist: 'Moroto', title: 'Extreme Drought Warning - Moroto', msg: 'SPI index at -2.1. Groundwater recharge critically low. Immediate intervention required for 45 water points.' },
  { type: 'drought', sev: 'critical', dist: 'Kotido', title: 'Severe Drought Alert - Kotido', msg: 'Consecutive dry months detected. Borehole yields declining by 40%. Emergency water trucking may be required.' },
  { type: 'flood', sev: 'emergency', dist: 'Kasese', title: 'FLOOD EMERGENCY - Nyamwamba River', msg: 'River level at 5.1m - above danger level. Kilembe and Kasese Town communities at immediate risk. Evacuate low-lying areas.' },
  { type: 'flood', sev: 'warning', dist: 'Adjumani', title: 'Flood Watch - River Nile', msg: 'Nile river level rising. Pakele and Dzaipi communities should prepare for possible flooding within 48 hours.' },
  { type: 'contamination', sev: 'critical', dist: 'Gulu', title: 'Water Contamination Alert - Pece BH-001', msg: 'E.coli detected at 185 CFU/100ml in Pece Borehole. Immediate closure advised. Health teams alerted.' },
  { type: 'health', sev: 'warning', dist: 'Mbale', title: 'Cholera Alert - Namatala', msg: '12 suspected cholera cases linked to Namatala piped water scheme. Water testing in progress.' },
  { type: 'infrastructure', sev: 'warning', dist: 'Lira', title: 'Multiple Borehole Failures - Lira', msg: '8 boreholes reported non-functional across Lira district. 3,200 people affected. Technicians deployed.' },
  { type: 'climate', sev: 'info', dist: 'Soroti', title: 'Seasonal Forecast Update', msg: 'Above-normal rainfall predicted for Oct-Dec 2025. Flood preparedness measures should be activated in low-lying areas.' },
  { type: 'maintenance', sev: 'warning', dist: 'Arua', title: '15 Boreholes Due for Maintenance', msg: 'Scheduled maintenance overdue for 15 water points in Arua district. Risk of breakdowns increasing.' },
  { type: 'infrastructure', sev: 'critical', dist: 'Moroto', title: 'Solar Pump System Failure', msg: 'Solar pumping station at Moroto Town BH-M1 completely down. 2,100 people without water access.' }
];
const now = new Date();
alertsData.forEach((a, i) => {
  const ts = new Date(now.getTime() - i * 6 * 3600000);
  const wpId = i < wpIds.length ? wpIds[i] : null;
  insertAlert.run(a.type, a.sev, wpId, a.dist, a.title, a.msg, 'system', i < 7 ? 'active' : 'acknowledged', ts.toISOString());
});
console.log('Inserted alerts');

// --- COMMUNITY REPORTS ---
const insertReport = db.prepare(`
  INSERT INTO community_reports (reporter_name, reporter_phone, water_point_id, district, sub_county, village, issue_type, description, severity, status, channel, lat, lng, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const reporterNames = ['Auma Grace', 'Okello David', 'Atim Margaret', 'Opiyo Samuel', 'Achan Betty', 'Oryem Daniel', 'Awor Florence', 'Obita James', 'Akello Susan', 'Odongo Patrick'];
const reportChannels = ['sms', 'ussd', 'app', 'voice', 'in_person'];
const reportStatuses = ['open', 'under_review', 'in_progress', 'resolved'];
const reportDescriptions = [
  'The pump handle is broken and we cannot fetch water. Children are drinking from the stream.',
  'Water from this borehole looks dirty with yellow color. We are afraid to drink it.',
  'The borehole has been broken for 3 weeks. Women walk 5km to get water.',
  'There is oil leaking from the pump into the water. Strong smell noticed since yesterday.',
  'The concrete apron is cracked and dirty water is mixing with the borehole water.',
  'Pump is working but water comes out very slowly. Queue takes all day to get water.',
  'Someone vandalized the pump handpiece last night. We need urgent repair.',
  'The borehole is dry. We have been digging but no water for the past 2 months.',
  'Water tastes salty and causes stomach problems in our community.',
  'Flooding has contaminated our water source. We urgently need clean water.'
];
wpIds.forEach((wpId, i) => {
  if (i % 3 !== 0) return;
  const dist = DISTRICTS[i % DISTRICTS.length];
  const daysAgo = Math.floor(Math.random() * 30);
  const ts = new Date(Date.now() - daysAgo * 86400000);
  insertReport.run(
    reporterNames[i % reporterNames.length],
    `+2567001${String(10000 + i).padStart(5,'0')}`,
    wpId, dist.name,
    subCounties[i % subCounties.length],
    villages[i % villages.length],
    ISSUE_TYPES[i % ISSUE_TYPES.length],
    reportDescriptions[i % reportDescriptions.length],
    i % 4 === 0 ? 'high' : 'medium',
    reportStatuses[i % reportStatuses.length],
    reportChannels[i % reportChannels.length],
    dist.lat + (Math.random() - 0.5) * 0.3,
    dist.lng + (Math.random() - 0.5) * 0.3,
    ts.toISOString()
  );
});
console.log('Inserted community reports');

// --- HEALTH INCIDENTS ---
const insertHealth = db.prepare(`
  INSERT INTO health_incidents (district, sub_county, village, disease_type, cases, deaths, hospitalizations, water_source_linked, water_point_id, lat, lng, outbreak_status, investigation_notes, reported_date)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const healthData = [
  { dist: 'Mbale', sc: 'Namatala', vil: 'Namatala', disease: 'cholera', cases: 47, deaths: 2, hosp: 38, linked: 1, status: 'outbreak', notes: 'Linked to piped water scheme. Chlorination failure suspected.' },
  { dist: 'Gulu', sc: 'Pece', vil: 'Pece', disease: 'typhoid', cases: 23, deaths: 0, hosp: 19, linked: 1, status: 'alert', notes: 'Cases clustered around Pece BH-001 water point. E.coli confirmed in water.' },
  { dist: 'Moroto', sc: 'Rupa', vil: 'Rupa', disease: 'diarrhea', cases: 89, deaths: 1, hosp: 12, linked: 1, status: 'outbreak', notes: 'Drought conditions forcing use of unprotected water sources.' },
  { dist: 'Adjumani', sc: 'Pakele', vil: 'Pakele', disease: 'diarrhea', cases: 34, deaths: 0, hosp: 8, linked: 1, status: 'alert', notes: 'Flood contamination of water sources in refugee settlements.' },
  { dist: 'Kasese', sc: 'Kilembe', vil: 'Kilembe', disease: 'diarrhea', cases: 18, deaths: 0, hosp: 5, linked: 1, status: 'monitoring', notes: 'Flood related contamination. Water trucking provided.' },
  { dist: 'Lira', sc: 'Adyel', vil: 'Adyel', disease: 'typhoid', cases: 12, deaths: 0, hosp: 10, linked: 0, status: 'monitoring', notes: 'Investigation ongoing. No clear link to water source yet.' },
  { dist: 'Arua', sc: 'Central', vil: 'Arua Town', disease: 'hepatitis_a', cases: 8, deaths: 0, hosp: 6, linked: 1, status: 'contained', notes: 'Contained following chlorination of water supply.' },
  { dist: 'Soroti', sc: 'Asuret', vil: 'Asuret', disease: 'diarrhea', cases: 156, deaths: 3, hosp: 45, linked: 1, status: 'outbreak', notes: 'Large scale outbreak. Multiple water sources contaminated after flooding.' }
];
healthData.forEach((h, i) => {
  const dist = DISTRICTS.find(d => d.name === h.dist) || DISTRICTS[0];
  const ts = new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000);
  insertHealth.run(
    h.dist, h.sc, h.vil, h.disease, h.cases, h.deaths, h.hosp, h.linked,
    i < wpIds.length ? wpIds[i] : null,
    dist.lat + (Math.random() - 0.5) * 0.3,
    dist.lng + (Math.random() - 0.5) * 0.3,
    h.status, h.notes, ts.toISOString()
  );
});
console.log('Inserted health incidents');

// --- BUDGET RECORDS ---
const insertBudget = db.prepare(`
  INSERT INTO budget_records (district, project_name, project_type, allocated_amount, spent_amount, fiscal_year, funding_source, status, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const budgetData = [
  { dist: 'Gulu', proj: 'Borehole Rehabilitation Phase II', type: 'rehabilitation', alloc: 450000000, spent: 320000000, src: 'Uganda Government', status: 'active' },
  { dist: 'Moroto', proj: 'Emergency Water Supply - Drought Response', type: 'emergency', alloc: 280000000, spent: 195000000, src: 'UNICEF', status: 'active' },
  { dist: 'Adjumani', proj: 'Refugee Settlement Water Infrastructure', type: 'new_infrastructure', alloc: 650000000, spent: 580000000, src: 'UNHCR', status: 'active' },
  { dist: 'Lira', proj: 'Solar Pump Installation Program', type: 'solar_energy', alloc: 380000000, spent: 210000000, src: 'African Development Bank', status: 'active' },
  { dist: 'Mbale', proj: 'Water Quality Improvement Project', type: 'water_quality', alloc: 175000000, spent: 88000000, src: 'WHO/Uganda Govt', status: 'active' },
  { dist: 'Arua', proj: 'Community Water Management Training', type: 'capacity_building', alloc: 85000000, spent: 72000000, src: 'ActionAid', status: 'completed' },
  { dist: 'Kasese', proj: 'Flood Resilience Water Systems', type: 'climate_resilience', alloc: 320000000, spent: 145000000, src: 'GEF/World Bank', status: 'active' },
  { dist: 'Mbarara', proj: 'Rural Piped Water Scheme', type: 'new_infrastructure', alloc: 890000000, spent: 540000000, src: 'Uganda Government', status: 'active' },
  { dist: 'Soroti', proj: 'Groundwater Assessment & Development', type: 'survey', alloc: 120000000, spent: 95000000, src: 'JICA', status: 'completed' },
  { dist: 'Kabale', proj: 'Highland Spring Protection', type: 'protection', alloc: 95000000, spent: 45000000, src: 'NGO Consortium', status: 'active' }
];
budgetData.forEach(b => {
  insertBudget.run(b.dist, b.proj, b.type, b.alloc, b.spent, '2024/2025', b.src, b.status, `${b.type} project targeting water access improvement`);
});
console.log('Inserted budget records');

// --- MAINTENANCE FUNDS ---
const insertFund = db.prepare(`
  INSERT INTO maintenance_funds (water_point_id, district, balance, monthly_target, total_collected, total_spent, last_collection)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
wpIds.slice(0, 20).forEach((wpId, i) => {
  const collected = 200000 + Math.floor(Math.random() * 800000);
  const spent = Math.floor(collected * 0.7);
  const balance = collected - spent;
  insertFund.run(wpId, DISTRICTS[i % DISTRICTS.length].name, balance, 50000, collected, spent, new Date().toISOString());
});
console.log('Inserted maintenance funds');

// --- RESILIENCE SCORES ---
const insertResilience = db.prepare(`
  INSERT INTO resilience_scores (district, water_access_score, infrastructure_score, climate_adaptation_score, governance_score, community_capacity_score, overall_resilience_score)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const resilienceData = [
  { dist: 'Moroto', wa: 32, infra: 28, ca: 22, gov: 35, cc: 30, overall: 29 },
  { dist: 'Kotido', wa: 35, infra: 30, ca: 25, gov: 38, cc: 33, overall: 32 },
  { dist: 'Gulu', wa: 55, infra: 52, ca: 48, gov: 58, cc: 54, overall: 53 },
  { dist: 'Lira', wa: 60, infra: 58, ca: 52, gov: 63, cc: 57, overall: 58 },
  { dist: 'Arua', wa: 58, infra: 55, ca: 50, gov: 60, cc: 55, overall: 56 },
  { dist: 'Soroti', wa: 65, infra: 63, ca: 58, gov: 68, cc: 62, overall: 63 },
  { dist: 'Mbale', wa: 70, infra: 68, ca: 62, gov: 72, cc: 67, overall: 68 },
  { dist: 'Jinja', wa: 78, infra: 76, ca: 70, gov: 80, cc: 74, overall: 76 },
  { dist: 'Masaka', wa: 72, infra: 70, ca: 65, gov: 75, cc: 69, overall: 70 },
  { dist: 'Mbarara', wa: 75, infra: 73, ca: 67, gov: 78, cc: 71, overall: 73 },
  { dist: 'Kasese', wa: 68, infra: 65, ca: 62, gov: 70, cc: 65, overall: 66 },
  { dist: 'Kabale', wa: 73, infra: 71, ca: 68, gov: 76, cc: 70, overall: 72 },
  { dist: 'Hoima', wa: 67, infra: 65, ca: 60, gov: 70, cc: 64, overall: 65 },
  { dist: 'Adjumani', wa: 45, infra: 42, ca: 40, gov: 48, cc: 44, overall: 44 },
  { dist: 'Yumbe', wa: 48, infra: 45, ca: 42, gov: 50, cc: 46, overall: 46 }
];
resilienceData.forEach(r => {
  insertResilience.run(r.dist, r.wa, r.infra, r.ca, r.gov, r.cc, r.overall);
});
console.log('Inserted resilience scores');

// --- SPARE PARTS ---
const partsData = [
  { name: 'Afridev Cylinder', cat: 'pump_parts', qty: 12, min: 5, cost: 85000, supplier: 'Rural Water Uganda' },
  { name: 'Foot Valve (2")', cat: 'valves', qty: 30, min: 10, cost: 25000, supplier: 'Kampala Hardware' },
  { name: 'Pump Rod (3m)', cat: 'pump_parts', qty: 25, min: 8, cost: 45000, supplier: 'Rural Water Uganda' },
  { name: 'Rubber Seals Set', cat: 'seals', qty: 50, min: 20, cost: 8500, supplier: 'Uganda Pumps Ltd' },
  { name: 'Solar Panel 200W', cat: 'solar', qty: 8, min: 3, cost: 450000, supplier: 'SolarPower Uganda' },
  { name: 'Solar Controller', cat: 'solar', qty: 10, min: 4, cost: 180000, supplier: 'SolarPower Uganda' },
  { name: 'Submersible Pump', cat: 'pump', qty: 5, min: 2, cost: 1200000, supplier: 'Grundfos Uganda' },
  { name: 'PVC Pipe 2"', cat: 'pipes', qty: 200, min: 50, cost: 12000, supplier: 'Kampala Hardware' },
  { name: 'Gate Valve 2"', cat: 'valves', qty: 20, min: 5, cost: 35000, supplier: 'Kampala Hardware' },
  { name: 'Water Testing Kit', cat: 'testing', qty: 15, min: 5, cost: 280000, supplier: 'Lab Supplies Ltd' }
];
const insertParts = db.prepare(`
  INSERT INTO spare_parts (part_name, category, quantity, min_quantity, unit_cost, supplier, district, last_restocked)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);
partsData.forEach(p => insertParts.run(p.name, p.cat, p.qty, p.min, p.cost, p.supplier, 'Gulu'));
console.log('Inserted spare parts');

// --- GOVERNANCE AUDIT ---
const insertAudit = db.prepare(`
  INSERT INTO governance_audit (user_id, action, entity_type, entity_id, details, timestamp)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const auditActions = [
  [1, 'CREATE', 'water_point', 1, 'Created new water point: Acholi Borehole BH-001'],
  [2, 'UPDATE', 'water_point', 3, 'Updated status to needs_repair for Pece Ward BH-007'],
  [6, 'CREATE', 'maintenance_request', 1, 'Created maintenance request for broken pump handle'],
  [7, 'CREATE', 'water_quality_test', 2, 'Submitted water quality test results - CONTAMINATED'],
  [1, 'APPROVE', 'budget_record', 1, 'Approved Borehole Rehabilitation budget UGX 450M'],
  [2, 'DISPATCH', 'maintenance_request', 2, 'Dispatched technician Peter Ssemanda to site'],
  [3, 'REPORT', 'community_report', 1, 'Submitted community report: pump breakdown'],
  [8, 'PUBLISH', 'drought_index', 1, 'Published monthly drought index report - Moroto critical'],
  [1, 'RESOLVE', 'alert', 3, 'Resolved contamination alert - borehole treated and reopened'],
  [5, 'CREATE', 'health_incident', 1, 'Logged cholera outbreak - Mbale Namatala 47 cases']
];
auditActions.forEach(([uid, action, entity, eid, details], i) => {
  const ts = new Date(Date.now() - i * 3 * 3600000);
  insertAudit.run(uid, action, entity, eid, details, ts.toISOString());
});
console.log('Inserted governance audit logs');

// --- CITIZEN REPORTS (multi-channel) ---
const citizenReports = db.prepare('SELECT COUNT(*) as c FROM citizen_reports').get().c;
if (citizenReports === 0) {
  const insReport = db.prepare(`
    INSERT INTO citizen_reports (user_id, reporter_name, reporter_phone, reporter_email, incident_type, description, district, sub_county, village, lat, lng, severity, channel, water_impact, affected_population, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const reportSeed = [
    [10, 'John Citizen', '+256700111222', 'john@citizen.ug', 'water_contamination', 'The community borehole water has turned brown and smells like rotten eggs. Several children have developed diarrhea.', 'Gulu', 'Pece', 'Pece Ward', 0.33, 32.57, 'high', 'app', 'severe', 350, 'pending'],
    [10, 'John Citizen', '+256700111222', 'john@citizen.ug', 'illegal_dumping', 'I witnessed a truck dumping what looks like chemical waste near the wetland behind the market.', 'Jinja', 'Bugembe', 'Central', 0.43, 33.22, 'critical', 'whatsapp', 'severe', 1200, 'under_investigation'],
    [null, 'Anonymous', null, null, 'sewage_leak', 'Raw sewage is flowing into the drainage channel near the school. The smell is unbearable and children are playing nearby.', 'Lira', 'Ojwina', 'Town', 2.25, 32.89, 'high', 'sms', 'critical', 800, 'pending'],
    [null, 'Anonymous', null, null, 'flooding', 'Heavy rains have caused the river to burst its banks. Several homes are flooded and the water is entering the main road.', 'Soroti', 'Arapai', 'River Zone', 1.71, 33.62, 'emergency', 'phone', 'critical', 2000, 'assigned'],
    [10, 'John Citizen', '+256700111222', 'john@citizen.ug', 'water_pollution', 'The nearby factory is discharging green-colored waste directly into the stream that we use for drinking water.', 'Mbale', 'Wanale', 'Industrial Area', 1.08, 34.17, 'high', 'email', 'severe', 500, 'pending'],
  ];
  reportSeed.forEach(r => insReport.run(...r));
  console.log('Inserted citizen reports');

  // Add tracking entries
  const insTrack = db.prepare(`INSERT INTO citizen_report_tracking (report_id, status, note, updated_by) VALUES (?, ?, ?, ?)`);
  insTrack.run(1, 'submitted', 'Report submitted via mobile app', 10);
  insTrack.run(1, 'pending', 'Awaiting initial review', null);
  insTrack.run(2, 'submitted', 'Report submitted via WhatsApp', 10);
  insTrack.run(2, 'under_investigation', 'Officer dispatched to investigate', 2);
  insTrack.run(4, 'submitted', 'Emergency report via phone call', null);
  insTrack.run(4, 'assigned', 'Emergency response team deployed', 2);
  console.log('Inserted report tracking entries');
}

console.log('\n✅ DATABASE SEED COMPLETE');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Demo Login Credentials:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
users.forEach(u => console.log(`  ${u.role.padEnd(22)} | ${u.email.padEnd(30)} | password123`));
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
