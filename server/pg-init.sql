-- ═══════════════════════════════════════════════════════════════════════════
-- HYDROSENSE — PostgreSQL Schema Initialization
-- Climate-Resilient Rural Water Monitoring System
-- ═══════════════════════════════════════════════════════════════════════════
-- This script creates the complete HydroSense database schema for PostgreSQL.
-- Run this against a fresh PostgreSQL database before starting the services.
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════════════════════════════════════════════════════════════
-- CORE TABLES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  district TEXT,
  sub_county TEXT,
  phone TEXT,
  organization TEXT,
  avatar TEXT,
  national_id TEXT,
  otp_verified INTEGER DEFAULT 0,
  community_id TEXT,
  location TEXT,
  language TEXT DEFAULT 'en',
  active INTEGER DEFAULT 1,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS water_points (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'functional',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  district TEXT NOT NULL,
  sub_county TEXT,
  village TEXT,
  yield_lph DOUBLE PRECISION,
  depth_m DOUBLE PRECISION,
  water_table_m DOUBLE PRECISION,
  pump_type TEXT,
  solar_powered INTEGER DEFAULT 0,
  installed_date TIMESTAMPTZ,
  last_maintained TIMESTAMPTZ,
  next_maintenance TIMESTAMPTZ,
  beneficiaries INTEGER DEFAULT 0,
  households INTEGER DEFAULT 0,
  infrastructure_score INTEGER DEFAULT 80,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sensors (
  id SERIAL PRIMARY KEY,
  water_point_id INTEGER REFERENCES water_points(id),
  sensor_type TEXT NOT NULL,
  sensor_name TEXT NOT NULL,
  serial_number TEXT,
  status TEXT DEFAULT 'active',
  min_threshold DOUBLE PRECISION,
  max_threshold DOUBLE PRECISION,
  unit TEXT,
  last_reading DOUBLE PRECISION,
  last_seen TIMESTAMPTZ,
  battery_level INTEGER DEFAULT 100,
  signal_strength INTEGER DEFAULT 85,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id SERIAL PRIMARY KEY,
  sensor_id INTEGER REFERENCES sensors(id),
  water_point_id INTEGER REFERENCES water_points(id),
  value DOUBLE PRECISION NOT NULL,
  unit TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_requests (
  id SERIAL PRIMARY KEY,
  water_point_id INTEGER REFERENCES water_points(id),
  reported_by INTEGER REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id),
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  issue_type TEXT NOT NULL,
  description TEXT,
  estimated_cost DOUBLE PRECISION,
  actual_cost DOUBLE PRECISION,
  spare_parts TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS climate_readings (
  id SERIAL PRIMARY KEY,
  district TEXT NOT NULL,
  station TEXT,
  rainfall_mm DOUBLE PRECISION DEFAULT 0,
  temperature_max DOUBLE PRECISION,
  temperature_min DOUBLE PRECISION,
  humidity_pct DOUBLE PRECISION,
  wind_speed_kmh DOUBLE PRECISION,
  soil_moisture DOUBLE PRECISION,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drought_index (
  id SERIAL PRIMARY KEY,
  district TEXT NOT NULL,
  spi_value DOUBLE PRECISION,
  severity TEXT,
  groundwater_recharge DOUBLE PRECISION,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flood_alerts (
  id SERIAL PRIMARY KEY,
  district TEXT NOT NULL,
  river_name TEXT,
  water_level_m DOUBLE PRECISION,
  flood_risk TEXT,
  affected_communities TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS water_quality_tests (
  id SERIAL PRIMARY KEY,
  water_point_id INTEGER REFERENCES water_points(id),
  tested_by INTEGER REFERENCES users(id),
  turbidity_ntu DOUBLE PRECISION,
  ph DOUBLE PRECISION,
  tds_ppm DOUBLE PRECISION,
  e_coli_cfu DOUBLE PRECISION,
  nitrates_ppm DOUBLE PRECISION,
  fluoride_ppm DOUBLE PRECISION,
  chlorine_residual DOUBLE PRECISION,
  temperature_c DOUBLE PRECISION,
  overall_safe INTEGER DEFAULT 1,
  water_safety_score INTEGER DEFAULT 85,
  notes TEXT,
  tested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  water_point_id INTEGER REFERENCES water_points(id),
  district TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS community_reports (
  id SERIAL PRIMARY KEY,
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
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  assigned_to INTEGER REFERENCES users(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS health_incidents (
  id SERIAL PRIMARY KEY,
  district TEXT NOT NULL,
  sub_county TEXT,
  village TEXT,
  disease_type TEXT NOT NULL,
  cases INTEGER DEFAULT 0,
  deaths INTEGER DEFAULT 0,
  hospitalizations INTEGER DEFAULT 0,
  water_source_linked INTEGER DEFAULT 0,
  water_point_id INTEGER REFERENCES water_points(id),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  outbreak_status TEXT DEFAULT 'monitoring',
  investigation_notes TEXT,
  reported_date TIMESTAMPTZ DEFAULT NOW(),
  resolved_date TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS governance_audit (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budget_records (
  id SERIAL PRIMARY KEY,
  district TEXT NOT NULL,
  project_name TEXT NOT NULL,
  project_type TEXT,
  allocated_amount DOUBLE PRECISION NOT NULL,
  spent_amount DOUBLE PRECISION DEFAULT 0,
  fiscal_year TEXT,
  funding_source TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_funds (
  id SERIAL PRIMARY KEY,
  water_point_id INTEGER REFERENCES water_points(id),
  district TEXT NOT NULL,
  balance DOUBLE PRECISION DEFAULT 0,
  monthly_target DOUBLE PRECISION DEFAULT 50000,
  total_collected DOUBLE PRECISION DEFAULT 0,
  total_spent DOUBLE PRECISION DEFAULT 0,
  last_collection TIMESTAMPTZ,
  managed_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS resilience_scores (
  id SERIAL PRIMARY KEY,
  district TEXT NOT NULL,
  water_access_score INTEGER DEFAULT 70,
  infrastructure_score INTEGER DEFAULT 65,
  climate_adaptation_score INTEGER DEFAULT 55,
  governance_score INTEGER DEFAULT 60,
  community_capacity_score INTEGER DEFAULT 68,
  overall_resilience_score INTEGER DEFAULT 64,
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spare_parts (
  id SERIAL PRIMARY KEY,
  part_name TEXT NOT NULL,
  category TEXT,
  quantity INTEGER DEFAULT 0,
  min_quantity INTEGER DEFAULT 5,
  unit_cost DOUBLE PRECISION,
  supplier TEXT,
  district TEXT,
  last_restocked TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════════
-- GWN CITIZEN SCIENCE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gwn_reports (
  id SERIAL PRIMARY KEY,
  reporter_name TEXT,
  reporter_phone TEXT,
  reporter_type TEXT DEFAULT 'citizen',
  report_type TEXT NOT NULL,
  description TEXT,
  district TEXT NOT NULL,
  sub_county TEXT,
  village TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
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
  ai_score DOUBLE PRECISION,
  ai_risk TEXT,
  ai_action TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ENVIRONMENTAL INCIDENTS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS env_incidents (
  id SERIAL PRIMARY KEY,
  incident_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  district TEXT NOT NULL,
  sub_county TEXT,
  village TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  severity TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'active',
  reported_by INTEGER REFERENCES users(id),
  affected_population INTEGER DEFAULT 0,
  response_agencies TEXT,
  ai_risk_score DOUBLE PRECISION DEFAULT 0,
  satellite_evidence INTEGER DEFAULT 0,
  enforcement_actions TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agency_assignments (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES env_incidents(id),
  agency_name TEXT NOT NULL,
  agency_role TEXT DEFAULT 'support',
  officer_name TEXT,
  contact TEXT,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS pollution_hotspots (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  hotspot_type TEXT DEFAULT 'mixed',
  district TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  pollution_score DOUBLE PRECISION DEFAULT 0,
  report_count INTEGER DEFAULT 0,
  dominant_type TEXT,
  risk_level TEXT DEFAULT 'medium',
  active INTEGER DEFAULT 1,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- LANGUAGE LEARNING & TRANSLATION
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS language_corpus (
  id SERIAL PRIMARY KEY,
  language TEXT NOT NULL,
  term TEXT NOT NULL,
  english_equivalent TEXT,
  frequency INTEGER DEFAULT 1,
  context TEXT,
  source TEXT DEFAULT 'report',
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(language, term)
);

CREATE TABLE IF NOT EXISTS dialect_patterns (
  id SERIAL PRIMARY KEY,
  language TEXT NOT NULL,
  region TEXT NOT NULL,
  pattern TEXT NOT NULL,
  english_translation TEXT,
  frequency INTEGER DEFAULT 1,
  confidence DOUBLE PRECISION DEFAULT 0.5,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(language, region, pattern)
);

CREATE TABLE IF NOT EXISTS accent_profiles (
  id SERIAL PRIMARY KEY,
  language TEXT NOT NULL,
  speaker_id INTEGER,
  phonetic_pattern TEXT,
  accuracy_score DOUBLE PRECISION DEFAULT 0.5,
  recordings_count INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS translation_feedback (
  id SERIAL PRIMARY KEY,
  original_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  feedback_score INTEGER DEFAULT 0,
  corrected_translation TEXT,
  user_id INTEGER,
  reviewed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- OFFLINE MESSAGE QUEUE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS offline_queue (
  id SERIAL PRIMARY KEY,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION TRACKING
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- OTP SYSTEM
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  otp TEXT NOT NULL,
  purpose TEXT DEFAULT 'registration',
  expires_at TIMESTAMPTZ NOT NULL,
  used INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_attempt_log (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address TEXT,
  success INTEGER DEFAULT 0,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_delivery_log (
  id SERIAL PRIMARY KEY,
  email TEXT,
  phone TEXT,
  channel TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT DEFAULT 'sent',
  provider_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- CITIZEN REPORTING
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS citizen_reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  reporter_name TEXT NOT NULL,
  reporter_phone TEXT,
  reporter_email TEXT,
  incident_type TEXT NOT NULL,
  description TEXT NOT NULL,
  district TEXT NOT NULL,
  sub_county TEXT,
  village TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  severity TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  channel TEXT NOT NULL DEFAULT 'app',
  water_impact TEXT,
  affected_population INTEGER DEFAULT 0,
  is_anonymous INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_media (
  id SERIAL PRIMARY KEY,
  report_id INTEGER REFERENCES citizen_reports(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  file_path TEXT,
  file_data TEXT,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incident_analysis (
  id SERIAL PRIMARY KEY,
  report_id INTEGER REFERENCES citizen_reports(id) ON DELETE CASCADE,
  ai_severity TEXT,
  ai_category TEXT,
  ai_urgency TEXT DEFAULT 'medium',
  ai_risk_score DOUBLE PRECISION DEFAULT 0,
  extracted_location TEXT,
  ai_summary TEXT,
  is_duplicate INTEGER DEFAULT 0,
  duplicate_of_id INTEGER,
  is_false_report INTEGER DEFAULT 0,
  confidence_score DOUBLE PRECISION DEFAULT 0,
  speech_to_text TEXT,
  image_analysis TEXT,
  response_recommendation TEXT,
  analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_assignments (
  id SERIAL PRIMARY KEY,
  report_id INTEGER REFERENCES citizen_reports(id) ON DELETE SET NULL,
  incident_id INTEGER REFERENCES env_incidents(id) ON DELETE SET NULL,
  assigned_to INTEGER REFERENCES users(id),
  assigned_by INTEGER REFERENCES users(id),
  task_type TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'assigned',
  department TEXT,
  due_by TIMESTAMPTZ,
  description TEXT,
  location TEXT,
  district TEXT,
  sub_county TEXT,
  village TEXT,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS response_tickets (
  id SERIAL PRIMARY KEY,
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
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  response_deadline TIMESTAMPTZ,
  resolution_notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════════
-- AI SYSTEM
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_conversations (
  id SERIAL PRIMARY KEY,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id SERIAL PRIMARY KEY,
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_analytics_cache (
  id SERIAL PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  data TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_decision_log (
  id SERIAL PRIMARY KEY,
  decision_type TEXT NOT NULL,
  input_data TEXT,
  output_data TEXT,
  confidence_score DOUBLE PRECISION,
  user_id INTEGER REFERENCES users(id),
  role TEXT,
  district TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_log (
  id SERIAL PRIMARY KEY,
  recipient_type TEXT NOT NULL,
  recipient_id INTEGER,
  recipient_contact TEXT,
  channel TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  reference_type TEXT,
  reference_id INTEGER,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════════
-- CITIZEN ENGAGEMENT
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS citizen_report_tracking (
  id SERIAL PRIMARY KEY,
  report_id INTEGER REFERENCES citizen_reports(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS citizen_discussions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  like_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  pinned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS citizen_replies (
  id SERIAL PRIMARY KEY,
  discussion_id INTEGER REFERENCES citizen_discussions(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discussion_likes (
  discussion_id INTEGER REFERENCES citizen_discussions(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (discussion_id, user_id)
);

CREATE TABLE IF NOT EXISTS volunteer_events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  district TEXT,
  event_date TIMESTAMPTZ,
  event_time TEXT,
  event_type TEXT DEFAULT 'cleanup',
  max_volunteers INTEGER DEFAULT 50,
  created_by INTEGER REFERENCES users(id),
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_registrations (
  event_id INTEGER REFERENCES volunteer_events(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS citizen_observations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  author_name TEXT NOT NULL,
  observation_type TEXT NOT NULL,
  district TEXT,
  location TEXT,
  description TEXT NOT NULL,
  value DOUBLE PRECISION,
  unit TEXT,
  photo_base64 TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  verified INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_district ON users(district);
CREATE INDEX IF NOT EXISTS idx_wp_district ON water_points(district);
CREATE INDEX IF NOT EXISTS idx_wp_status ON water_points(status);
CREATE INDEX IF NOT EXISTS idx_wp_type ON water_points(type);
CREATE INDEX IF NOT EXISTS idx_sensors_water_point ON sensors(water_point_id);
CREATE INDEX IF NOT EXISTS idx_sensors_status ON sensors(status);
CREATE INDEX IF NOT EXISTS idx_sr_sensor ON sensor_readings(sensor_id);
CREATE INDEX IF NOT EXISTS idx_sr_water_point ON sensor_readings(water_point_id);
CREATE INDEX IF NOT EXISTS idx_sr_time ON sensor_readings(timestamp);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_water_point ON alerts(water_point_id);
CREATE INDEX IF NOT EXISTS idx_mr_status ON maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_mr_water_point ON maintenance_requests(water_point_id);
CREATE INDEX IF NOT EXISTS idx_cr_district ON community_reports(district);
CREATE INDEX IF NOT EXISTS idx_cr_status ON community_reports(status);
CREATE INDEX IF NOT EXISTS idx_hi_district ON health_incidents(district);
CREATE INDEX IF NOT EXISTS idx_hi_disease ON health_incidents(disease_type);
CREATE INDEX IF NOT EXISTS idx_gwn_district ON gwn_reports(district);
CREATE INDEX IF NOT EXISTS idx_gwn_status ON gwn_reports(status);
CREATE INDEX IF NOT EXISTS idx_ei_district ON env_incidents(district);
CREATE INDEX IF NOT EXISTS idx_ei_status ON env_incidents(status);
CREATE INDEX IF NOT EXISTS idx_lc_lang ON language_corpus(language);
CREATE INDEX IF NOT EXISTS idx_dp_region ON dialect_patterns(region);
CREATE INDEX IF NOT EXISTS idx_oq_status ON offline_queue(status);
CREATE INDEX IF NOT EXISTS idx_oq_priority ON offline_queue(priority);
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email);
CREATE INDEX IF NOT EXISTS idx_notification_ref ON notification_log(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversation_user ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_message_conversation ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_citizen_report_user ON citizen_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_citizen_report_district ON citizen_reports(district);
CREATE INDEX IF NOT EXISTS idx_citizen_report_status ON citizen_reports(status);
CREATE INDEX IF NOT EXISTS idx_task_assignment_user ON task_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_task_assignment_status ON task_assignments(status);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEQUENCE RESET HELPER
-- ═══════════════════════════════════════════════════════════════════════════
-- This function safely resets all sequences after data migration.
-- Run it after importing data from SQLite.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION reset_all_sequences() RETURNS void AS $$
DECLARE
  _tbl TEXT;
  _max_id INTEGER;
BEGIN
  FOR _tbl IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'id' AND table_schema = 'public'
      AND table_name NOT IN ('discussion_likes', 'event_registrations')
    ORDER BY table_name
  LOOP
    EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM %I', _tbl) INTO _max_id;
    EXECUTE format('ALTER SEQUENCE %I RESTART WITH %s', _tbl || '_id_seq', _max_id + 1);
  END LOOP;
END;
$$ LANGUAGE plpgsql;
