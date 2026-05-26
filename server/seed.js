// ═══════════════════════════════════════════════════════════════════════════
// HYDROSENSE — PostgreSQL Database Seeder
// ═══════════════════════════════════════════════════════════════════════════
// Usage: node seed.js
// Clears all data and creates the initial admin account.
// ═══════════════════════════════════════════════════════════════════════════

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getDb } = require('./db');

async function main() {
  const db = await getDb();

  console.log('Initialising database...');

  // Clear everything (safe order for FK constraints)
  const tables = [
    'citizen_report_tracking', 'report_media', 'incident_analysis',
    'task_assignments', 'response_tickets', 'otp_attempt_log',
    'otp_delivery_log', 'otp_codes', 'citizen_reports', 'resilience_scores',
    'maintenance_funds', 'budget_records', 'governance_audit',
    'health_incidents', 'community_reports', 'alerts', 'water_quality_tests',
    'flood_alerts', 'drought_index', 'climate_readings',
    'maintenance_requests', 'sensor_readings', 'sensors', 'spare_parts',
    'water_points', 'gwn_reports', 'env_incidents', 'pollution_hotspots',
    'agency_assignments', 'citizen_discussions', 'citizen_replies',
    'discussion_likes', 'volunteer_events', 'event_registrations',
    'citizen_observations', 'notification_log', 'ai_conversations',
    'ai_messages', 'ai_decision_log', 'ai_analytics_cache',
    'language_corpus', 'dialect_patterns', 'accent_profiles',
    'translation_feedback', 'offline_queue', 'users',
  ];

  for (const table of tables) {
    try {
      await db.prepare(`DELETE FROM ${table}`).run();
    } catch (err) {
      console.warn(`  Could not clear ${table}: ${err.message}`);
    }
  }

  // Create the national admin account
  const adminEmail = process.env.ADMIN_EMAIL || 'walter.olum@hydrosense.ug';
  const adminPassword = process.env.ADMIN_PASSWORD || 'walter123';
  const adminName = process.env.ADMIN_NAME || 'Walter Olum';
  const hash = bcrypt.hashSync(adminPassword, 10);

  const result = await db.prepare(`
    INSERT INTO users (name, email, password_hash, role, district, organization, active)
    VALUES ($1, $2, $3, 'national_admin', 'Kampala', 'Ministry of Water & Environment', 1)
  `).run(adminName, adminEmail.toLowerCase(), hash);

  console.log('\n✅ Database initialised with admin account only.');
  console.log('─────────────────────────────────────────────');
  console.log(`  Name    : ${adminName}`);
  console.log(`  Email   : ${adminEmail.toLowerCase()}`);
  console.log(`  Password: ${adminPassword}`);
  console.log('─────────────────────────────────────────────');
  console.log('All other users must be created by the admin.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
