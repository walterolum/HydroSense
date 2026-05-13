const fs = require('fs');

let code = fs.readFileSync('db.js', 'utf8');

// The original getDb() looks like:
/*
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
*/

const oldGetDbPattern = /function getDb\(\) \{[\s\S]*?return db;\r?\n\}/;

const newGetDb = `let dbWrapper;

async function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    runMigrations();

    dbWrapper = {
      prepare: (sql) => {
        const stmt = db.prepare(sql);
        return {
          run: async (...args) => stmt.run(...args),
          get: async (...args) => stmt.get(...args),
          all: async (...args) => stmt.all(...args)
        };
      },
      exec: async (sql) => db.exec(sql),
      transaction: (fn) => async (...args) => db.transaction(fn)(...args)
    };
  }
  return dbWrapper;
}`;

code = code.replace(oldGetDbPattern, newGetDb);

fs.writeFileSync('db.js', code);
console.log('db.js async SQLite wrapper applied.');
