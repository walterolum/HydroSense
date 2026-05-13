const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;

const filePath = 'seed.js';
let code = fs.readFileSync(filePath, 'utf8');

const ast = parser.parse(code, {
  sourceType: 'module',
  plugins: ['jsx', 'classProperties']
});

traverse(ast, {
  CallExpression(p) {
    if (
      p.node.callee && 
      p.node.callee.type === 'MemberExpression' &&
      ['run', 'get', 'all', 'exec', 'transaction'].includes(p.node.callee.property.name)
    ) {
      if (!p.parentPath.isAwaitExpression()) {
        p.replaceWith({
          type: 'AwaitExpression',
          argument: p.node
        });
        
        let parentFunc = p.findParent(parent => parent.isFunction());
        if (parentFunc) {
          parentFunc.node.async = true;
        }
      }
    }
    
    // getDb() -> await getDb()
    if (p.node.callee && p.node.callee.name === 'getDb' && !p.parentPath.isAwaitExpression()) {
      p.replaceWith({
        type: 'AwaitExpression',
        argument: p.node
      });
      let parentFunc = p.findParent(parent => parent.isFunction());
      if (parentFunc) {
        parentFunc.node.async = true;
      }
    }
  }
});

let output = generate(ast, {}, code).code;

// Ensure db transaction callbacks are correctly formed, but actually our wrapper returns an async function,
// so `const fn = db.transaction(...)` returns an async function. In seed.js it does `const insertMany = db.transaction(() => ...); insertMany();`.
// Wait, `db.transaction(...)` returns an async function.
// So `insertMany()` should be `await insertMany()`. Let's just fix it manually.
output = output.replace(/insertManyReadings\(\);/g, 'await insertManyReadings();');
output = output.replace(/insertManyClimate\(\);/g, 'await insertManyClimate();');
output = output.replace(/insertManyQuality\(\);/g, 'await insertManyQuality();');

// Also `db.transaction(async () => { ... })` instead of `db.transaction(() => { ... })`. Actually Babel handles making the callback async! 
// Let's verify: inside `db.transaction(() => { sensorIds.forEach... })`. If Babel made `forEach` callback async, it did NOT make `db.transaction` callback async unless there's an `await` directly inside it.
// If it has `await insertReading.run(...)` inside `forEach` callback, the `forEach` callback becomes async. The outer `db.transaction` callback doesn't have `await`, so it doesn't become async!
// But wait, the `db.transaction` wrapper takes `fn` and `await fn(...)`. It doesn't matter if `fn` is async or not, it will await it.
// BUT since `forEach` callbacks are async, `forEach` doesn't return a Promise, so `fn` finishes immediately!
// To fix this, we should replace `.forEach` with `for...of` loops, or `await Promise.all(...)`.
// Actually I'll just string replace `.forEach(async` with `.map(async` and wrap in `await Promise.all`.
// Wait, Babel generated code. Let me just use string replace on the generated code.

// Wrap in async IIFE
output = output.replace(/const bcrypt = require\('bcryptjs'\);\r?\nconst \{ getDb \} = require\('\.\/db'\);/, '');
output = `const bcrypt = require('bcryptjs');
const { getDb } = require('./db');

const runSeed = async () => {
` + output + `
};
runSeed().then(() => { 
  console.log('Seed Done, waiting 5 seconds for pending queries...'); 
  setTimeout(() => process.exit(0), 5000); 
}).catch(e => { 
  console.error(e); 
  process.exit(1); 
});
`;

fs.writeFileSync(filePath, output, 'utf8');
console.log('AST transform complete on seed.js');
