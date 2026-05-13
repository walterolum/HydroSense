const fs = require('fs');

let code = fs.readFileSync('seed.js', 'utf8');

// Wrap everything after requires in an async IIFE
code = code.replace("const bcrypt = require('bcryptjs');\nconst { getDb } = require('./db');", '');
code = `const bcrypt = require('bcryptjs');\nconst { getDb } = require('./db');\n\nconst runSeed = async () => {\n` + code + `\n};\nrunSeed().then(() => { console.log('Done'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });`;

code = code.replace('const db = getDb();', 'const db = await getDb();');
if (!code.includes('await getDb()')) code = code.replace('const db = await getDb();', 'const db = await getDb();');

// Convert forEach to map and Promise.all to safely await
// Actually, let's just make forEach callbacks async and add await to run/get/exec
code = code.replace(/\.forEach\(\(/g, '.forEach(async (');
code = code.replace(/\.forEach\(async \(async \(/g, '.forEach(async (');

code = code.replace(/db\.exec\(/g, 'await db.exec(');
code = code.replace(/\.run\(/g, '.run('); // Just to find them
code = code.replace(/insertUser\.run\(/g, 'await insertUser.run(');
code = code.replace(/insertWP\.run\(/g, 'await insertWP.run(');
code = code.replace(/insertSensor\.run\(/g, 'await insertSensor.run(');
code = code.replace(/insertReading\.run\(/g, 'await insertReading.run(');
code = code.replace(/insertClimate\.run\(/g, 'await insertClimate.run(');
code = code.replace(/insertDrought\.run\(/g, 'await insertDrought.run(');
code = code.replace(/insertFlood\.run\(/g, 'await insertFlood.run(');
code = code.replace(/insertQuality\.run\(/g, 'await insertQuality.run(');
code = code.replace(/insertMaint\.run\(/g, 'await insertMaint.run(');
code = code.replace(/insertAlert\.run\(/g, 'await insertAlert.run(');
code = code.replace(/insertReport\.run\(/g, 'await insertReport.run(');
code = code.replace(/insertHealth\.run\(/g, 'await insertHealth.run(');
code = code.replace(/insertBudget\.run\(/g, 'await insertBudget.run(');
code = code.replace(/insertFund\.run\(/g, 'await insertFund.run(');
code = code.replace(/insertResilience\.run\(/g, 'await insertResilience.run(');
code = code.replace(/insertParts\.run\(/g, 'await insertParts.run(');
code = code.replace(/insertAudit\.run\(/g, 'await insertAudit.run(');
code = code.replace(/insTrack\.run\(/g, 'await insTrack.run(');
code = code.replace(/insReport\.run\(/g, 'await insReport.run(');

code = code.replace(/await db\.prepare\('SELECT \* FROM sensors WHERE id = \?'\)\.get\(sid\)/g, "await (await db.prepare('SELECT * FROM sensors WHERE id = ?')).get(sid)");

// Fix db.transaction. In our wrapper it returns an async fn.
code = code.replace(/db\.transaction\(\(\) => \{/g, 'db.transaction(async () => {');

// Fix `citizenReports = (await db.prepare...get()).c;` 
// In dbWrapper, prepare returns an object, so we await prepare() then await get()
code = code.replace(/const citizenReports = \(await db\.prepare\('SELECT COUNT\(\*\) as c FROM citizen_reports'\)\.get\(\)\)\.c;/g, 
  "const citizenReports = (await (await db.prepare('SELECT COUNT(*) as c FROM citizen_reports')).get()).c;");

// Update any remaining db.prepare(...).get()
code = code.replace(/await db\.prepare/g, "await db.prepare"); 

// Fix the single line forEach like `droughtData.forEach((d) => insertDrought.run(...))`
// It becomes `.forEach(async (d) => await insertDrought.run(...))`
code = code.replace(/=> await insert/g, '=> await insert');

fs.writeFileSync('seed.js', code);
console.log('seed.js updated');
