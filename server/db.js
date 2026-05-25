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

  // Migration tracking table — records which one-time migrations have been applied
  add(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  )`);

  // One-time: remove all demo/seed users except national_admin accounts
  const v1done = db.prepare("SELECT name FROM _migrations WHERE name = 'remove_demo_users_v1'").get();
  if (!v1done) {
    db.pragma('foreign_keys = OFF');
    db.prepare("DELETE FROM users WHERE role != 'national_admin'").run();
    db.pragma('foreign_keys = ON');
    db.prepare("INSERT INTO _migrations (name) VALUES ('remove_demo_users_v1')").run();
    console.log('[MIGRATION] remove_demo_users_v1: all non-admin demo accounts deleted.');
  }

  // One-time: remove ALL known demo accounts (including the demo national_admin)
  const v2done = db.prepare("SELECT name FROM _migrations WHERE name = 'remove_demo_users_v2'").get();
  if (!v2done) {
    const demoEmails = [
      'admin@mwe.go.ug',
      'officer@gulu.go.ug',
      'committee@arua.ug',
      'john@citizen.ug',
      'sarah@actionaid.org',
      'tech@maintenance.ug',
      'health@moh.go.ug',
      'climate@nema.go.ug',
      'officer@lira.go.ug',
      'officer@moroto.go.ug',
      'admin@hydrosense.ug',
    ];
    const placeholders = demoEmails.map(() => '?').join(',');
    db.pragma('foreign_keys = OFF');
    db.prepare(`DELETE FROM users WHERE email IN (${placeholders})`).run(...demoEmails);
    db.pragma('foreign_keys = ON');
    db.prepare("INSERT INTO _migrations (name) VALUES ('remove_demo_users_v2')").run();
    console.log('[MIGRATION] remove_demo_users_v2: all hardcoded demo accounts deleted.');
  }

  add(`ALTER TABLE users ADD COLUMN avatar TEXT`);
  add(`ALTER TABLE users ADD COLUMN national_id TEXT`);
  add(`ALTER TABLE users ADD COLUMN otp_verified INTEGER DEFAULT 0`);
  add(`ALTER TABLE users ADD COLUMN community_id TEXT`);
  add(`ALTER TABLE users ADD COLUMN location TEXT`);
  add(`ALTER TABLE users ADD COLUMN district TEXT`);
  add(`ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en'`);
  add(`ALTER TABLE users ADD COLUMN sub_county TEXT`);
  /* ── OTP Codes (secure) ── */
  add(`CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    otp TEXT NOT NULL,
    purpose TEXT DEFAULT 'registration',
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    blocked_until TEXT,
    ip_address TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  /* migrations for existing otp_codes table */
  add(`ALTER TABLE otp_codes ADD COLUMN attempts INTEGER DEFAULT 0`);
  add(`ALTER TABLE otp_codes ADD COLUMN blocked_until TEXT`);
  add(`ALTER TABLE otp_codes ADD COLUMN ip_address TEXT`);
  /* ── Failed OTP attempt log ── */
  add(`CREATE TABLE IF NOT EXISTS otp_attempt_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    ip_address TEXT,
    success INTEGER DEFAULT 0,
    attempted_at TEXT DEFAULT (datetime('now'))
  )`);
  /* ── OTP delivery log (SMS + Email provider tracking) ── */
  add(`CREATE TABLE IF NOT EXISTS otp_delivery_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    phone TEXT,
    channel TEXT NOT NULL,
    provider TEXT NOT NULL,
    status TEXT DEFAULT 'sent',
    provider_message_id TEXT,
    error_message TEXT,
    sent_at TEXT DEFAULT (datetime('now'))
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

}

module.exports = { getDb };
