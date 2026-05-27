require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// ── PostgreSQL Connection Configuration ──────────────────────────────────
// ALL database credentials MUST come from environment variables for security.
// Copy .env.example to .env and fill in your values — never commit secrets.
if (!process.env.PG_PASSWORD) {
  console.error('[PG] FATAL: PG_PASSWORD environment variable is not set. Database connection will fail.');
}
const PG_CONFIG = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT, 10) || 5432,
  database: process.env.PG_DATABASE || 'hydrosense',
  user: process.env.PG_USER || 'hydrosense',
  password: process.env.PG_PASSWORD || '',
  max: parseInt(process.env.PG_POOL_MAX, 10) || 20,
  idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT, 10) || 30000,
  connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT, 10) || 5000,
  application_name: 'hydrosense-server',
  ssl: process.env.PG_SSL === '1' ? { rejectUnauthorized: false } : false
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
      throw err;
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

  // Migration: remove_demo_users_v1 — SAFEGUARDED: only deletes if no non-admin users exist yet
  if (!(await isApplied('remove_demo_users_v1'))) {
    const nonAdminCount = await db.prepare("SELECT COUNT(*) as c FROM users WHERE role != 'national_admin'").get();
    if (nonAdminCount && nonAdminCount.c > 0) {
      console.log(`[MIGRATION] Skipping remove_demo_users_v1: ${nonAdminCount.c} non-admin users already exist.`);
    } else {
      await db.prepare("DELETE FROM users WHERE role != 'national_admin'").run();
      console.log('[MIGRATION] remove_demo_users_v1: all non-admin demo accounts deleted.');
    }
    await markApplied('remove_demo_users_v1');
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

  // Bootstrap admin (only if no admin exists)
  const adminCount = await db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'national_admin' AND active = 1").get();
  if (!adminCount || adminCount.c === 0) {
    const bcrypt = require('bcryptjs');
    const adminEmail = (process.env.ADMIN_EMAIL || 'walter.olum@hydrosense.ug').toLowerCase();
    if (!process.env.ADMIN_PASSWORD) {
      console.warn('[BOOTSTRAP] Skipping admin creation — ADMIN_PASSWORD env var not set. Login will not be possible until an admin is created manually.');
      return;
    }
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_NAME || 'Walter Olum';
    const hash = bcrypt.hashSync(adminPassword, 10);
    await db.prepare(`INSERT INTO users (name, email, password_hash, role, district, organization, active) VALUES ($1, $2, $3, 'national_admin', 'Kampala', 'Ministry of Water & Environment', 1) ON CONFLICT (email) DO NOTHING`)
      .run(adminName, adminEmail, hash);
    console.log(`[BOOTSTRAP] Admin created: ${adminEmail}`);
  }

  // Migration: rotate_exposed_credentials_v1
  // Rotates all credentials that were previously hardcoded in source code
  // Uses credentials from .env if they were pre-generated, otherwise creates new ones
  if (!(await isApplied('rotate_exposed_credentials_v1'))) {
    const crypto = require('crypto');
    const bcrypt = require('bcryptjs');
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '.env');

    // Helper: read current value from .env file
    function readEnvVar(key) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
        return match ? match[1].trim() : null;
      } catch { return null; }
    }

    // 1. Rotate JWT_SECRET — use pre-set value from .env or generate new
    let newJwtSecret = readEnvVar('JWT_SECRET');
    if (!newJwtSecret) {
      newJwtSecret = crypto.randomBytes(48).toString('base64');
    }
    process.env.JWT_SECRET = newJwtSecret;
    console.log('[MIGRATION] JWT_SECRET rotated.');

    // 2. Rotate admin password in DB and env
    let newAdminPass = readEnvVar('ADMIN_PASSWORD');
    if (!newAdminPass) {
      const adminBytes = crypto.randomBytes(20);
      const adminChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^*()-_=+';
      newAdminPass = Array.from(adminBytes).map(b => adminChars[b % adminChars.length]).join('');
    }
    const adminHash = bcrypt.hashSync(newAdminPass, 10);
    const adminEmail = (process.env.ADMIN_EMAIL || 'walter.olum@hydrosense.ug').toLowerCase();
    const adminResult = await db.prepare("UPDATE users SET password_hash=$1, active=1 WHERE email=$2 AND role='national_admin'").run(adminHash, adminEmail);
    if (adminResult.changes > 0) {
      process.env.ADMIN_PASSWORD = newAdminPass;
      console.log('[MIGRATION] Admin password rotated.');
    } else {
      console.warn('[MIGRATION] Admin user not found, password not updated.');
    }

    // 3. Rotate database password
    let newPgPass = readEnvVar('PG_PASSWORD_NEW');
    if (!newPgPass) {
      const pgBytes = crypto.randomBytes(24);
      const pgChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      newPgPass = Array.from(pgBytes).map(b => pgChars[b % pgChars.length]).join('');
    }
    try {
      await db.pool.query(`ALTER USER ${PG_CONFIG.user} WITH PASSWORD '${newPgPass.replace(/'/g, "''")}'`);
      process.env.PG_PASSWORD = newPgPass;
      console.log('[MIGRATION] Database password rotated.');
    } catch (err) {
      console.warn('[MIGRATION] Could not rotate DB password (may lack permissions):', err.message);
      console.warn('[MIGRATION] You may need to rotate it manually on Neon console.');
    }

    // 4. Persist new env vars to .env file
    try {
      let envContent = fs.readFileSync(envPath, 'utf8');
      const updates = {
        JWT_SECRET: newJwtSecret,
        ADMIN_PASSWORD: newAdminPass,
        PG_PASSWORD: newPgPass,
      };
      // Remove PG_PASSWORD_NEW if present
      envContent = envContent.replace(/^PG_PASSWORD_NEW=.*$/m, '');
      for (const [key, val] of Object.entries(updates)) {
        const re = new RegExp(`^${key}=.*$`, 'm');
        if (re.test(envContent)) {
          envContent = envContent.replace(re, `${key}=${val}`);
        } else {
          envContent += `\n${key}=${val}`;
        }
      }
      fs.writeFileSync(envPath, envContent, 'utf8');
      console.log('[MIGRATION] Environment file updated with new credentials.');
    } catch (err) {
      console.warn('[MIGRATION] Could not update .env file:', err.message);
      console.warn('[MIGRATION] Manually update .env with:');
      console.warn(`  JWT_SECRET=${newJwtSecret}`);
      console.warn(`  ADMIN_PASSWORD=${newAdminPass}`);
      console.warn(`  PG_PASSWORD=${newPgPass}`);
    }

    await markApplied('rotate_exposed_credentials_v1');
    console.log('[MIGRATION] rotate_exposed_credentials_v1 complete.');
  }

  // Migration: email_verification_columns_v1
  // Adds columns for link-based email verification (replaces OTP-only verification)
  if (!(await isApplied('email_verification_columns_v1'))) {
    const columns = [
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified INTEGER DEFAULT 0',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ',
    ];
    for (const colSql of columns) {
      try {
        await db.exec(colSql);
      } catch (e) {
        console.warn(`[MIGRATION] Could not add column: ${e.message}`);
      }
    }
    await markApplied('email_verification_columns_v1');
    console.log('[MIGRATION] email_verification_columns_v1: email_verified, verification_token, verification_expires_at columns added.');
  }

  // Migration: user_behavior_log_table_v1
  if (!(await isApplied('user_behavior_log_table_v1'))) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS user_behavior_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        metadata TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    try { await db.exec('CREATE INDEX IF NOT EXISTS idx_user_behavior_log_user_id ON user_behavior_log(user_id)'); } catch {}
    try { await db.exec('CREATE INDEX IF NOT EXISTS idx_user_behavior_log_created_at ON user_behavior_log(created_at)'); } catch {}
    await markApplied('user_behavior_log_table_v1');
    console.log('[MIGRATION] user_behavior_log_table_v1: user_behavior_log table created.');
  }

  // Migration: push_subscriptions_table_v1
  if (!(await isApplied('push_subscriptions_table_v1'))) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT UNIQUE NOT NULL,
        auth TEXT,
        p256dh TEXT,
        platform TEXT DEFAULT 'web',
        device_name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await markApplied('push_subscriptions_table_v1');
    console.log('[MIGRATION] push_subscriptions_table_v1: push_subscriptions table created.');
  }

  // Migration: notification_preferences_table_v1
  if (!(await isApplied('notification_preferences_table_v1'))) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        push_enabled INTEGER DEFAULT 1,
        email_enabled INTEGER DEFAULT 0,
        sms_enabled INTEGER DEFAULT 0,
        sound_enabled INTEGER DEFAULT 1,
        sound_volume INTEGER DEFAULT 70,
        event_reminders INTEGER DEFAULT 1,
        event_start_alarm INTEGER DEFAULT 1,
        event_posted INTEGER DEFAULT 1,
        discussion_replies INTEGER DEFAULT 1,
        mentions INTEGER DEFAULT 1,
        system_alerts INTEGER DEFAULT 1,
        quiet_hours_start TIME,
        quiet_hours_end TIME,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await markApplied('notification_preferences_table_v1');
    console.log('[MIGRATION] notification_preferences_table_v1: notification_preferences table created.');
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
