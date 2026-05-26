/**
 * HYDROSENSE — PostgreSQL → SQLite Rollback Script
 * 
 * Reverses the migration: exports data from PostgreSQL back to SQLite.
 * Use if PostgreSQL migration has issues and you need to return to SQLite.
 * 
 * Usage:
 *   node migrate-to-pg-rollback.js
 * 
 * Requirements:
 *   - PostgreSQL must be running with migrated data
 *   - Original SQLite schema structure (empty or old watermonitor.db)
 *   - better-sqlite3 and pg npm packages installed
 */

require('dotenv').config();
const { Pool } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ── Configuration ──────────────────────────────────────────────────────────
const PG_CONFIG = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT, 10) || 5432,
  database: process.env.PG_DATABASE || 'hydrosense',
  user: process.env.PG_USER || 'hydrosense',
  password: process.env.PG_PASSWORD || 'hydrosense',
};

const SQLITE_PATH = process.env.SQLITE_BACKUP_PATH || path.join(__dirname, 'watermonitor-rollback.db');

// Tables to migrate (order matters for foreign key constraints)
const TABLES = [
  { name: 'users',                pk: 'id' },
  { name: 'water_points',         pk: 'id' },
  { name: 'sensors',              pk: 'id' },
  { name: 'maintenance_requests', pk: 'id' },
  { name: 'maintenance_assignments', pk: 'id' },
  { name: 'water_quality_tests',  pk: 'id' },
  { name: 'quality_trend_data',   pk: 'id' },
  { name: 'alerts',               pk: 'id' },
  { name: 'alert_acknowledgments', pk: 'id' },
  { name: 'alert_districts',      pk: 'id' },
  { name: 'alert_responses',      pk: 'id' },
  { name: 'citizen_reports',      pk: 'id' },
  { name: 'report_follow_ups',    pk: 'id' },
  { name: 'report_media',         pk: 'id' },
  { name: 'health_incidents',     pk: 'id' },
  { name: 'health_incident_tasks', pk: 'id' },
  { name: 'disease_surveillance', pk: 'id' },
  { name: 'sensor_readings',      pk: 'id' },
  { name: 'climate_readings',     pk: 'id' },
  { name: 'drought_index',        pk: 'id' },
  { name: 'chps',                 pk: 'id' },
  { name: 'chp_deployments',      pk: 'id' },
  { name: 'budget_allocations',   pk: 'id' },
  { name: 'budget_expenditures',  pk: 'id' },
  { name: 'procurement_items',    pk: 'id' },
  { name: 'procurement_orders',   pk: 'id' },
  { name: 'water_user_committees', pk: 'id' },
  { name: 'committee_members',    pk: 'id' },
  { name: 'ngo_partners',         pk: 'id' },
  { name: 'partner_activities',   pk: 'id' },
  { name: 'volunteer_events',     pk: 'id' },
  { name: 'volunteer_participants', pk: 'id' },
  { name: 'task_assignments',     pk: 'id' },
  { name: 'task_attachments',     pk: 'id' },
  { name: 'district_performance', pk: 'id' },
  { name: 'audit_log',            pk: 'id' },
  { name: 'notification_log',     pk: 'id' },
  { name: 'system_config',        pk: 'key' },
  { name: 'incident_analysis',    pk: 'id' },
  { name: 'ai_conversations',     pk: 'id' },
  { name: 'ai_messages',          pk: 'id' },
  { name: 'ai_decision_log',      pk: 'id' },
  { name: 'refresh_tokens',       pk: 'id' },
  { name: 'saved_reports',        pk: 'id' },
  { name: 'user_sessions',        pk: 'id' },
  { name: 'feedback',             pk: 'id' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function toSqliteType(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (val instanceof Date) return val.toISOString();
  return val;
}

function pgTypeToSqliteDDL(col) {
  const name = col.column_name;
  const pgType = col.data_type;
  const nullable = col.is_nullable === 'YES' ? '' : ' NOT NULL';
  const defaultVal = col.column_default;

  let sqliteType = 'TEXT';
  if (['integer', 'bigint', 'smallint', 'serial', 'bigserial'].some(t => pgType.toLowerCase().includes(t))) {
    sqliteType = 'INTEGER';
  } else if (['numeric', 'double', 'real', 'float', 'money'].some(t => pgType.toLowerCase().includes(t))) {
    sqliteType = 'REAL';
  } else if (['boolean'].includes(pgType.toLowerCase())) {
    sqliteType = 'INTEGER';
  } else if (['json', 'jsonb', 'text', 'character', 'uuid'].some(t => pgType.toLowerCase().includes(t))) {
    sqliteType = 'TEXT';
  } else if (['timestamp', 'date', 'time'].some(t => pgType.toLowerCase().includes(t))) {
    sqliteType = 'TEXT';
  }

  let ddl = `"${name}" ${sqliteType}${nullable}`;
  if (defaultVal && !defaultVal.includes('nextval')) {
    let d = defaultVal.replace(/::\w+/g, '').replace(/^'(.*)'$/g, '$1');
    if (d.toLowerCase() === 'now()') d = "datetime('now')";
    if (d.toLowerCase() === 'true') d = '1';
    if (d.toLowerCase() === 'false') d = '0';
    ddl += ` DEFAULT ${d}`;
  }
  return ddl;
}

// ── Main Rollback ──────────────────────────────────────────────────────────

async function rollback() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  HYDROSENSE — PostgreSQL → SQLite Rollback');
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Connect to PostgreSQL
  console.log('[1/4] Connecting to PostgreSQL...');
  const pgPool = new Pool(PG_CONFIG);
  const pgClient = await pgPool.connect();
  console.log(`       Connected to ${PG_CONFIG.database}@${PG_CONFIG.host}:${PG_CONFIG.port}`);

  // 2. Prepare SQLite database
  console.log('[2/4] Creating SQLite database...');
  if (fs.existsSync(SQLITE_PATH)) {
    const backup = SQLITE_PATH.replace('.db', '-pre-rollback.db');
    fs.copyFileSync(SQLITE_PATH, backup);
    console.log(`       Backed up existing database to ${backup}`);
    fs.unlinkSync(SQLITE_PATH);
  }

  const sqlite = new Database(SQLITE_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = OFF');
  console.log(`       Created ${SQLITE_PATH}`);

  // 3. Create tables from PG schema
  console.log('[3/4] Recreating SQLite schema...');
  try {
    for (const table of TABLES) {
      const cols = await pgClient.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table.name]);

      if (cols.rows.length === 0) {
        console.log(`       SKIP ${table.name} (not found in PG)`);
        continue;
      }

      const pk = table.name === 'system_config' ? '"key"' : '"id"';
      const colDefs = cols.rows.map(c => pgTypeToSqliteDDL(c)).join(',\n    ');
      const createSQL = `CREATE TABLE IF NOT EXISTS "${table.name}" (\n    ${colDefs},\n    PRIMARY KEY (${pk})\n)`;
      sqlite.exec(createSQL);
      console.log(`       Created ${table.name} (${cols.rows.length} columns)`);
    }
  } catch (err) {
    console.error(`       ERROR creating tables: ${err.message}`);
    throw err;
  }

  // 4. Migrate data
  console.log('[4/4] Migrating data...');
  let totalRows = 0;
  try {
    for (const table of TABLES) {
      const rows = await pgClient.query(`SELECT * FROM "${table.name}" ORDER BY "${table.pk}"`);
      if (rows.rows.length === 0) continue;

      const colNames = Object.keys(rows.rows[0]).filter(k => k !== table.pk || table.name === 'system_config');
      const placeholders = colNames.map(() => '?').join(', ');
      const colsInsert = colNames.map(c => `"${c}"`).join(', ');

      const insertSQL = `INSERT INTO "${table.name}" (${colsInsert}) VALUES (${placeholders})`;
      const stmt = sqlite.prepare(insertSQL);

      const insertMany = sqlite.transaction((data) => {
        for (const row of data) {
          const vals = colNames.map(c => toSqliteType(row[c]));
          stmt.run(...vals);
        }
      });

      insertMany(rows.rows);
      totalRows += rows.rows.length;
      console.log(`       ${String(rows.rows.length).padStart(6)} rows → ${table.name}`);
    }
  } catch (err) {
    console.error(`       ERROR migrating data: ${err.message}`);
    sqlite.close();
    pgClient.release();
    await pgPool.end();
    process.exit(1);
  }

  sqlite.pragma('foreign_keys = ON');
  sqlite.close();
  pgClient.release();
  await pgPool.end();

  console.log(`\n✔ Rollback complete: ${totalRows} rows written to ${SQLITE_PATH}`);
  console.log('  Replace server/watermonitor.db with this file and restart.');
}

rollback().catch(err => {
  console.error('\n✘ Rollback failed:', err.message);
  process.exit(1);
});
