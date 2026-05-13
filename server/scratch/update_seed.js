const fs = require('fs');

let code = fs.readFileSync('seed.js', 'utf8');

code = code.replace(/db\.exec\(\`/g, 'await db.exec(`');
code = code.replace(/users\.forEach\(\(u\) => \{/g, 'for(const u of users) {');
code = code.replace(/insertUser\.run\(/g, 'await insertUser.run(');
code = code.replace(/WATER_POINT_NAMES\.forEach\(\(name, i\) => \{/g, 'for(let i=0; i<WATER_POINT_NAMES.length; i++) { const name = WATER_POINT_NAMES[i];');
code = code.replace(/const result = insertWP\.run\(/g, 'const result = await insertWP.run(');
code = code.replace(/wpIds\.forEach\(\(wpId, i\) => \{/g, 'for(let i=0; i<wpIds.length; i++) { const wpId = wpIds[i];');
code = code.replace(/const res = insertSensor\.run\(/g, 'const res = await insertSensor.run(');
code = code.replace(/const insertManyReadings = db\.transaction\(\(\) => \{/g, 'const insertManyReadings = async () => {');
code = code.replace(/sensorIds\.slice\(0, 30\)\.forEach\(async \(sid\) => \{/g, 'for (const sid of sensorIds.slice(0, 30)) {');
code = code.replace(/insertReading\.run\(/g, 'await insertReading.run(');
code = code.replace(/const insertManyClimate = db\.transaction\(\(\) => \{/g, 'const insertManyClimate = async () => {');
code = code.replace(/DISTRICTS\.forEach\(\(dist\) => \{/g, 'for (const dist of DISTRICTS) {');
code = code.replace(/insertClimate\.run\(/g, 'await insertClimate.run(');
code = code.replace(/droughtData\.forEach\(\(d\) => insertDrought\.run\(/g, 'for (const d of droughtData) await insertDrought.run(');
code = code.replace(/floodData\.forEach\(\(f\) => insertFlood\.run\(/g, 'for (const f of floodData) await insertFlood.run(');
code = code.replace(/const insertManyQuality = db\.transaction\(\(\) => \{/g, 'const insertManyQuality = async () => {');
code = code.replace(/insertQuality\.run\(/g, 'await insertQuality.run(');
code = code.replace(/insertMaint\.run\(/g, 'await insertMaint.run(');
code = code.replace(/alertsData\.forEach\(\(a, i\) => \{/g, 'for(let i=0; i<alertsData.length; i++) { const a = alertsData[i];');
code = code.replace(/insertAlert\.run\(/g, 'await insertAlert.run(');
code = code.replace(/insertReport\.run\(/g, 'await insertReport.run(');
code = code.replace(/healthData\.forEach\(\(h, i\) => \{/g, 'for(let i=0; i<healthData.length; i++) { const h = healthData[i];');
code = code.replace(/insertHealth\.run\(/g, 'await insertHealth.run(');
code = code.replace(/budgetData\.forEach\(\(b\) => \{/g, 'for(const b of budgetData) {');
code = code.replace(/insertBudget\.run\(/g, 'await insertBudget.run(');
code = code.replace(/insertFund\.run\(/g, 'await insertFund.run(');
code = code.replace(/resilienceData\.forEach\(\(r\) => \{/g, 'for(const r of resilienceData) {');
code = code.replace(/insertResilience\.run\(/g, 'await insertResilience.run(');
code = code.replace(/partsData\.forEach\(\(p\) => insertParts\.run\(/g, 'for(const p of partsData) await insertParts.run(');
code = code.replace(/auditActions\.forEach\(\(\[uid, action, entity, eid, details\], i\) => \{/g, 'for(let i=0; i<auditActions.length; i++) { const [uid, action, entity, eid, details] = auditActions[i];');
code = code.replace(/insertAudit\.run\(/g, 'await insertAudit.run(');
code = code.replace(/reportSeed\.forEach\(\(r\) => insReport\.run\(\.\.\.r\)\);/g, 'for(const r of reportSeed) await insReport.run(...r);');
code = code.replace(/insTrack\.run\(/g, 'await insTrack.run(');
code = code.replace(/insertManyReadings\(\);/g, 'await insertManyReadings();');
code = code.replace(/insertManyClimate\(\);/g, 'await insertManyClimate();');
code = code.replace(/insertManyQuality\(\);/g, 'await insertManyQuality();');

if (!code.includes('await getDb')) code = code.replace('const db = getDb();', 'const db = await getDb();');

// Wrap in async IIFE
code = code.replace("const bcrypt = require('bcryptjs');\nconst { getDb } = require('./db');", '');
code = `const bcrypt = require('bcryptjs');
const { getDb } = require('./db');

const startSeed = async () => {
${code}
};

startSeed().then(() => {
  console.log('Seed completed successfully.');
  process.exit(0);
}).catch(e => {
  console.error('Seed failed:', e);
  process.exit(1);
});
`;

fs.writeFileSync('seed.js', code);
console.log('seed.js updated');
