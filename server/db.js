require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// ── PostgreSQL Connection Configuration ──────────────────────────────────
const PG_CONFIG = {
  host: process.env.PG_HOST || 'ep-lucky-grass-aqiciugk-pooler.c-8.us-east-1.aws.neon.tech',
  port: parseInt(process.env.PG_PORT, 10) || 5432,
  database: process.env.PG_DATABASE || 'neondb',
  user: process.env.PG_USER || 'neondb_owner',
  password: process.env.PG_PASSWORD || 'npg_M21iepYOmkfd',
  max: parseInt(process.env.PG_POOL_MAX, 10) || 20,
  idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT, 10) || 30000,
  connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT, 10) || 5000,
  application_name: 'hydrosense-server',
  ssl: {
    rejectUnauthorized: false //Enforces SSL connectionto neon
  }
};

let pool;
let initialized = false;

function getPool() {
  if (!pool) {
    pool = new Pool(PG_CONFIG);
    pool.on('error', (err) => {
      console.error('[PG] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

// ── SQLite → PostgreSQL function transformers ─────────────────────────────
// These convert SQLite-specific SQL syntax to PostgreSQL equivalents
// so existing route files work without modification.

const SQLITE_FN_RE = /datetime\('now',\s*'([^']+)'\)/gi;
const SQLITE_NOW_RE = /datetime\('now'\)/gi;
const SQLITE_DATE_MOD_RE = /date\('now',\s*'([^']+)'\)/gi;
const SQLITE_DATE_NOW_RE = /date\('now'\)/gi;
const SQLITE_STRFTIME_RE = /strftime\('([^']+)',\s*(\w+)\)/gi;
const SQLITE_DATETIME_GT_RE = /datetime\((\w+)\)\s*>\s*datetime\('now'\)/gi;
const SQLITE_DATETIME_LT_RE = /datetime\((\w+)\)\s*<\s*datetime\('now'\)/gi;
const SQLITE_DATETIME_GE_RE = /datetime\((\w+)\)\s*>=\s*datetime\('now'\)/gi;
const SQLITE_DATETIME_LE_RE = /datetime\((\w+)\)\s*<=\s*datetime\('now'\)/gi;
const SQLITE_COL_NOW_RE = /datetime\('now'\)/gi;

const STRFTIME_MAP = {
  '%Y': 'YYYY',
  '%m': 'MM',
  '%d': 'DD',
  '%H': 'HH24',
  '%M': 'MI',
  '%S': 'SS',
  '%j': 'DDD',
  '%W': 'WW',
  '%w': 'D',
  '%%': '%',
};

function convertStrftimeFormat(sqliteFmt) {
  let pgFmt = sqliteFmt;
  for (const [s, p] of Object.entries(STRFTIME_MAP)) {
    pgFmt = pgFmt.replace(new RegExp(s.replace('%', '\\%'), 'g'), p);
  }
  return pgFmt;
}

function convertDateTimeModifier(modifier) {
  const trimmed = modifier.trim();
  const parts = trimmed.split(/\s+/);
  const value = parts[0];
  const unit = parts.slice(1).join(' ');
  const sign = value.startsWith('-') ? '-' : '+';
  const num = value.replace(/[+-]/, '');
  const pgUnit = unit.endsWith('s') ? unit : unit + 's';
  return `NOW() ${sign} INTERVAL '${num} ${pgUnit}'`;
}

function convertDateModifier(modifier) {
  const trimmed = modifier.trim();
  const parts = trimmed.split(/\s+/);
  const value = parts[0];
  const unit = parts.slice(1).join(' ');
  const sign = value.startsWith('-') ? '-' : '+';
  const num = value.replace(/[+-]/, '');
  const pgUnit = unit.endsWith('s') ? unit : unit + 's';
  return `(CURRENT_DATE ${sign} INTERVAL '${num} ${pgUnit}')::date`;
}

function transformPgSQL(sql) {
  let s = sql;

  // datetime(column) > datetime('now')
  s = s.replace(SQLITE_DATETIME_GE_RE, '$1 >= NOW()');
  s = s.replace(SQLITE_DATETIME_LE_RE, '$1 <= NOW()');
  s = s.replace(SQLITE_DATETIME_GT_RE, '$1 > NOW()');
  s = s.replace(SQLITE_DATETIME_LT_RE, '$1 < NOW()');

  // datetime('now', '±N unit')
  s = s.replace(SQLITE_FN_RE, (_, mod) => convertDateTimeModifier(mod));

  // datetime('now')
  s = s.replace(SQLITE_NOW_RE, 'NOW()');

  // date('now', '±N unit')
  s = s.replace(SQLITE_DATE_MOD_RE, (_, mod) => convertDateModifier(mod));

  // date('now')
  s = s.replace(SQLITE_DATE_NOW_RE, 'CURRENT_DATE');

  // strftime('%Y-%m', column) → to_char(column, 'YYYY-MM')
  s = s.replace(SQLITE_STRFTIME_RE, (_, fmt, col) => {
    return `to_char(${col}, '${convertStrftimeFormat(fmt)}')`;
  });

  return s;
}

// ── Parameter style: ? → $1, $2, $3 ... ─────────────────────────────────
function transformParams(sql) {
  let idx = 0;
  const transformed = sql.replace(/\?/g, () => `$${++idx}`);
  return transformed;
}

// ── Prepared Statement Wrapper ───────────────────────────────────────────
class PGStatement {
  constructor(pool, originalSql) {
    this.pool = pool;
    this.originalSql = originalSql;
    this.transformedSql = transformParams(transformPgSQL(originalSql));
  }

  async get(...params) {
    try {
      const result = await this.pool.query(this.transformedSql, params);
      return result.rows[0] || null;
    } catch (err) {
      console.error('[PG] Query error:', err.message);
      console.error('[PG] SQL:', this.transformedSql.slice(0, 500));
      console.error('[PG] Params:', JSON.stringify(params).slice(0, 200));
      throw err;
    }
  }

  async all(...params) {
    try {
      const result = await this.pool.query(this.transformedSql, params);
      return result.rows;
    } catch (err) {
      console.error('[PG] Query error:', err.message);
      console.error('[PG] SQL:', this.transformedSql.slice(0, 500));
      console.error('[PG] Params:', JSON.stringify(params).slice(0, 200));
      throw err;
    }
  }

  async run(...params) {
    try {
      const isInsert = this.originalSql.trim().toUpperCase().startsWith('INSERT');
      let sql = this.transformedSql;
      if (isInsert && !sql.toUpperCase().includes('RETURNING')) {
        sql += ' RETURNING id';
      }
      const result = await this.pool.query(sql, params);
      return {
        changes: result.rowCount,
        lastInsertRowid: result.rows[0]?.id ?? null,
      };
    } catch (err) {
      console.error('[PG] Query error:', err.message);
      console.error('[PG] SQL:', this.transformedSql.slice(0, 500));
      console.error('[PG] Params:', JSON.stringify(params).slice(0, 200));
      throw err;
    }
  }
}

// ── Database Wrapper ─────────────────────────────────────────────────────
class PGDatabase {
  constructor(pool) {
    this.pool = pool;
  }

  prepare(sql) {
    return new PGStatement(this.pool, sql);
  }

  async exec(sql) {
    try {
      const transformed = transformPgSQL(sql);
      await this.pool.query(transformed);
    } catch (err) {
      console.error('[PG] Exec error:', err.message);
      console.error('[PG] SQL:', sql.slice(0, 500));
    }
  }

  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async end() {
    await this.pool.end();
  }
}

// ── Singleton accessor ───────────────────────────────────────────────────
let db;

async function getDb() {
  if (!db) {
    const p = getPool();
    db = new PGDatabase(p);
    initialized = true;
    console.log(`[PG] Connected to ${PG_CONFIG.database}@${PG_CONFIG.host}:${PG_CONFIG.port}`);
  }
  return db;
}

// ── Schema initialization (idempotent — uses IF NOT EXISTS) ──────────────
async function initPgSchema() {
  const db = await getDb();
  const schemaPath = path.join(__dirname, 'pg-init.sql');
  if (!fs.existsSync(schemaPath)) {
    console.warn('[PG] Schema file not found at', schemaPath);
    return;
  }
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await db.exec(schema);
  console.log('[PG] Schema initialized successfully');
}

// ── Migration tracking (copies logic from runMigrations for PG) ──────────
async function runMigrations() {
  const db = await getDb();

  await db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  const isApplied = async (name) => {
    const row = await db.prepare("SELECT name FROM _migrations WHERE name = $1").get(name);
    return !!row;
  };

  const markApplied = async (name) => {
    await db.prepare("INSERT INTO _migrations (name) VALUES ($1)").run(name);
  };

  // Migration: setup_walter_admin_v1
  if (!(await isApplied('setup_walter_admin_v1'))) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('walter123', 10);
    await db.prepare(`UPDATE task_assignments SET assigned_to=NULL WHERE assigned_to IN (SELECT id FROM users WHERE role='national_admin')`).run();
    await db.prepare(`UPDATE task_assignments SET assigned_by=NULL WHERE assigned_by IN (SELECT id FROM users WHERE role='national_admin')`).run();
    await db.prepare(`UPDATE citizen_reports SET user_id=NULL WHERE user_id IN (SELECT id FROM users WHERE role='national_admin')`).run();
    await db.prepare(`UPDATE volunteer_events SET created_by=NULL WHERE created_by IN (SELECT id FROM users WHERE role='national_admin')`).run();
    await db.prepare("DELETE FROM users WHERE role = 'national_admin'").run();
    await db.prepare(`INSERT INTO users (name, email, password_hash, role, district, organization, active) VALUES ($1, $2, $3, 'national_admin', 'Kampala', 'Ministry of Water & Environment', 1)`)
      .run('Walter Olum', 'walter.olum@hydrosense.ug', hash);
    await markApplied('setup_walter_admin_v1');
    console.log('[MIGRATION] setup_walter_admin_v1: Walter Olum set as national admin.');
  }

  // Migration: ensure_walter_v2
  if (!(await isApplied('ensure_walter_v2'))) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('walter123', 10);
    const existing = await db.prepare("SELECT id FROM users WHERE email = $1").get('walter.olum@hydrosense.ug');
    if (existing) {
      await db.prepare(`UPDATE users SET name='Walter Olum', password_hash=$1, role='national_admin', organization='Ministry of Water & Environment', active=1 WHERE email=$2`)
        .run(hash, 'walter.olum@hydrosense.ug');
    } else {
      await db.prepare("DELETE FROM users WHERE role = 'national_admin'").run();
      await db.prepare(`INSERT INTO users (name, email, password_hash, role, district, organization, active) VALUES ('Walter Olum', $1, $2, 'national_admin', 'Kampala', 'Ministry of Water & Environment', 1)`)
        .run('walter.olum@hydrosense.ug', hash);
    }
    await markApplied('ensure_walter_v2');
    console.log('[MIGRATION] ensure_walter_v2: Walter Olum credentials verified/reset.');
  }

  // Migration: remove_demo_users_v1
  if (!(await isApplied('remove_demo_users_v1'))) {
    await db.prepare("DELETE FROM users WHERE role != 'national_admin'").run();
    await markApplied('remove_demo_users_v1');
    console.log('[MIGRATION] remove_demo_users_v1: all non-admin demo accounts deleted.');
  }

  // Migration: remove_demo_users_v2
  if (!(await isApplied('remove_demo_users_v2'))) {
    const demoEmails = [
      'admin@mwe.go.ug', 'officer@gulu.go.ug', 'committee@arua.ug',
      'john@citizen.ug', 'sarah@actionaid.org', 'tech@maintenance.ug',
      'health@moh.go.ug', 'climate@nema.go.ug', 'officer@lira.go.ug',
      'officer@moroto.go.ug', 'admin@hydrosense.ug',
    ];
    for (const email of demoEmails) {
      await db.prepare("DELETE FROM users WHERE email = $1").run(email);
    }
    await markApplied('remove_demo_users_v2');
    console.log('[MIGRATION] remove_demo_users_v2: all hardcoded demo accounts deleted.');
  }

  // Bootstrap admin
  const adminCount = await db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'national_admin' AND active = 1").get();
  if (!adminCount || adminCount.c === 0) {
    const bcrypt = require('bcryptjs');
    const adminEmail = (process.env.ADMIN_EMAIL || 'walter.olum@hydrosense.ug').toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || 'walter123';
    const adminName = process.env.ADMIN_NAME || 'Walter Olum';
    const hash = bcrypt.hashSync(adminPassword, 10);
    await db.prepare(`INSERT INTO users (name, email, password_hash, role, district, organization, active) VALUES ($1, $2, $3, 'national_admin', 'Kampala', 'Ministry of Water & Environment', 1) ON CONFLICT (email) DO NOTHING`)
      .run(adminName, adminEmail, hash);
    console.log(`[BOOTSTRAP] Admin created: ${adminEmail}`);
  }
}

// ── Health check ─────────────────────────────────────────────────────────
async function healthCheck() {
  try {
    const p = getPool();
    await p.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

module.exports = { getDb, initPgSchema, runMigrations, healthCheck, PG_CONFIG };
