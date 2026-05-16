async function testGemini() {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:streamGenerateContent?alt=sse&key=AIzaSyAfAEuSf2yHJZmHwULdI4HmMCJcN-JDvGA';
  const payload = {
    contents: [{ role: 'user', parts: [{ text: 'How many water points are functional?' }] }]
  };
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Response:', text);
}

testGemini();
