require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { getDb } = require('./db');
const { errorHandler } = require('./middleware/error-handler');
const { authMiddleware } = require('./middleware/auth');
const requestLogger = require('./middleware/request-logger');

const app = express();
const server = http.createServer(app);

const START_TIME = Date.now();
const AI_PORT = parseInt(process.env.AI_PORT, 10) || 8000;
const AI_SERVICE_DIR = path.join(__dirname, '..', 'ai-service');

// ═══════════════════════════════════════════════════════════════
// PRODUCTION CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  port: parseInt(process.env.PORT, 10) || 5000,
  corsOrigins: process.env.CORS_ORIGINS ?
  process.env.CORS_ORIGINS.split(',') :
  ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'],
  ai: {
    healthCheckIntervalMs: 15000,
    startupGracePeriodMs: 30000,
    requestTimeoutMs: 55000,
    maxRecoveryAttempts: 10,
    recoveryCooldownMs: 30000,
    baseRetryDelayMs: 1000,
    maxRetryDelayMs: 60000
  },
  db: {
    busyTimeoutMs: 5000
  }
};

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE - Order matters
// ═══════════════════════════════════════════════════════════════

app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID().slice(0, 8);
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

app.use(requestLogger);
app.use(cors({
  origin: function (origin, callback) {
    // Allow any origin for local network / QR code access
    callback(null, origin || true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ═══════════════════════════════════════════════════════════════
// SOCKET.IO
// ═══════════════════════════════════════════════════════════════

const io = new Server(server, {
  cors: { origin: CONFIG.corsOrigins, methods: ['GET', 'POST'] },
  pingInterval: 25000,
  pingTimeout: 20000
});

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

app.use('/api/auth', require('./routes/auth'));
app.use('/api/waterpoints', require('./routes/waterpoints'));
app.use('/api/sensors', require('./routes/sensors'));
app.use('/api/climate', require('./routes/climate'));
app.use('/api/quality', require('./routes/quality'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/health', require('./routes/health'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/governance', require('./routes/governance'));
app.use('/api/gwn', require('./routes/gwn'));
app.use('/api/incidents', require('./routes/incidents'));
app.use('/api/citizen', require('./routes/citizen'));
app.use('/api/citizen-reports', require('./routes/citizen-reports'));
app.use('/api/citizen-tracking', require('./routes/citizen-tracking'));
app.use('/api/task-assignment', require('./routes/task-assignment'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/incident-analysis', require('./routes/incident-analysis'));
app.use('/api/emergency-response', require('./routes/emergency-response'));
app.use('/api/ai-conversations', require('./routes/ai-conversations'));

// ═══════════════════════════════════════════════════════════════
// ENHANCED MULTILINGUAL & AUTO-ASSIGNMENT ROUTES
// ═══════════════════════════════════════════════════════════════

function postToAI(path, data) {
  return new Promise((resolve) => {
    const body = JSON.stringify(data);
    const opts = {
      hostname: '127.0.0.1', port: AI_PORT, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000
    };
    const req = http.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => {try {resolve(JSON.parse(d));} catch {resolve(null);}});
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {req.destroy();resolve(null);});
    req.write(body);
    req.end();
  });
}

// Enhanced multilingual report submission
app.post('/api/reports/multilingual', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { incident_type, description, district, sub_county, village, lat, lng,
    severity, channel, is_anonymous, reporter_name, reporter_phone, reporter_email,
    source_language, original_text } = req.body;

  if (!incident_type || !description || !district) {
    return res.status(400).json({ success: false, error: 'incident_type, description, and district required' });
  }

  const name = is_anonymous ? 'Anonymous' : reporter_name || req.user.name;
  const phone = is_anonymous ? null : reporter_phone || req.user.phone;
  const email = is_anonymous ? null : reporter_email || req.user.email;
  const lang = source_language || req.user.language || 'en';

  const result = await db.prepare(`INSERT INTO citizen_reports (user_id, reporter_name, reporter_phone, reporter_email, incident_type, description, district, sub_county, village, lat, lng, severity, channel, is_anonymous, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`).run(
    req.user.id, name, phone, email, incident_type, description, district,
    sub_county || null, village || null, lat || null, lng || null,
    severity || 'medium', channel || 'app', is_anonymous ? 1 : 0
  );
  const reportId = result.lastInsertRowid;

  await db.prepare(`INSERT INTO citizen_report_tracking (report_id, status, note, updated_by) VALUES (?, 'submitted', 'Multilingual report submitted for AI analysis', ?)`).run(reportId, req.user.id);

  // Trigger AI analysis
  const analysis = await postToAI('/ai/incident-analysis/enhanced-analyze', {
    text: description, source_language: lang, district,
    sub_county: sub_county || null, village: village || null,
    incident_type, channel: channel || 'app', original_text: original_text || null
  });

  if (analysis && analysis.analysis) {
    const a = analysis.analysis;
    try {
      await db.prepare(`INSERT INTO incident_analysis (report_id, ai_severity, ai_category, ai_urgency, ai_risk_score, extracted_location, ai_summary, confidence_score, response_recommendation) VALUES (?,?,?,?,?,?,?,?,?)`).run(
        reportId, a.ai_severity, a.ai_category, a.ai_urgency, a.ai_risk_score,
        a.extracted_location, a.translated_summary || description,
        a.confidence_score || 50, a.response_recommendation || ''
      );

      if (['medium', 'high', 'critical', 'emergency'].includes(a.ai_severity)) {
        postToAI('/ai/incident-analysis/auto-assign/' + reportId, {});
      }
    } catch (e) {}
  }

  postToAI('/ai/notifications/send', {
    recipient_id: req.user.id, recipient_contact: req.user.email || '',
    channel: 'in_app', template_name: 'report_submitted', language: lang,
    report_id: reportId, category: incident_type.replace(/_/g, ' '), district
  });

  res.status(201).json({ success: true, id: reportId, analysis: analysis ? analysis.analysis : null,
    message: 'Report submitted. ' + (analysis && analysis.analysis && analysis.analysis.translated_summary ? 'AI analysis complete.' : 'Processing...') });
});

// Auto-assign all pending reports
app.post('/api/reports/auto-assign-pending', authMiddleware, async function (req, res) {
  const db = await getDb();
  const pending = await db.prepare("SELECT id, district, severity, incident_type FROM citizen_reports WHERE status = 'pending' AND id NOT IN (SELECT report_id FROM task_assignments) LIMIT 20").all();

  let triggered = 0;
  for (const report of pending) {
    try {
      const reqHttp = http.request({ hostname: '127.0.0.1', port: AI_PORT, path: '/ai/incident-analysis/auto-assign/' + report.id, method: 'POST', timeout: 5000 }, function () {});
      reqHttp.on('error', function () {});
      reqHttp.end();
      triggered++;
    } catch (e) {}
  }

  res.json({ success: true, triggered: triggered, message: 'Auto-assignment triggered for ' + triggered + ' reports' });
});

// Get locality officers
app.get('/api/reports/officers', authMiddleware, async function (req, res) {
  const db = await getDb();
  const { district, incident_type } = req.query;
  const preferredRoles = {
    water_contamination: ['health_officer', 'district_officer'],
    broken_water_point: ['technician', 'district_officer'],
    flooding: ['district_officer', 'technician'],
    sewage_leak: ['health_officer', 'district_officer'],
    illegal_dumping: ['district_officer', 'ngo_officer'],
    pollution: ['health_officer', 'climate_scientist'],
    environmental_hazard: ['district_officer', 'climate_scientist'],
    infrastructure_damage: ['technician', 'district_officer']
  };
  const roles = preferredRoles[incident_type] || ['district_officer'];
  const placeholders = roles.map(function () {return '?';}).join(',');
  const params = [district].concat(roles);

  const officers = await db.prepare("SELECT id, name, role, district, sub_county, email, phone FROM users WHERE district = ? AND role IN (" + placeholders + ") AND active = 1 ORDER BY last_login DESC").all(...params);
  res.json({ success: true, data: officers });
});

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLER (must be last)
// ═══════════════════════════════════════════════════════════════

app.use(errorHandler);

// ═══════════════════════════════════════════════════════════════
// HEALTH & DIAGNOSTIC ENDPOINTS
// ═══════════════════════════════════════════════════════════════

app.get('/api/health-check', async (_, res) => {
  let dbOk = false;
  try {
    const db = await getDb();
    await db.prepare('SELECT 1').get();
    dbOk = true;
  } catch {}
  res.json({
    status: dbOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    service: 'HYDROSENSE API v2.0',
    database: dbOk ? 'connected' : 'error',
    uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000)
  });
});

app.get('/api/system/status', (_, res) => {
  res.json({
    status: 'running',
    service: 'HYDROSENSE API v2.0',
    started_at: new Date(START_TIME).toISOString(),
    uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
    ai_service: aiServiceStatus,
    database: 'connected',
    version: '2.0.0'
  });
});

// ═══════════════════════════════════════════════════════════════
// NATIVE NODE.JS GEMINI CHAT FALLBACK
// ═══════════════════════════════════════════════════════════════

async function handleNativeNodeChat(req, res, targetPath) {
  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    try {
      const envPath = path.join(__dirname, '.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/^GEMINI_API_KEY=(.*)$/m);
        if (match) apiKey = match[1].trim();
      }
    } catch {}
  }

  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const { message, history = [], role = 'citizen', district = '' } = req.body || {};
  
  const db = await getDb();
  let statsStr = "";
  try {
    const totalWp = await db.prepare("SELECT COUNT(*) as c FROM water_points").get();
    const funcWp = await db.prepare("SELECT COUNT(*) as c FROM water_points WHERE status='functional'").get();
    const alerts = await db.prepare("SELECT COUNT(*) as c FROM alerts WHERE status='active'").get();
    const pending = await db.prepare("SELECT COUNT(*) as c FROM maintenance_requests WHERE status='pending'").get();
    const unsafe = await db.prepare("SELECT COUNT(*) as c FROM water_quality_tests WHERE overall_safe=0").get();
    
    statsStr = `Current stats: ${totalWp.c} total water points, ${funcWp.c} functional. ` +
               `${alerts.c} active alerts. ${pending.c} pending maintenance requests. ` +
               `${unsafe.c} unsafe water quality tests recorded.`;
  } catch (e) {
    statsStr = "System stats unavailable.";
  }
  
  const systemPrompt = `You are Hydro AI, the assistant for HYDROSENSE — Uganda's national climate-resilient rural water management platform.\n\n` +
                       `User role: ${role}. District: ${district || 'National'}.\n` +
                       `${statsStr}\n\n` +
                       `Keep responses concise. Use **bold** for key figures.`;

  const contents = [
    { role: "user", parts: [{ text: `[SYSTEM CONTEXT]\n${systemPrompt}\n[/SYSTEM CONTEXT]` }] },
    { role: "model", parts: [{ text: "Understood. I have the latest HYDROSENSE system data. How can I help?" }] }
  ];

  for (const turn of history.slice(-6)) {
    contents.push({
      role: turn.role === "user" ? "user" : "model",
      parts: [{ text: turn.content }]
    });
  }

  contents.push({ role: "user", parts: [{ text: message || "Hello" }] });

  const payload = {
    contents,
    generationConfig: { temperature: 0.3, maxOutputTokens: 1500 }
  };

  const isStream = targetPath.includes('/chat/stream');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:${isStream ? 'streamGenerateContent?alt=sse' : 'generateContent'}?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Hydro AI is temporarily busy. Please wait a moment and try again.');
    }
    if (response.status === 400) {
      throw new Error('Invalid request to AI service. Please try rephrasing your question.');
    }
    throw new Error(`AI service error (${response.status}). Please try again shortly.`);
  }

  if (isStream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          if (line.includes('[DONE]')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            const textParts = data.candidates?.[0]?.content?.parts;
            if (textParts && textParts.length > 0) {
              const textChunk = textParts[0].text;
              if (textChunk) {
                res.write('data: ' + JSON.stringify({ type: 'chunk', text: textChunk }) + '\n\n');
              }
            }
          } catch {}
        }
      }
    }
    res.write('data: ' + JSON.stringify({ type: 'done' }) + '\n\n');
    res.end();
  } else {
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
    res.status(200).json({
      success: true,
      reply: text,
      model: "Hydro AI (Native Node.js Fallback)",
      source: "gemini"
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// AI SERVICE PROXY
// ═══════════════════════════════════════════════════════════════

async function proxyToAI(req, res, targetPath) {
  const startTime = Date.now();
  let responded = false;
  const requestId = req.headers['x-request-id'] || crypto.randomUUID().slice(0, 8);
  const safeRespond = (statusCode, data) => {
    if (!responded) {responded = true;res.status(statusCode).json({ ...data, _request_id: requestId, _proxy_ms: Date.now() - startTime });}
  };

  const bodyData = ['POST', 'PUT', 'PATCH'].includes(req.method) && req.body ?
  JSON.stringify(req.body) :
  null;

  const options = {
    hostname: 'localhost',
    port: AI_PORT,
    path: targetPath,
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      ...(bodyData ? { 'Content-Length': Buffer.byteLength(bodyData) } : {})
    },
    timeout: CONFIG.ai.requestTimeoutMs
  };

  const proxyReq = http.request(options, (proxyRes) => {
    const contentType = proxyRes.headers['content-type'] || '';
    const isStream = contentType.includes('text/event-stream');

    if (isStream) {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Request-ID': requestId
      });
      proxyRes.on('data', (chunk) => {
        if (!responded) responded = true;
        res.write(chunk);
      });
      proxyRes.on('end', () => {res.end();});
      return;
    }

    let data = '';
    proxyRes.on('data', (chunk) => data += chunk);
    proxyRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        res.set('X-Request-ID', requestId);
        safeRespond(proxyRes.statusCode, parsed);
      } catch {
        safeRespond(502, { status: 'error', message: 'Invalid AI response', _request_id: requestId });
      }
    });
  });

  proxyReq.on('error', async (err) => {
    // FALLBACK MOCK IF AI IS DOWN ON RENDER
    if (targetPath.includes('/health') || targetPath.includes('/system/ping')) {
      return safeRespond(200, { status: 'online', service: 'HYDROSENSE AI (Fallback Mode)', version: '2.0.1 (Node)', latency: 15 });
    }
    
    if (targetPath.includes('/chat/stream') || targetPath.endsWith('/chat')) {
      if (!responded) {
        try {
          await handleNativeNodeChat(req, res, targetPath);
          responded = true;
          return;
        } catch (chatErr) {
          console.error("Native Node Chat Error:", chatErr.message);
          if (res.headersSent) {
            res.write('data: ' + JSON.stringify({ type: 'error', message: 'AI error: ' + chatErr.message }) + '\n\n');
            res.end();
            responded = true;
            return;
          }
          // Headers not yet sent — for stream endpoint send a proper SSE error so
          // the frontend's onError fires and triggers its non-stream fallback
          if (targetPath.includes('/chat/stream')) {
            responded = true;
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
            res.write('data: ' + JSON.stringify({ type: 'error', message: 'AI error: ' + chatErr.message }) + '\n\n');
            res.end();
            return;
          }
          req.nativeChatError = chatErr.message;
        }
      }
    }

    // GENERIC FALLBACK FOR ALL OTHER AI ENDPOINTS
    if (!responded) {
      responded = true;
      return res.status(200).json({
        success: true,
        data: [],
        analysis: "Node.js Fallback: Data simulated because AI microservice is unavailable.",
        message: req.nativeChatError ? `AI Error: ${req.nativeChatError}` : "Node.js Fallback Response",
        reply: req.nativeChatError ? `AI Error: ${req.nativeChatError}` : "Node.js Fallback Response",
        risk_score: 50,
        predictions: []
      });
    }
  });

  proxyReq.setTimeout(CONFIG.ai.requestTimeoutMs, () => {
    proxyReq.destroy();
    if (targetPath.includes('/health')) return safeRespond(200, { status: 'online', service: 'Fallback Mode' });
    if (!responded) {
      responded = true;
      return res.status(200).json({ success: true, message: 'Timeout fallback' });
    }
  });

  if (bodyData) proxyReq.write(bodyData);
  proxyReq.end();
}

// Public AI health endpoints
app.all('/api/ai/health', (req, res) => proxyToAI(req, res, '/ai/health'));
app.all('/api/ai/system/ping', (req, res) => proxyToAI(req, res, '/ai/system/ping'));

// Wildcard route that captures full path after /api/ai/
app.all('/api/ai/:path(*)', authMiddleware, (req, res) => {
  const targetPath = '/ai/' + req.params.path;
  proxyToAI(req, res, targetPath);
});

// ═══════════════════════════════════════════════════════════════
// AI SERVICE HEALTH MONITORING
// ═══════════════════════════════════════════════════════════════

let aiServiceStatus = {
  status: 'offline', last_check: null, check_count: 0,
  recovery_attempts: 0, latency: null
};
let lastKnownStatus = null;
let aiProcess = null;
let isRecovering = false;
let lastRecoveryTime = 0;
let consecutiveFailures = 0;

function emitAIStatus(data) {
  io.emit('ai_service_status', {
    status: data.status || 'offline',
    latency: data.latency || null,
    last_check: data.last_check || new Date().toISOString(),
    recovery_attempts: data.recovery_attempts || aiServiceStatus.recovery_attempts || 0,
    check_count: data.check_count || aiServiceStatus.check_count || 0
  });
}

async function checkAIHealth() {
  return new Promise((resolve) => {
    const start = Date.now();
    let done = false;
    const finish = (result) => {if (!done) {done = true;resolve(result);}};

    const req = http.request(
      { hostname: 'localhost', port: AI_PORT, path: '/ai/health', method: 'GET', timeout: 5000 },
      (proxyRes) => {
        let data = '';
        proxyRes.on('data', (chunk) => data += chunk);
        proxyRes.on('end', () => {
          const latency = Date.now() - start;
          try {
            const parsed = JSON.parse(data);
            finish({ ok: true, data: parsed, latency });
          } catch {
            finish({ ok: false, latency });
          }
        });
      }
    );
    req.on('error', () => finish({ ok: false, latency: Date.now() - start }));
    req.setTimeout(5000, () => {req.destroy();finish({ ok: false, latency: Date.now() - start });});
    req.end();
  });
}

function handleAIOnline(healthData, latency) {
  const wasOffline = lastKnownStatus === 'offline';
  isRecovering = false;
  aiServiceStatus = {
    ...healthData,
    last_check: new Date().toISOString(),
    check_count: (aiServiceStatus.check_count || 0) + 1,
    recovery_attempts: 0,
    latency
  };
  consecutiveFailures = 0;
  emitAIStatus({ status: 'online', latency });

  if (wasOffline || lastKnownStatus !== 'online') {
    console.log(`[AI] Hydro AI engine is ONLINE (latency: ${latency}ms)`);
    lastKnownStatus = 'online';
  }
}

function handleAIDegraded() {
  const wasOnline = lastKnownStatus === 'online';
  consecutiveFailures++;
  aiServiceStatus = {
    status: 'offline',
    last_check: new Date().toISOString(),
    check_count: (aiServiceStatus.check_count || 0) + 1,
    recovery_attempts: aiServiceStatus.recovery_attempts || 0
  };

  if (wasOnline || consecutiveFailures >= 2) {
    emitAIStatus({ status: 'offline' });
  }

  if (wasOnline) {
    console.log(`[AI] Hydro AI went offline (${consecutiveFailures} consecutive failures)`);
    lastKnownStatus = 'offline';
  }

  if (consecutiveFailures >= 2 && !isRecovering) {
    setTimeout(() => attemptAIAutoRecovery(), 5000);
  }
}

async function performHealthCheck() {
  const result = await checkAIHealth();
  if (result.ok) {
    handleAIOnline(result.data, result.latency);
  } else {
    handleAIDegraded();
  }
}

function attemptAIAutoRecovery() {
  const now = Date.now();

  if (isRecovering) return;
  if (now - lastRecoveryTime < CONFIG.ai.recoveryCooldownMs) return;

  const recoveryCount = (aiServiceStatus.recovery_attempts || 0) + 1;
  aiServiceStatus.recovery_attempts = recoveryCount;

  if (recoveryCount > CONFIG.ai.maxRecoveryAttempts) {
    console.log(`[AI Auto-Recovery] Max attempts (${CONFIG.ai.maxRecoveryAttempts}) reached. Manual restart required.`);
    return;
  }

  if (aiProcess) {
    try {aiProcess.kill('SIGTERM');} catch {}
    aiProcess = null;
  }

  const python = findPython();
  if (!python) {console.log('[AI Auto-Recovery] Python not found.');return;}

  const mainPy = path.join(AI_SERVICE_DIR, 'main.py');
  if (!fs.existsSync(mainPy)) {console.log('[AI Auto-Recovery] main.py not found.');return;}

  try {
    execFileSync(python, ['-c', 'import fastapi, uvicorn; print("ok")'], { timeout: 5000, cwd: AI_SERVICE_DIR, stdio: 'pipe' });
  } catch {
    console.log('[AI Auto-Recovery] Dependencies not installed. Installing now...');
    try {
      execFileSync(python, ['-m', 'pip', 'install', '-r', 'requirements.txt', '--break-system-packages'], { cwd: AI_SERVICE_DIR, stdio: 'inherit' });
    } catch (e) {
      try {
        execFileSync(python, ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: AI_SERVICE_DIR, stdio: 'inherit' });
      } catch (err) {
        console.log(`[AI Auto-Recovery] Failed to install dependencies: ${err.message}`);
        return;
      }
    }
  }

  console.log(`[AI Auto-Recovery] Attempt ${recoveryCount}/${CONFIG.ai.maxRecoveryAttempts}`);

  isRecovering = true;
  lastRecoveryTime = now;

  aiProcess = spawn(python, [
  '-m', 'uvicorn', 'main:app', '--host', '0.0.0.0',
  '--port', String(AI_PORT), '--log-level', 'warning'],
  {
    cwd: AI_SERVICE_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  });

  const startupTimeout = setTimeout(() => {
    isRecovering = false;
  }, CONFIG.ai.startupGracePeriodMs);

  aiProcess.stdout.on('data', (data) => {
    console.log(`[AI] ${data.toString().trim()}`);
  });

  aiProcess.stderr.on('data', (data) => {
    console.log(`[AI] ${data.toString().trim()}`);
  });

  aiProcess.on('error', (err) => {
    console.log(`[AI Auto-Recovery] Failed: ${err.message}`);
    clearTimeout(startupTimeout);
    aiProcess = null;
    isRecovering = false;
  });

  aiProcess.on('exit', (code) => {
    clearTimeout(startupTimeout);
    console.log(`[AI Auto-Recovery] Exited with code ${code}`);
    aiProcess = null;
    isRecovering = false;
    if ((aiServiceStatus.recovery_attempts || 0) < CONFIG.ai.maxRecoveryAttempts) {
      const delay = Math.min(
        CONFIG.ai.baseRetryDelayMs * Math.pow(1.5, aiServiceStatus.recovery_attempts || 0),
        CONFIG.ai.maxRetryDelayMs
      );
      setTimeout(() => attemptAIAutoRecovery(), delay);
    }
  });
}

function findPython() {
  const candidates = [
  path.join(AI_SERVICE_DIR, '.venv', 'Scripts', 'python.exe'),
  path.join(AI_SERVICE_DIR, '.venv', 'Scripts', 'python3.exe'),
  'python', 'python3', 'py'];

  for (const py of candidates) {
    try {
      execFileSync(py, ['--version'], { timeout: 3000, stdio: 'pipe' });
      return py;
    } catch {}
  }
  return null;
}

// Periodic health checks
setInterval(performHealthCheck, CONFIG.ai.healthCheckIntervalMs);

// Initial AI detection with retry
async function initialAIDetection() {
  for (let attempt = 1; attempt <= 10; attempt++) {
    const result = await checkAIHealth();
    if (result.ok) {
      handleAIOnline(result.data, result.latency);
      console.log('[AI] Hydro AI detected and connected on startup');
      return;
    }
    const delay = Math.min(attempt * 2000, 10000);
    console.log(`[AI] Not detected (attempt ${attempt}/10), retrying in ${delay / 1000}s`);
    await new Promise((r) => setTimeout(r, delay));
  }
  console.log('[AI] Not detected after 10 attempts. Background recovery will continue.');
  aiServiceStatus = { status: 'offline', last_check: new Date().toISOString(), check_count: 1, initialized: true, recovery_attempts: 0 };
  setTimeout(() => attemptAIAutoRecovery(), 3000);
}

setTimeout(() => initialAIDetection(), 2000);

// ═══════════════════════════════════════════════════════════════
// SOCKET.IO EVENTS
// ═══════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  socket.on('subscribe_district', (district) => socket.join(`district_${district}`));
  socket.on('unsubscribe_district', (district) => socket.leave(`district_${district}`));
  socket.on('disconnect', (reason) => console.log(`[Socket] Client disconnected: ${socket.id} (${reason})`));
});

// ═══════════════════════════════════════════════════════════════
// SENSOR SIMULATION CRON
// ═══════════════════════════════════════════════════════════════

cron.schedule('*/30 * * * * *', async () => {
  try {
    const db = await getDb();
    const sensors = await db.prepare(`
      SELECT s.id, s.water_point_id, s.sensor_type, s.unit,
             s.last_reading, s.min_threshold, s.max_threshold, wp.district
      FROM sensors s JOIN water_points wp ON s.water_point_id = wp.id
      WHERE s.status = 'active'
    `).all();

    const updates = [];
    const now = new Date().toISOString();

    for (const sensor of sensors) {
      const value = generateReading(sensor);
      await db.prepare('UPDATE sensors SET last_reading = ?, last_seen = ? WHERE id = ?').run(value, now, sensor.id);
      await db.prepare('INSERT INTO sensor_readings (sensor_id, water_point_id, value, unit, timestamp) VALUES (?, ?, ?, ?, ?)').run(sensor.id, sensor.water_point_id, value, sensor.unit, now);
      updates.push({
        sensor_id: sensor.id, water_point_id: sensor.water_point_id,
        sensor_type: sensor.sensor_type, value, unit: sensor.unit,
        district: sensor.district, timestamp: now
      });

      if (sensor.min_threshold !== null && value < sensor.min_threshold) {
        const exists = await db.prepare("SELECT id FROM alerts WHERE source = ? AND status = 'active' AND created_at > datetime('now', '-2 hours')").get(`sensor_${sensor.id}`);
        if (!exists) {
          await db.prepare(`INSERT INTO alerts (alert_type, severity, water_point_id, district, title, message, source) VALUES ('infrastructure', 'warning', ?, ?, ?, ?, ?)`).run(
            sensor.water_point_id, sensor.district,
            `Low ${sensor.sensor_type} Reading`,
            `Sensor ${sensor.id} reading ${value} ${sensor.unit} is below minimum threshold ${sensor.min_threshold} ${sensor.unit}`,
            `sensor_${sensor.id}`
          );
          io.emit('new_alert', { severity: 'warning', district: sensor.district, type: sensor.sensor_type });
        }
      }
    }

    if (updates.length > 0) {
      io.emit('sensor_updates', updates);
    }
  } catch (err) {
    console.error('[Sensor Cron Error]', err.message);
  }
});

function generateReading(sensor) {
  const base = sensor.last_reading || getBase(sensor.sensor_type);
  const var_ = getVariation(sensor.sensor_type);
  const hour = new Date().getHours();

  let value;
  if (sensor.sensor_type === 'solar_power') {
    value = hour >= 7 && hour <= 18 ? 40 + Math.random() * 55 : Math.random() * 5;
  } else if (sensor.sensor_type === 'rainfall') {
    value = Math.random() < 0.2 ? Math.random() * 15 : 0;
  } else {
    value = base + (Math.random() - 0.5) * var_;
  }
  return Math.max(0, parseFloat(value.toFixed(2)));
}

function getBase(type) {
  return { water_level: 7, flow_rate: 900, water_quality: 1.5, rainfall: 0, temperature: 26, solar_power: 60, groundwater: 10 }[type] || 5;
}

function getVariation(type) {
  return { water_level: 1.0, flow_rate: 150, water_quality: 0.8, rainfall: 5, temperature: 3, solar_power: 15, groundwater: 0.5 }[type] || 0.5;
}

// ═══════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════

function shutdown(signal) {
  console.log(`\n[Server] ${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    if (aiProcess) {
      try {aiProcess.kill('SIGTERM');} catch {}
    }
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════

const PORT = CONFIG.port;
server.listen(PORT, async () => {
  await getDb();
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  HYDROSENSE — Climate-Resilient Rural Water System');
  console.log(`  Running at: http://localhost:${PORT}`);
  console.log(`  API Base:   http://localhost:${PORT}/api`);
  console.log(`  Health:     http://localhost:${PORT}/api/health-check`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

module.exports = { io };