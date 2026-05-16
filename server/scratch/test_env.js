const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'ai-service', '.env');
console.log("File exists?", fs.existsSync(envPath));
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^GEMINI_API_KEY=(.*)$/m);
  console.log("Match:", match);
  if (match) {
    console.log("API Key:", match[1].trim());
  }
}
