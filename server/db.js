const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'watermonitor.db');
let db;
const add = sql => { try { db.exec(sql); } catch {} };

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    runMigrations();
  }
  return db;
}


function runMigrations() {
  const add = sql => { try { db.exec(sql); } catch {} };
  add(`ALTER TABLE users ADD COLUMN avatar TEXT`);
  add(`ALTER TABLE users ADD COLUMN national_id TEXT`);
  add(`ALTER TABLE users ADD COLUMN otp_verified INTEGER DEFAULT 0`);
  add(`ALTER TABLE users ADD COLUMN community_id TEXT`);
  add(`ALTER TABLE users ADD COLUMN location TEXT`);
  add(`ALTER TABLE users ADD COLUMN district TEXT`);
  add(`ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en'`);
  add(`ALTER TABLE users ADD COLUMN sub_county TEXT`);
  /* ── OTP Codes ── */
  add(`CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    otp TEXT NOT NULL,
    purpose TEXT DEFAULT 'registration',
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  /* ── Citizen Multi-Channel Reports ── */
  add(`CREATE TABLE IF NOT EXISTS citizen_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    reporter_name TEXT NOT NULL,
    reporter_phone TEXT,
    reporter_email TEXT,
    incident_type TEXT NOT NULL,
    description TEXT NOT NULL,
    district TEXT NOT NULL,
    sub_county TEXT,
    village TEXT,
    lat REAL,
    lng REAL,
    severity TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending',
    channel TEXT NOT NULL DEFAULT 'app',
    water_impact TEXT,
    affected_population INTEGER DEFAULT 0,
    is_anonymous INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  /* ── Report Media Attachments ── */
  add(`CREATE TABLE IF NOT EXISTS report_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER REFERENCES citizen_reports(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL,
    file_path TEXT,
    file_data TEXT,
    mime_type TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  /* ── Incident Analysis (AI) ── */
  add(`CREATE TABLE IF NOT EXISTS incident_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER REFERENCES citizen_reports(id) ON DELETE CASCADE,
    ai_severity TEXT,
    ai_category TEXT,
    ai_urgency TEXT DEFAULT 'medium',
    ai_risk_score REAL DEFAULT 0,
    extracted_location TEXT,
    ai_summary TEXT,
    is_duplicate INTEGER DEFAULT 0,
    duplicate_of_id INTEGER,
    is_false_report INTEGER DEFAULT 0,
    confidence_score REAL DEFAULT 0,
    speech_to_text TEXT,
    image_analysis TEXT,
    response_recommendation TEXT,
    analyzed_at TEXT DEFAULT (datetime('now'))
  )`);

  /* ── Task Assignments ── */
  add(`CREATE TABLE IF NOT EXISTS task_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER REFERENCES citizen_reports(id) ON DELETE SET NULL,
    incident_id INTEGER REFERENCES env_incidents(id) ON DELETE SET NULL,
    assigned_to INTEGER REFERENCES users(id),
    assigned_by INTEGER REFERENCES users(id),
    task_type TEXT NOT NULL,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'assigned',
    department TEXT,
    due_by TEXT,
    description TEXT,
    location TEXT,
    district TEXT,
    sub_county TEXT,
    village TEXT,
    notes TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  /* ── Response Tickets ── */
  add(`CREATE TABLE IF NOT EXISTS response_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER REFERENCES citizen_reports(id) ON DELETE SET NULL,
    incident_id INTEGER REFERENCES env_incidents(id) ON DELETE SET NULL,
    ticket_number TEXT UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'open',
    assigned_team TEXT,
    assigned_agency TEXT,
    district TEXT,
    location TEXT,
    lat REAL,
    lng REAL,
    response_deadline TEXT,
    resolution_notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT
  )`);

  /* ── Notification Log ── */
  /* ── AI Conversations (Persistent Chat Sessions) ── */
  add(`CREATE TABLE IF NOT EXISTS ai_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'New Chat',
    user_id INTEGER REFERENCES users(id),
    role TEXT NOT NULL,
    district TEXT,
    category TEXT DEFAULT 'general',
    incident_id INTEGER,
    location_id INTEGER,
    is_multi_user INTEGER DEFAULT 0,
    participants TEXT,
    summary TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  /* ── AI Messages ── */
  add(`CREATE TABLE IF NOT EXISTS ai_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
    content TEXT NOT NULL,
    content_type TEXT DEFAULT 'text',
    file_url TEXT,
    file_type TEXT,
    file_name TEXT,
    file_size INTEGER,
    metadata TEXT,
    tokens_used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  /* ── AI Analytics Cache ── */
  add(`CREATE TABLE IF NOT EXISTS ai_analytics_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT UNIQUE NOT NULL,
    data TEXT NOT NULL,
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  /* ── AI Decision Log ── */
  add(`CREATE TABLE IF NOT EXISTS ai_decision_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    decision_type TEXT NOT NULL,
    input_data TEXT,
    output_data TEXT,
    confidence_score REAL,
    user_id INTEGER REFERENCES users(id),
    role TEXT,
    district TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  add(`CREATE TABLE IF NOT EXISTS notification_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_type TEXT NOT NULL,
    recipient_id INTEGER,
    recipient_contact TEXT,
    channel TEXT NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    reference_type TEXT,
    reference_id INTEGER,
    sent_at TEXT DEFAULT (datetime('now')),
    delivered_at TEXT
  )`);

  /* ── Citizen Report Tracking ── */
  add(`CREATE TABLE IF NOT EXISTS citizen_report_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER REFERENCES citizen_reports(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    note TEXT,
    updated_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Citizen module tables
  add(`CREATE TABLE IF NOT EXISTS citizen_discussions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    like_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    pinned INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  add(`CREATE TABLE IF NOT EXISTS citizen_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discussion_id INTEGER REFERENCES citizen_discussions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  add(`CREATE TABLE IF NOT EXISTS discussion_likes (
    discussion_id INTEGER REFERENCES citizen_discussions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (discussion_id, user_id)
  )`);

  add(`CREATE TABLE IF NOT EXISTS volunteer_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    district TEXT,
    event_date TEXT,
    event_time TEXT,
    event_type TEXT DEFAULT 'cleanup',
    max_volunteers INTEGER DEFAULT 50,
    created_by INTEGER REFERENCES users(id),
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  add(`CREATE TABLE IF NOT EXISTS event_registrations (
    event_id INTEGER REFERENCES volunteer_events(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (event_id, user_id)
  )`);

  add(`CREATE TABLE IF NOT EXISTS citizen_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    author_name TEXT NOT NULL,
    observation_type TEXT NOT NULL,
    district TEXT,
    location TEXT,
    description TEXT NOT NULL,
    value REAL,
    unit TEXT,
    photo_base64 TEXT,
    lat REAL,
    lng REAL,
    verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      district TEXT,
      sub_county TEXT,
      phone TEXT,
      organization TEXT,
      avatar TEXT,
      active INTEGER DEFAULT 1,
      last_login TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS water_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'functional',
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      district TEXT NOT NULL,
      sub_county TEXT,
      village TEXT,
      yield_lph REAL,
      depth_m REAL,
      water_table_m REAL,
      pump_type TEXT,
      solar_powered INTEGER DEFAULT 0,
      installed_date TEXT,
      last_maintained TEXT,
      next_maintenance TEXT,
      beneficiaries INTEGER DEFAULT 0,
      households INTEGER DEFAULT 0,
      infrastructure_score INTEGER DEFAULT 80,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sensors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      water_point_id INTEGER REFERENCES water_points(id),
      sensor_type TEXT NOT NULL,
      sensor_name TEXT NOT NULL,
      serial_number TEXT,
      status TEXT DEFAULT 'active',
      min_threshold REAL,
      max_threshold REAL,
      unit TEXT,
      last_reading REAL,
      last_seen TEXT,
      battery_level INTEGER DEFAULT 100,
      signal_strength INTEGER DEFAULT 85,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sensor_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sensor_id INTEGER REFERENCES sensors(id),
      water_point_id INTEGER REFERENCES water_points(id),
      value REAL NOT NULL,
      unit TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      water_point_id INTEGER REFERENCES water_points(id),
      reported_by INTEGER REFERENCES users(id),
      assigned_to INTEGER REFERENCES users(id),
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      issue_type TEXT NOT NULL,
      description TEXT,
      estimated_cost REAL,
      actual_cost REAL,
      spare_parts TEXT,
      resolution_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS climate_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      district TEXT NOT NULL,
      station TEXT,
      rainfall_mm REAL DEFAULT 0,
      temperature_max REAL,
      temperature_min REAL,
      humidity_pct REAL,
      wind_speed_kmh REAL,
      soil_moisture REAL,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS drought_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      district TEXT NOT NULL,
      spi_value REAL,
      severity TEXT,
      groundwater_recharge REAL,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS flood_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      district TEXT NOT NULL,
      river_name TEXT,
      water_level_m REAL,
      flood_risk TEXT,
      affected_communities TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS water_quality_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      water_point_id INTEGER REFERENCES water_points(id),
      tested_by INTEGER REFERENCES users(id),
      turbidity_ntu REAL,
      ph REAL,
      tds_ppm REAL,
      e_coli_cfu REAL,
      nitrates_ppm REAL,
      fluoride_ppm REAL,
      chlorine_residual REAL,
      temperature_c REAL,
      overall_safe INTEGER DEFAULT 1,
      water_safety_score INTEGER DEFAULT 85,
      notes TEXT,
      tested_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      water_point_id INTEGER REFERENCES water_points(id),
      district TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      source TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS community_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_name TEXT,
      reporter_phone TEXT,
      water_point_id INTEGER REFERENCES water_points(id),
      district TEXT NOT NULL,
      sub_county TEXT,
      village TEXT,
      issue_type TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'open',
      channel TEXT DEFAULT 'app',
      lat REAL,
      lng REAL,
      assigned_to INTEGER REFERENCES users(id),
      resolution_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS health_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      district TEXT NOT NULL,
      sub_county TEXT,
      village TEXT,
      disease_type TEXT NOT NULL,
      cases INTEGER DEFAULT 0,
      deaths INTEGER DEFAULT 0,
      hospitalizations INTEGER DEFAULT 0,
      water_source_linked INTEGER DEFAULT 0,
      water_point_id INTEGER REFERENCES water_points(id),
      lat REAL,
      lng REAL,
      outbreak_status TEXT DEFAULT 'monitoring',
      investigation_notes TEXT,
      reported_date TEXT DEFAULT (datetime('now')),
      resolved_date TEXT
    );

    CREATE TABLE IF NOT EXISTS governance_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budget_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      district TEXT NOT NULL,
      project_name TEXT NOT NULL,
      project_type TEXT,
      allocated_amount REAL NOT NULL,
      spent_amount REAL DEFAULT 0,
      fiscal_year TEXT,
      funding_source TEXT,
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_funds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      water_point_id INTEGER REFERENCES water_points(id),
      district TEXT NOT NULL,
      balance REAL DEFAULT 0,
      monthly_target REAL DEFAULT 50000,
      total_collected REAL DEFAULT 0,
      total_spent REAL DEFAULT 0,
      last_collection TEXT,
      managed_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS resilience_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      district TEXT NOT NULL,
      water_access_score INTEGER DEFAULT 70,
      infrastructure_score INTEGER DEFAULT 65,
      climate_adaptation_score INTEGER DEFAULT 55,
      governance_score INTEGER DEFAULT 60,
      community_capacity_score INTEGER DEFAULT 68,
      overall_resilience_score INTEGER DEFAULT 64,
      calculated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS spare_parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_name TEXT NOT NULL,
      category TEXT,
      quantity INTEGER DEFAULT 0,
      min_quantity INTEGER DEFAULT 5,
      unit_cost REAL,
      supplier TEXT,
      district TEXT,
      last_restocked TEXT
    );

    /* ── PHASE 3: GWN CITIZEN SCIENCE ─────────────────────────────── */

    CREATE TABLE IF NOT EXISTS gwn_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_name TEXT,
      reporter_phone TEXT,
      reporter_type TEXT DEFAULT 'citizen',
      report_type TEXT NOT NULL,
      description TEXT,
      district TEXT NOT NULL,
      sub_county TEXT,
      village TEXT,
      lat REAL,
      lng REAL,
      severity TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'submitted',
      photo_key TEXT,
      is_anonymous INTEGER DEFAULT 0,
      channel TEXT DEFAULT 'app',
      community_votes INTEGER DEFAULT 0,
      satellite_verified INTEGER DEFAULT 0,
      escalated INTEGER DEFAULT 0,
      escalation_level TEXT DEFAULT 'district',
      assigned_agency TEXT,
      resolution_notes TEXT,
      ai_score REAL,
      ai_risk TEXT,
      ai_action TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    /* ── PHASE 6: INCIDENT COMMAND ──────────────────────────────────── */

    CREATE TABLE IF NOT EXISTS env_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      district TEXT NOT NULL,
      sub_county TEXT,
      village TEXT,
      lat REAL,
      lng REAL,
      severity TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'active',
      reported_by INTEGER,
      affected_population INTEGER DEFAULT 0,
      response_agencies TEXT,
      ai_risk_score REAL DEFAULT 0,
      satellite_evidence INTEGER DEFAULT 0,
      enforcement_actions TEXT,
      resolution_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      FOREIGN KEY (reported_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS agency_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL,
      agency_name TEXT NOT NULL,
      agency_role TEXT DEFAULT 'support',
      officer_name TEXT,
      contact TEXT,
      assigned_at TEXT DEFAULT (datetime('now')),
      status TEXT DEFAULT 'active',
      FOREIGN KEY (incident_id) REFERENCES env_incidents(id)
    );

    CREATE TABLE IF NOT EXISTS pollution_hotspots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      hotspot_type TEXT DEFAULT 'mixed',
      district TEXT,
      lat REAL,
      lng REAL,
      pollution_score REAL DEFAULT 0,
      report_count INTEGER DEFAULT 0,
      dominant_type TEXT,
      risk_level TEXT DEFAULT 'medium',
      active INTEGER DEFAULT 1,
      last_updated TEXT DEFAULT (datetime('now'))
    );

  `);

    /* ── Language Learning & Translation Feedback ── */
    add(`CREATE TABLE IF NOT EXISTS language_corpus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      language TEXT NOT NULL,
      term TEXT NOT NULL,
      english_equivalent TEXT,
      frequency INTEGER DEFAULT 1,
      context TEXT,
      source TEXT DEFAULT 'report',
      first_seen TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now')),
      UNIQUE(language, term)
    )`);

    add(`CREATE TABLE IF NOT EXISTS dialect_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      language TEXT NOT NULL,
      region TEXT NOT NULL,
      pattern TEXT NOT NULL,
      english_translation TEXT,
      frequency INTEGER DEFAULT 1,
      confidence REAL DEFAULT 0.5,
      first_seen TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now')),
      UNIQUE(language, region, pattern)
    )`);

    add(`CREATE TABLE IF NOT EXISTS accent_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      language TEXT NOT NULL,
      speaker_id INTEGER,
      phonetic_pattern TEXT,
      accuracy_score REAL DEFAULT 0.5,
      recordings_count INTEGER DEFAULT 0,
      last_updated TEXT DEFAULT (datetime('now'))
    )`);

    add(`CREATE TABLE IF NOT EXISTS translation_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      source_language TEXT NOT NULL,
      target_language TEXT NOT NULL,
      feedback_score INTEGER DEFAULT 0,
      corrected_translation TEXT,
      user_id INTEGER,
      reviewed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    /* ── Offline Message Queue ── */
    add(`CREATE TABLE IF NOT EXISTS offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      channel TEXT DEFAULT 'app',
      recipient_id INTEGER,
      recipient_contact TEXT,
      language TEXT DEFAULT 'en',
      priority INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      synced_at TEXT
    )`);

  db.exec(`
    /* ── INDEXES ──────────────────────────────────────────────────────── */

    CREATE INDEX IF NOT EXISTS idx_wp_district ON water_points(district);
    CREATE INDEX IF NOT EXISTS idx_sr_time ON sensor_readings(timestamp);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_mr_status ON maintenance_requests(status);
    CREATE INDEX IF NOT EXISTS idx_cr_district ON community_reports(district);
    CREATE INDEX IF NOT EXISTS idx_hi_district ON health_incidents(district);
    CREATE INDEX IF NOT EXISTS idx_gwn_district ON gwn_reports(district);
    CREATE INDEX IF NOT EXISTS idx_gwn_status ON gwn_reports(status);
    CREATE INDEX IF NOT EXISTS idx_ei_district ON env_incidents(district);
    CREATE INDEX IF NOT EXISTS idx_lc_lang ON language_corpus(language);
    CREATE INDEX IF NOT EXISTS idx_dp_region ON dialect_patterns(region);
    CREATE INDEX IF NOT EXISTS idx_oq_status ON offline_queue(status);
    CREATE INDEX IF NOT EXISTS idx_oq_priority ON offline_queue(priority);
  `);

  /* ── Seed Phase 3 & 6 sample data (idempotent) ──────────────────── */
  const gwn = db.prepare('SELECT COUNT(*) as c FROM gwn_reports').get();
  if (gwn.c === 0) {
    const ins = db.prepare(`INSERT INTO gwn_reports
      (reporter_name,reporter_type,report_type,description,district,village,lat,lng,severity,status,community_votes,satellite_verified,ai_score,ai_risk,ai_action)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    [
      ['Okello James','community','sewage_leak','Raw sewage overflowing into community borehole compound. Strong odor and brown water.','Gulu','Pece Ward',0.33,32.57,'high','verified',7,1,85.2,'sewage_contamination','Close borehole. Deploy health team within 24h.'],
      ['Anonymous','citizen','illegal_dumping','Truck dumping chemical waste near Nile tributary at night. Oily sheen on water.','Jinja','Bugembe',0.43,33.22,'critical','investigating',12,1,92.1,'industrial_chemical','Emergency response required. Issue injunction on factory.'],
      ['Mary Atim','citizen','algae_bloom','Thick green algae covering entire pond. Fish dying. Community cannot use the water.','Lira','Ojwina',2.24,32.89,'medium','submitted',3,0,61.0,'algae_pollution','Water quality test. Algae treatment required.'],
      ['Field Officer','field_officer','oil_spill','Oily sheen on 200m river stretch. Upstream factory is likely source.','Soroti','Arapai',1.71,33.62,'critical','investigating',5,0,89.7,'oil_petroleum','Containment booms. Factory inspection warrant.'],
      ['Peter Omara','community','discoloration','Borehole water is yellowish and smells of sulfur after recent blasting nearby.','Moroto','Moroto TC',2.53,34.66,'medium','verified',4,0,55.4,'mineral_contamination','Lab test. Possible geological contamination.'],
    ].forEach(r => ins.run(...r));

    const iins = db.prepare(`INSERT INTO env_incidents
      (incident_type,title,description,district,lat,lng,severity,status,affected_population,ai_risk_score,satellite_evidence)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    [
      ['industrial_discharge','Jinja Chemical Plant Discharge into Nile Tributary','Confirmed industrial chemical discharge. E.coli 890 CFU, pH 3.2. Multiple agencies notified.','Jinja',0.43,33.23,'critical','investigating',8500,94.2,1],
      ['sewage_overflow','Gulu Municipal Sewage Overflow','Major sewage overflow affecting 3 community water points. Cholera risk elevated.','Gulu',0.33,32.56,'high','active',12000,78.5,0],
      ['illegal_dumping','Soroti Industrial Waste at Wetland','Repeated illegal waste dumping at protected wetland. Heavy metals detected in soil.','Soroti',1.70,33.60,'high','active',3200,71.3,0],
    ].forEach(r => iins.run(...r));

    const hins = db.prepare(`INSERT INTO pollution_hotspots (name,hotspot_type,district,lat,lng,pollution_score,report_count,dominant_type,risk_level) VALUES (?,?,?,?,?,?,?,?,?)`);
    [
      ['Kampala-Jinja Road Industrial Zone','industrial','Jinja',0.32,33.10,78.5,14,'industrial_discharge','high'],
      ['Gulu Municipal Sewage Zone','urban','Gulu',0.33,32.56,72.0,9,'sewage_overflow','high'],
      ['Soroti Wetland Dump Site','industrial','Soroti',1.70,33.60,65.0,8,'illegal_dumping','medium'],
      ['Lira Abattoir Runoff Area','urban','Lira',2.25,32.90,55.0,6,'agricultural_runoff','medium'],
      ['Moroto Mining Zone','industrial','Moroto',2.52,34.65,48.0,4,'mineral_contamination','medium'],
    ].forEach(h => hins.run(...h));
  }
}

module.exports = { getDb };
