const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;

const processFile = (filePath) => {
  const code = fs.readFileSync(filePath, 'utf8');
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties']
  });

  let modified = false;

  traverse(ast, {
    CallExpression(p) {
      // getDb() -> await getDb()
      if (p.node.callee?.name === 'getDb' && !p.parentPath.isAwaitExpression()) {
        p.replaceWith({
          type: 'AwaitExpression',
          argument: p.node
        });
        modified = true;
        let parentFunc = p.findParent(parent => parent.isFunction());
        if (parentFunc) {
          parentFunc.node.async = true;
        }
      }

      // db.prepare(...).all/get/run() -> await db.prepare(...).all/get/run()
      if (
        p.node.callee?.type === 'MemberExpression' &&
        ['all', 'get', 'run'].includes(p.node.callee.property?.name)
      ) {
        const object = p.node.callee.object;
        if (
          object?.type === 'CallExpression' &&
          object.callee?.type === 'MemberExpression' &&
          object.callee.property?.name === 'prepare' &&
          object.callee.object?.name === 'db'
        ) {
          if (!p.parentPath.isAwaitExpression()) {
            p.replaceWith({
              type: 'AwaitExpression',
              argument: p.node
            });
            modified = true;
            let parentFunc = p.findParent(parent => parent.isFunction());
            if (parentFunc) {
              parentFunc.node.async = true;
            }
          }
        }
      }
    }
  });

  if (modified) {
    const output = generate(ast, { retainLines: true }, code);
    fs.writeFileSync(filePath, output.code, 'utf8');
    console.log(`Updated ${filePath}`);
  }
};

const processDirectory = (dir) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory() && file !== 'node_modules' && file !== 'scratch') {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.js') && file !== 'db.js') {
      try {
         processFile(fullPath);
      } catch(e) {
         console.error('Error processing', fullPath, e.stack);
      }
    }
  }
};

processDirectory(path.join(__dirname, '..'));
