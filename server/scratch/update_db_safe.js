const fs = require('fs');
let code = fs.readFileSync('db.js', 'utf8');

// Replace imports and db
code = code.replace(/const Database = require\('better-sqlite3'\);\r?\nconst path = require\('path'\);\r?\n\r?\nconst DB_PATH = path\.join\(__dirname, 'watermonitor\.db'\);\r?\nlet db;/,
  "const mysql = require('mysql2/promise');\nrequire('dotenv').config();\n\nlet pool;\nlet dbWrapper;"
);

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
    exec: async (sql) => {
      await pool.query(sql);
    },
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
             if (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_CANT_DROP_FIELD_OR_KEY') return { changes: 0 };
             throw e;
          }
        }
      };
    },
    transaction: (fn) => async (...args) => {
      return await fn(...args);
    }
  };
}`;

code = code.replace(oldGetDb, newGetDb);

// Migrations and initSchema
code = code.replace('function runMigrations() {', 'async function runMigrations() {');
code = code.replace('const add = sql => { try { db.exec(sql); } catch {} };', "const add = async sql => { try { await pool.query(sql); } catch(e) { if(e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && !e.message.includes('Duplicate')) console.error(e.message); } };");

code = code.replace('function initSchema() {', 'async function initSchema() {');

// Replace add(` with await add(` globally
code = code.replace(/add\(`/g, 'await add(`');

// MySQL Schema Adjustments
code = code.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'INT AUTO_INCREMENT PRIMARY KEY');
code = code.replace(/TEXT DEFAULT/g, 'VARCHAR(255) DEFAULT');
code = code.replace(/TEXT UNIQUE/g, 'VARCHAR(255) UNIQUE');
code = code.replace(/datetime\('now'\)/g, 'CURRENT_TIMESTAMP');
code = code.replace(/datetime\('now', '-2 hours'\)/g, 'DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 2 HOUR)');

// Update Seed logic in db.js
code = code.replace(/const gwn = db\.prepare/g, 'const gwn = await dbWrapper.prepare');
code = code.replace(/const ins = db\.prepare/g, 'const ins = dbWrapper.prepare');
code = code.replace(/const iins = db\.prepare/g, 'const iins = dbWrapper.prepare');
code = code.replace(/const hins = db\.prepare/g, 'const hins = dbWrapper.prepare');

code = code.replace(/\]\.forEach\(r => ins\.run\(\.\.\.r\)\);/g, ']; for(const r of arr1) await ins.run(...r);');
code = code.replace(/\]\.forEach\(r => iins\.run\(\.\.\.r\)\);/g, ']; for(const r of arr2) await iins.run(...r);');
code = code.replace(/\]\.forEach\(h => hins\.run\(\.\.\.h\)\);/g, ']; for(const h of arr3) await hins.run(...h);');

code = code.replace(/    \[\n      \['Okello/, '    const arr1 = [\n      [\'Okello');
code = code.replace(/    \[\n      \['industrial_discharge/, '    const arr2 = [\n      [\'industrial_discharge');
code = code.replace(/    \[\n      \['Kampala-Jinja/, '    const arr3 = [\n      [\'Kampala-Jinja');

fs.writeFileSync('db.js', code);
console.log('db.js rewritten.');
