const bcrypt = require('bcryptjs');
const { getDb } = require('./db');

const db = getDb();

console.log('Initialising database...');

// Clear everything
db.exec(`
  DELETE FROM citizen_report_tracking;
  DELETE FROM report_media;
  DELETE FROM incident_analysis;
  DELETE FROM task_assignments;
  DELETE FROM response_tickets;
  DELETE FROM otp_attempt_log;
  DELETE FROM otp_delivery_log;
  DELETE FROM otp_codes;
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
  DELETE FROM gwn_reports;
  DELETE FROM env_incidents;
  DELETE FROM pollution_hotspots;
  DELETE FROM agency_assignments;
  DELETE FROM citizen_discussions;
  DELETE FROM citizen_replies;
  DELETE FROM discussion_likes;
  DELETE FROM volunteer_events;
  DELETE FROM event_registrations;
  DELETE FROM citizen_observations;
  DELETE FROM notification_log;
  DELETE FROM ai_conversations;
  DELETE FROM ai_messages;
  DELETE FROM ai_decision_log;
  DELETE FROM ai_analytics_cache;
  DELETE FROM language_corpus;
  DELETE FROM dialect_patterns;
  DELETE FROM accent_profiles;
  DELETE FROM translation_feedback;
  DELETE FROM offline_queue;
  DELETE FROM users;
  DELETE FROM sqlite_sequence;
`);

// Create the national admin account
const adminEmail    = process.env.ADMIN_EMAIL    || 'walter.olum@hydrosense.ug';
const adminPassword = process.env.ADMIN_PASSWORD || 'walter123';
const adminName     = process.env.ADMIN_NAME     || 'Walter Olum';
const hash = bcrypt.hashSync(adminPassword, 10);
db.prepare(`
  INSERT INTO users (name, email, password_hash, role, district, organization, active)
  VALUES (?, ?, ?, 'national_admin', 'Kampala', 'Ministry of Water & Environment', 1)
`).run(adminName, adminEmail, hash);

console.log('\n✅ Database initialised with admin account only.');
console.log('─────────────────────────────────────────────');
console.log(`  Name    : ${adminName}`);
console.log(`  Email   : ${adminEmail}`);
console.log(`  Password: ${adminPassword}`);
console.log('─────────────────────────────────────────────');
console.log('All other users must be created by the admin.');
