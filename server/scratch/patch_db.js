const fs = require('fs');
let code = fs.readFileSync('db.js', 'utf8');

const oldGetDbPattern = /function getDb\(\) \{[\s\S]*?return db;\r?\n\}/;

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

code = code.replace(oldGetDbPattern, newGetDb);
fs.writeFileSync('db.js', code);
console.log('getDb replaced');
