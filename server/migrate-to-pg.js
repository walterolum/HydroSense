#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// HYDROSENSE — SQLite → PostgreSQL Data Migration Script
// ═══════════════════════════════════════════════════════════════════════════
// Usage: node migrate-to-pg.js
//
// This script:
// 1. Reads ALL data from the existing SQLite database
// 2. Creates the PostgreSQL schema
// 3. Transfers every table with identity-preserving INSERTs
// 4. Resets sequences to match existing max IDs
// 5. Validates data integrity after migration
// ═══════════════════════════════════════════════════════════════════════════

require('dotenv').config();
const path = require('path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

// ── Configuration ──────────────────────────────────────────────────────────
const SQLITE_PATH = process.env.DB_PATH || path.join(__dirname, 'watermonitor.db');

const PG_CONFIG = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT, 10) || 5432,
  database: process.env.PG_DATABASE || 'hydrosense',
  user: process.env.PG_USER || 'hydrosense',
  password: process.env.PG_PASSWORD || 'hydrosense',
  max: 10,
};

// ── All tables in topological order (parents before children) ──────────────
const ALL_TABLES = [
  // Core standalone tables
  { name: 'climate_readings', id: 'id' },
  { name: 'drought_index', id: 'id' },
  { name: 'flood_alerts', id: 'id' },
  { name: 'budget_records', id: 'id' },
  { name: 'resilience_scores', id: 'id' },
  { name: 'spare_parts', id: 'id' },
  { name: 'accent_profiles', id: 'id' },
  { name: 'translation_feedback', id: 'id' },
  { name: 'offline_queue', id: 'id' },
  { name: 'pollution_hotspots', id: 'id' },
  { name: 'language_corpus', id: 'id' },
  { name: 'dialect_patterns', id: 'id' },

  // Users (referenced by many tables)
  { name: 'users', id: 'id' },

  // Water infrastructure
  { name: 'water_points', id: 'id' },
  { name: 'sensors', id: 'id' },
  { name: 'sensor_readings', id: 'id' },
  { name: 'maintenance_requests', id: 'id' },
  { name: 'maintenance_funds', id: 'id' },
  { name: 'water_quality_tests', id: 'id' },
  { name: 'alerts', id: 'id' },
  { name: 'community_reports', id: 'id' },

  // Health
  { name: 'health_incidents', id: 'id' },

  // GWN / Environmental
  { name: 'gwn_reports', id: 'id' },
  { name: 'env_incidents', id: 'id' },
  { name: 'agency_assignments', id: 'id' },

  // Governance
  { name: 'governance_audit', id: 'id' },

  // OTP system
  { name: 'otp_codes', id: 'id' },
  { name: 'otp_attempt_log', id: 'id' },
  { name: 'otp_delivery_log', id: 'id' },

  // Citizen reporting
  { name: 'citizen_reports', id: 'id' },
  { name: 'report_media', id: 'id' },
  { name: 'incident_analysis', id: 'id' },
  { name: 'task_assignments', id: 'id' },
  { name: 'response_tickets', id: 'id' },
  { name: 'citizen_report_tracking', id: 'id' },

  // AI system
  { name: 'ai_conversations', id: 'id' },
  { name: 'ai_messages', id: 'id' },
  { name: 'ai_analytics_cache', id: 'id' },
  { name: 'ai_decision_log', id: 'id' },

  // Notifications
  { name: 'notification_log', id: 'id' },

  // Citizen engagement
  { name: 'citizen_discussions', id: 'id' },
  { name: 'citizen_replies', id: 'id' },
  { name: 'discussion_likes', id: null },  // composite PK
  { name: 'volunteer_events', id: 'id' },
  { name: 'event_registrations', id: null }, // composite PK
  { name: 'citizen_observations', id: 'id' },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  return min > 0 ? `${min}m ${sec % 60}s` : `${sec}s`;
}

function sanitizeValue(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'bigint') return Number(val);
  return val;
}

function sqliteTypeToPG(val) {
  if (val === null || val === undefined) return null;
  return val;
}

function log(msg) {
  console.log(`[MIGRATE] ${msg}`);
}

function warn(msg) {
  console.warn(`[MIGRATE][WARN] ${msg}`);
}

// ── Main Migration Logic ───────────────────────────────────────────────────
async function migrate() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   HYDROSENSE — SQLite → PostgreSQL Migration                ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  const startTime = Date.now();

  // Step 1: Connect to SQLite
  log(`Connecting to SQLite: ${SQLITE_PATH}`);
  let sqlite;
  try {
    sqlite = new Database(SQLITE_PATH);
    sqlite.pragma('journal_mode = WAL');
    log('SQLite connected successfully');
  } catch (err) {
    console.error('[FATAL] Cannot open SQLite database:', err.message);
    process.exit(1);
  }

  // Step 2: Connect to PostgreSQL
  log(`Connecting to PostgreSQL: ${PG_CONFIG.database}@${PG_CONFIG.host}:${PG_CONFIG.port}`);
  const pgPool = new Pool(PG_CONFIG);
  let pgClient;
  try {
    pgClient = await pgPool.connect();
    log('PostgreSQL connected successfully');
  } catch (err) {
    console.error('[FATAL] Cannot connect to PostgreSQL:', err.message);
    console.error('  Make sure PostgreSQL is running and credentials are correct.');
    process.exit(1);
  }

  // Step 3: Initialize PostgreSQL schema
  log('Initializing PostgreSQL schema...');
  const fs = require('fs');
  const schemaPath = path.join(__dirname, 'pg-init.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    try {
      await pgClient.query(schema);
      log('Schema initialized');
    } catch (err) {
      console.error('[FATAL] Schema initialization failed:', err.message);
      process.exit(1);
    }
  } else {
    warn('pg-init.sql not found — skipping schema init');
  }

  // Step 4: Disable triggers and constraints for fast import
  log('Disabling triggers and constraints for import...');
  await pgClient.query('SET session_replication_role = replica');
  await pgClient.query('SET CONSTRAINTS ALL DEFERRED');

  // Step 5: Count rows in SQLite for progress tracking
  let totalRows = 0;
  const rowCounts = {};
  for (const tbl of ALL_TABLES) {
    try {
      const row = sqlite.prepare(`SELECT COUNT(*) as c FROM ${tbl.name}`).get();
      rowCounts[tbl.name] = row.c;
      totalRows += row.c;
    } catch {
      rowCounts[tbl.name] = 0;
    }
  }
  log(`Total rows to migrate: ${totalRows}`);
  if (totalRows === 0) {
    log('No data to migrate. Database is empty.');
  }

  // Step 6: Truncate all tables in PostgreSQL (reverse order)
  log('Truncating existing PostgreSQL data...');
  for (let i = ALL_TABLES.length - 1; i >= 0; i--) {
    try {
      await pgClient.query(`TRUNCATE TABLE "${ALL_TABLES[i].name}" CASCADE`);
    } catch (err) {
      warn(`Could not truncate ${ALL_TABLES[i].name}: ${err.message.slice(0, 100)}`);
    }
  }

  // Step 7: Migrate each table
  let migrated = 0;
  let errors = 0;

  for (const tbl of ALL_TABLES) {
    const tableName = tbl.name;
    const count = rowCounts[tableName] || 0;
    if (count === 0) {
      log(`${' '.repeat(30 - tableName.length)}${tableName}: 0 rows (empty)`);
      continue;
    }

    try {
      // Read all data from SQLite
      const rows = sqlite.prepare(`SELECT * FROM "${tableName}"`).all();
      if (rows.length === 0) continue;

      // Get column names from the first row
      const columns = Object.keys(rows[0]);
      const colList = columns.map((c) => `"${c}"`).join(', ');
      const paramList = columns.map((_, i) => `$${i + 1}`).join(', ');
      const insertSQL = `INSERT INTO "${tableName}" (${colList}) VALUES (${paramList})`;

      // Batch insert all rows
      const batchSize = 500;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        for (const row of batch) {
          const values = columns.map((c) => sanitizeValue(row[c]));
          try {
            await pgClient.query(insertSQL, values);
            migrated++;
          } catch (err) {
            errors++;
            warn(`Error inserting into ${tableName} (id=${row.id || 'unknown'}): ${err.message.slice(0, 150)}`);
          }
        }
      }

      // Progress
      const pct = totalRows > 0 ? Math.round((migrated / totalRows) * 100) : 0;
      log(`${' '.repeat(30 - tableName.length)}${tableName}: ${rows.length} rows migrated (${pct}%)`);
    } catch (err) {
      errors++;
      warn(`Error migrating table ${tableName}: ${err.message.slice(0, 200)}`);
    }
  }

  // Step 8: Reset sequences
  log('Resetting PostgreSQL sequences...');
  try {
    await pgClient.query(`
      DO $$DECLARE
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
      END$$;
    `);
    log('All sequences reset');
  } catch (err) {
    warn(`Error resetting sequences: ${err.message.slice(0, 200)}`);
  }

  // Step 9: Re-enable triggers and constraints
  log('Re-enabling triggers and constraints...');
  await pgClient.query('SET session_replication_role = DEFAULT');
  await pgClient.query('SET CONSTRAINTS ALL IMMEDIATE');

  // Step 10: Run PostgreSQL migrations (admin bootstrap, etc.)
  try {
    const { runMigrations } = require('./db');
    await runMigrations();
    log('PostgreSQL runMigrations completed');
  } catch (err) {
    warn(`runMigrations error: ${err.message.slice(0, 200)}`);
  }

  // Step 11: Validation
  log('Validating data integrity...');
  let valid = 0;
  let invalid = 0;
  for (const tbl of ALL_TABLES) {
    try {
      const sqliteCount = sqlite.prepare(`SELECT COUNT(*) as c FROM "${tbl.name}"`).get().c;
      const pgResult = await pgClient.query(`SELECT COUNT(*) as c FROM "${tbl.name}"`);
      const pgCount = parseInt(pgResult.rows[0].c, 10);
      if (sqliteCount === pgCount) {
        valid++;
      } else {
        invalid++;
        warn(`${tbl.name}: SQLite has ${sqliteCount}, PostgreSQL has ${pgCount} — MISMATCH`);
      }
    } catch {
      // table might not exist in one side
    }
  }

  // Cleanup
  pgClient.release();
  await pgPool.end();
  sqlite.close();

  const elapsed = formatDuration(Date.now() - startTime);

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   MIGRATION COMPLETE                                        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Duration:     ${elapsed}`);
  console.log(`  Rows migrated: ${migrated}`);
  console.log(`  Errors:       ${errors}`);
  console.log(`  Valid tables:  ${valid}`);
  console.log(`  Mismatches:    ${invalid}`);
  console.log('');
  console.log('  Next steps:');
  console.log('    1. Set PG_* environment variables in .env');
  console.log('    2. Restart the server: npm start');
  console.log('    3. Verify APIs work with the new database');
  console.log('');
  console.log('  Rollback:');
  console.log('    - Restore PG_* env vars to SQLite DB_PATH');
  console.log('    - Restart the server');
  console.log('    - The original SQLite database is untouched');
  console.log('');

  if (invalid > 0) {
    console.warn(`  ⚠ ${invalid} table(s) have row count mismatches. Investigate before production use.`);
    process.exit(1);
  }
}

migrate().catch((err) => {
  console.error('[MIGRATE][FATAL]', err);
  process.exit(1);
});
