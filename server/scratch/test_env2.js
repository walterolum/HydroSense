const fs = require('fs');
const path = require('path');

let apiKey = process.env.GEMINI_API_KEY;
console.log('process.env.GEMINI_API_KEY:', apiKey);

if (!apiKey) {
  try {
    const envPath = path.join(__dirname, '..', '..', 'ai-service', '.env');
    console.log('envPath:', envPath);
    console.log('exists:', fs.existsSync(envPath));
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/^GEMINI_API_KEY=(.*)$/m);
      console.log('match:', match);
      if (match) apiKey = match[1].trim();
    }
  } catch (e) {
    console.error(e);
  }
}

console.log('final apiKey:', apiKey);
