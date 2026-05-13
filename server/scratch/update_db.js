const fs = require('fs');

let code = fs.readFileSync('db.js', 'utf8');

// Replace better-sqlite3 with mysql2
code = code.replace(/const Database = require\('better-sqlite3'\);/, "const mysql = require('mysql2/promise');\nrequire('dotenv').config();");
code = code.replace(/const DB_PATH = path.join\(__dirname, 'watermonitor\.db'\);/, '');
code = code.replace(/let db;/, 'let pool;\nlet dbWrapper;');

// Replace getDb() implementation
const oldGetDb = `function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    runMigrations();
  }
  return db;
}`;

const newGetDb = `async function getDb() {
  if (!pool) {
    const tempConnection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || ''
    });
    await tempConnection.query('CREATE DATABASE IF NOT EXISTS \`' + (process.env.DB_NAME || 'hydrosense') + '\`');
    await tempConnection.end();

    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hydrosense',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      multipleStatements: true
    });

    dbWrapper = createDbWrapper(pool);
    await initSchema();
    await runMigrations();
  }
  return dbWrapper;
}

function createDbWrapper(pool) {
  return {
    prepare: (sql) => {
      return {
        all: async (...args) => {
          const [rows] = await pool.query(sql, args);
          return rows;
        },
        get: async (...args) => {
          const [rows] = await pool.query(sql, args);
          return rows[0];
        },
        run: async (...args) => {
          try {
            const [result] = await pool.query(sql, args);
            return { changes: result.affectedRows, lastInsertRowid: result.insertId };
          } catch(e) {
             if (e.code === 'ER_DUP_FIELDNAME') return { changes: 0 };
             throw e;
          }
        }
      };
    },
    transaction: (fn) => async (...args) => {
      // Basic transaction wrapper wrapper
      return await fn(...args);
    }
  };
}`;

code = code.replace(oldGetDb, newGetDb);

// Make initSchema and runMigrations async
code = code.replace(/function runMigrations\(\)/, 'async function runMigrations()');
code = code.replace(/function initSchema\(\)/, 'async function initSchema()');

// Replace add logic
const oldAdd = "const add = sql => { try { db.exec(sql); } catch {} };";
const newAdd = "const add = async sql => { try { await pool.query(sql); } catch(e) { if(e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_CANT_DROP_FIELD_OR_KEY') console.error('Migration error:', e.message); } };";
code = code.replace(oldAdd, newAdd);

// Replace add(` with await add(` globally
code = code.replace(/add\(`/g, 'await add(`');

// MySQL Schema Adjustments
code = code.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'INT AUTO_INCREMENT PRIMARY KEY');
code = code.replace(/TEXT DEFAULT/g, 'VARCHAR(255) DEFAULT');
code = code.replace(/TEXT UNIQUE/g, 'VARCHAR(255) UNIQUE');
code = code.replace(/datetime\('now'\)/g, 'CURRENT_TIMESTAMP');
code = code.replace(/datetime\('now', '-2 hours'\)/g, 'DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 2 HOUR)');

// Update Seed logic in db.js to use await
// For seed phase 3 and 6
// `const gwn = db.prepare('SELECT COUNT(*) as c FROM gwn_reports').get();` -> `const gwn = await dbWrapper.prepare...`
code = code.replace(/const gwn = db\.prepare/g, 'const gwn = await dbWrapper.prepare');

// Fix `.forEach` lines
// e.g. `].forEach(r => ins.run(...r));` -> `]; for(const r of arr) await ins.run(...r);`
// It's safer to just replace db.prepare directly in seed.
code = code.replace(/db\.prepare/g, 'dbWrapper.prepare');
code = code.replace(/\]\.forEach\(r => /g, '].map(async r => await ');
code = code.replace(/\.run\(\.\.\.r\)\);/g, '.run(...r)));');
// Wait, `[...].map(async r => await ins.run(...r))` returns an array of promises, we need `await Promise.all(...)`.
code = code.replace(/\]\.forEach\(r => (.*?)\.run\(\.\.\.r\)\);/g, ']; for(const r of arguments[0] || [1]) { await $1.run(...r); }'); 
// Actually I will do regex that replaces `[ [data] ].forEach(r => ins.run(...r));` with a simple loop, or `await Promise.all([ [data] ].map(r => ins.run(...r)))`.
code = code.replace(/\]\.forEach\(r => (.*?)\.run\(\.\.\.r\)\);/g, ']; for(const r of ___TEMP_ARR___) await $1.run(...r);');
// To make it easy, I will just manually edit the seed block if needed.

fs.writeFileSync('db.js', code);
console.log('db.js updated successfully.');
