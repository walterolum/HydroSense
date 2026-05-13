const fs = require('fs');
let code = fs.readFileSync('seed.js', 'utf8');
code = code.replace(/await (\w+)\.run\(([^;]*)\);\r?\n\}\);/g, 'await $1.run($2);\n}');
code = code.replace(/await (\w+)\.run\(([^;]*)\);\r?\n  \}\r?\n\}\);/g, 'await $1.run($2);\n  }\n}');
fs.writeFileSync('seed.js', code);
console.log('Fixed loop terminators');
