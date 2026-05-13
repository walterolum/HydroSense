const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('src');
let changedCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  
  content = content.replace(/localStorage\.getItem\('hs_token'\)/g, "sessionStorage.getItem('hs_token')");
  content = content.replace(/localStorage\.getItem\('hs_user'\)/g, "sessionStorage.getItem('hs_user')");
  
  content = content.replace(/localStorage\.setItem\('hs_token'/g, "sessionStorage.setItem('hs_token'");
  content = content.replace(/localStorage\.setItem\('hs_user'/g, "sessionStorage.setItem('hs_user'");
  
  content = content.replace(/localStorage\.removeItem\('hs_token'\)/g, "sessionStorage.removeItem('hs_token')");
  content = content.replace(/localStorage\.removeItem\('hs_user'\)/g, "sessionStorage.removeItem('hs_user')");
  
  if (content !== original) {
    fs.writeFileSync(file, content);
    changedCount++;
  }
});

console.log('Modified ' + changedCount + ' files to use sessionStorage for auth.');
