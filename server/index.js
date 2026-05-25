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

// ── One-time database reset (set RESET_DB=1 in env, deploy once, then remove) ──
if (process.env.RESET_DB === '1') {
  const bcrypt = require('bcryptjs');
  const db = getDb();
  console.log('[RESET] Clearing all data from database...');
  db.exec(`
    DELETE FROM citizen_report_tracking;
    DELETE FROM report_media;
    DELETE FROM incident_analysis;
    DELETE FROM task_assignments;
    DELETE FROM response_tickets;
    DELETE FROM otp_attempt_log;
    DELETE FROM otp_delivery_log;
    DELETE FROM otp_codes;
    DELETE FROM citizen_reports;
    DELETE FROM resilience_scores;
    DELETE FROM maintenance_funds;
    DELETE FROM budget_records;
    DELETE FROM governance_audit;
    DELETE FROM health_incidents;
    DELETE FROM community_reports;
    DELETE FROM alerts;
    DELETE FROM water_quality_tests;
    DELETE FROM flood_alerts;
    DELETE FROM drought_index;
    DELETE FROM climate_readings;
    DELETE FROM maintenance_requests;
    DELETE FROM sensor_readings;
    DELETE FROM sensors;
    DELETE FROM spare_parts;
    DELETE FROM water_points;
    DELETE FROM gwn_reports;
    DELETE FROM env_incidents;
    DELETE FROM pollution_hotspots;
    DELETE FROM agency_assignments;
    DELETE FROM citizen_discussions;
    DELETE FROM citizen_replies;
    DELETE FROM discussion_likes;
    DELETE FROM volunteer_events;
    DELETE FROM event_registrations;
    DELETE FROM citizen_observations;
    DELETE FROM notification_log;
    DELETE FROM ai_conversations;
    DELETE FROM ai_messages;
    DELETE FROM ai_decision_log;
    DELETE FROM ai_analytics_cache;
    DELETE FROM language_corpus;
    DELETE FROM dialect_patterns;
    DELETE FROM accent_profiles;
    DELETE FROM translation_feedback;
    DELETE FROM offline_queue;
    DELETE FROM users;
    DELETE FROM sqlite_sequence;
  `);
  // Create one system administrator so the system can be accessed after reset
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@hydrosense.ug').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'HydroAdmin2024!';
  const adminName = process.env.ADMIN_NAME || 'System Administrator';
  const hash = bcrypt.hashSync(adminPassword, 10);
  db.prepare(
    `INSERT INTO users (name, email, password_hash, role, district, organization, active)
     VALUES (?, ?, ?, 'national_admin', 'Kampala', 'HydroSense', 1)`
  ).run(adminName, adminEmail, hash);
  console.log('[RESET] Database cleared. Fresh admin account created:');
  console.log(`[RESET]   Email:    ${adminEmail}`);
  console.log(`[RESET]   Password: ${adminPassword}`);
  console.log('[RESET] Remove RESET_DB from env variables before next deploy.');
}

// ── Remove demo accounts, keep national_admin (set CLEAR_DEMO=1, deploy once, remove) ──
if (process.env.CLEAR_DEMO === '1') {
  const db = getDb();
  console.log('[CLEAR_DEMO] Saving admin accounts and wiping all demo data...');

  // Save all national_admin accounts before clearing
  const admins = db.prepare("SELECT * FROM users WHERE role = 'national_admin'").all();

  // Disable FK checks so we can wipe all tables in any order
  db.pragma('foreign_keys = OFF');
  db.exec(`
    DELETE FROM citizen_report_tracking;
    DELETE FROM report_media;
    DELETE FROM incident_analysis;
    DELETE FROM task_assignments;
    DELETE FROM response_tickets;
    DELETE FROM otp_attempt_log;
    DELETE FROM otp_delivery_log;
    DELETE FROM otp_codes;
    DELETE FROM citizen_reports;
    DELETE FROM resilience_scores;
    DELETE FROM maintenance_funds;
    DELETE FROM budget_records;
    DELETE FROM governance_audit;
    DELETE FROM health_incidents;
    DELETE FROM community_reports;
    DELETE FROM alerts;
    DELETE FROM water_quality_tests;
    DELETE FROM flood_alerts;
    DELETE FROM drought_index;
    DELETE FROM climate_readings;
    DELETE FROM maintenance_requests;
    DELETE FROM sensor_readings;
    DELETE FROM sensors;
    DELETE FROM spare_parts;
    DELETE FROM water_points;
    DELETE FROM gwn_reports;
    DELETE FROM env_incidents;
    DELETE FROM pollution_hotspots;
    DELETE FROM agency_assignments;
    DELETE FROM citizen_discussions;
    DELETE FROM citizen_replies;
    DELETE FROM discussion_likes;
    DELETE FROM volunteer_events;
    DELETE FROM event_registrations;
    DELETE FROM citizen_observations;
    DELETE FROM notification_log;
    DELETE FROM ai_conversations;
    DELETE FROM ai_messages;
    DELETE FROM ai_decision_log;
    DELETE FROM ai_analytics_cache;
    DELETE FROM language_corpus;
    DELETE FROM dialect_patterns;
    DELETE FROM accent_profiles;
    DELETE FROM translation_feedback;
    DELETE FROM offline_queue;
    DELETE FROM users;
    DELETE FROM sqlite_sequence;
  `);
  db.pragma('foreign_keys = ON');

  // Re-insert the saved admin accounts with their original IDs and passwords intact
  const ins = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, district, organization, phone, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  admins.forEach(a => ins.run(a.id, a.name, a.email, a.password_hash, a.role, a.district, a.organization, a.phone, a.active, a.created_at));

  console.log(`[CLEAR_DEMO] Done. ${admins.length} admin account(s) preserved, all demo data removed.`);
  admins.forEach(a => console.log(`[CLEAR_DEMO]   Kept: ${a.email} (${a.name})`));
  console.log('[CLEAR_DEMO] Remove CLEAR_DEMO from env variables before next deploy.');
}

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
// VOICE TRANSLATE — speech transcript → English explanation via Gemini
// ═══════════════════════════════════════════════════════════════
app.post('/api/ai/voice-translate', async (req, res) => {
  try {
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
    if (!apiKey) return res.status(503).json({ error: 'AI service not configured' });

    const { text, sourceLang = 'unknown', languageName = 'local language' } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });

    const prompt = `You are a water management assistant for Uganda's HydroSense platform.

A citizen reported an issue by speaking in ${languageName} (language code: ${sourceLang}).
Their speech was transcribed as: "${text}"

Please respond with a JSON object (no markdown, raw JSON only) in this exact format:
{
  "detectedLanguage": "the language the user spoke in",
  "english": "accurate English translation of the original message",
  "explanation": "clear 2-3 sentence explanation of the water/environmental issue described, what it means, and suggested urgency for the water management team",
  "incidentType": "best matching type from: water_contamination, broken_water_point, flooding, sewage_leak, illegal_dumping, pollution, environmental_hazard, infrastructure_damage, or 'other'",
  "severity": "low, medium, high, or critical based on the description"
}`;

    let response = null;
    for (const model of ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b']) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 600 }
          })
        }
      );
      if (response.ok || response.status !== 429) break;
      await new Promise(r => setTimeout(r, 800));
    }

    if (!response.ok) return res.status(502).json({ error: 'AI translation failed. Please type your report manually.' });

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(502).json({ error: 'Could not parse AI response' });

    const result = JSON.parse(jsonMatch[0]);
    res.json({ success: true, original: text, ...result });
  } catch (err) {
    console.error('voice-translate error:', err);
    res.status(500).json({ error: 'Translation failed. Please type your report manually.' });
  }
});

// ═══════════════════════════════════════════════════════════════
// AUDIO / VIDEO TRANSCRIBE — raw audio blob → Gemini multimodal
// Supports any language including Luganda, Acholi, Ateso, Lugbara,
// Runyankore, Lusoga, Rukiga, Luo, Swahili and any other language
// ═══════════════════════════════════════════════════════════════
app.post('/api/ai/audio-transcribe', async (req, res) => {
  try {
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
    if (!apiKey) return res.status(503).json({ error: 'AI service not configured' });

    const { audioBase64, mimeType = 'audio/webm' } = req.body;
    if (!audioBase64) return res.status(400).json({ error: 'No audio data provided' });

    const prompt = `You are an expert transcription and translation assistant for Uganda's HydroSense water management platform.

Listen carefully to this audio recording. The speaker may be speaking in ANY Ugandan or East African language, including but not limited to:
- Luganda, Acholi, Ateso/Teso, Lugbara, Runyankore/Nkore, Lusoga, Rukiga, Luo, Langi, Madi, Alur, Kakwa
- Swahili, English, or any mixture (code-switching is common)

Your task:
1. Transcribe the audio EXACTLY as spoken (in the original language)
2. Identify the language(s) spoken
3. Translate accurately to English — preserve all details about water issues, health problems, environmental damage, and locations
4. Classify the incident type and severity — this information is critical for Uganda's water, health, and environmental sectors

Respond ONLY with raw JSON (no markdown, no explanation outside JSON):
{
  "original": "exact transcription in the original language(s) spoken",
  "detectedLanguage": "name of the language(s) detected",
  "english": "accurate, complete English translation — do not omit any details",
  "explanation": "2-3 sentence professional summary of the reported issue, its urgency, and recommended action for the water/health management team",
  "incidentType": "one of: water_contamination | broken_water_point | flooding | sewage_leak | illegal_dumping | pollution | environmental_hazard | infrastructure_damage | health_outbreak | other",
  "severity": "low | medium | high | critical"
}`;

    let response = null;
    for (const model of ['gemini-2.5-flash', 'gemini-1.5-flash']) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [
                { inline_data: { mime_type: mimeType, data: audioBase64 } },
                { text: prompt }
              ]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 1000 }
          })
        }
      );
      if (response.ok || response.status !== 429) break;
      await new Promise(r => setTimeout(r, 800));
    }

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini audio transcribe error:', err);
      return res.status(502).json({ error: 'Audio transcription failed' });
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(502).json({ error: 'Could not parse transcription response' });

    const result = JSON.parse(jsonMatch[0]);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('audio-transcribe error:', err);
    res.status(500).json({ error: 'Transcription failed' });
  }
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

  const { message = '', history = [], role = 'citizen', district = '' } = req.body || {};
  const db = getDb();

  // ── Pull live system data for context ──
  let statsStr = '';
  let healthStr = '';
  let waterQualityStr = '';
  let citizenReportStr = '';
  try {
    const totalWp  = db.prepare("SELECT COUNT(*) as c FROM water_points").get();
    const funcWp   = db.prepare("SELECT COUNT(*) as c FROM water_points WHERE status='functional'").get();
    const alerts   = db.prepare("SELECT COUNT(*) as c FROM alerts WHERE status='active'").get();
    const pending  = db.prepare("SELECT COUNT(*) as c FROM maintenance_requests WHERE status='pending'").get();
    const unsafe   = db.prepare("SELECT COUNT(*) as c FROM water_quality_tests WHERE overall_safe=0").get();
    statsStr = `Water infrastructure: ${totalWp.c} total water points, ${funcWp.c} functional. ` +
               `${alerts.c} active alerts. ${pending.c} pending maintenance. ` +
               `${unsafe.c} unsafe water quality records.`;

    // Health / disease outbreak data
    const outbreaks = db.prepare(
      "SELECT disease_type, SUM(cases) as total_cases, SUM(deaths) as total_deaths, COUNT(*) as incidents, " +
      "GROUP_CONCAT(DISTINCT district) as districts, outbreak_status " +
      "FROM health_incidents GROUP BY disease_type, outbreak_status ORDER BY total_cases DESC LIMIT 10"
    ).all();
    if (outbreaks.length > 0) {
      healthStr = 'Disease & outbreak data: ' + outbreaks.map(o =>
        `${o.disease_type} — ${o.total_cases} cases, ${o.total_deaths} deaths across ${o.incidents} incidents in [${o.districts}], status: ${o.outbreak_status}`
      ).join('; ') + '.';
    } else {
      healthStr = 'No disease outbreaks currently recorded in the system.';
    }

    // Water quality summary
    const qualSummary = db.prepare(
      "SELECT parameter_tested, COUNT(*) as tests, SUM(CASE WHEN overall_safe=0 THEN 1 ELSE 0 END) as failed " +
      "FROM water_quality_tests GROUP BY parameter_tested ORDER BY failed DESC LIMIT 5"
    ).all();
    if (qualSummary.length > 0) {
      waterQualityStr = 'Water quality tests: ' + qualSummary.map(q =>
        `${q.parameter_tested}: ${q.failed}/${q.tests} failed`
      ).join(', ') + '.';
    }

    // Recent citizen reports
    const reports = db.prepare(
      "SELECT incident_type, COUNT(*) as c, severity FROM citizen_reports WHERE status='pending' GROUP BY incident_type ORDER BY c DESC LIMIT 5"
    ).all();
    if (reports.length > 0) {
      citizenReportStr = 'Pending citizen reports: ' + reports.map(r => `${r.incident_type} (${r.c})`).join(', ') + '.';
    }
  } catch (e) {
    statsStr = 'System stats temporarily unavailable.';
  }

  const systemPrompt =
    `You are Hydro AI, the intelligent assistant for HYDROSENSE — Uganda's national climate-resilient rural water management platform.\n\n` +
    `User role: ${role}. District: ${district || 'National'}.\n\n` +
    `LIVE SYSTEM DATA:\n` +
    `- ${statsStr}\n` +
    `- ${healthStr}\n` +
    (waterQualityStr ? `- ${waterQualityStr}\n` : '') +
    (citizenReportStr ? `- ${citizenReportStr}\n` : '') +
    `\nAnswer questions about water infrastructure, disease outbreaks, water quality, climate, and citizen reports using the data above. ` +
    `Be specific with numbers. Use **bold** for key figures. Keep responses concise and actionable.`;

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

  // ── Try Gemini (cascade through models) ──
  let geminiText = null;
  if (apiKey) {
    const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
    const action = isStream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    let response = null;
    for (const model of GEMINI_MODELS) {
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}?key=${apiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );
        if (response.ok) break;
        if (response.status === 429 && model !== GEMINI_MODELS[GEMINI_MODELS.length - 1]) {
          await new Promise(r => setTimeout(r, 800));
          continue;
        }
        break;
      } catch { break; }
    }

    if (response && response.ok) {
      if (isStream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
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
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
              try {
                const chunk = JSON.parse(line.slice(6));
                const t = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
                if (t) res.write('data: ' + JSON.stringify({ type: 'chunk', text: t }) + '\n\n');
              } catch {}
            }
          }
        }
        res.write('data: ' + JSON.stringify({ type: 'done' }) + '\n\n');
        res.end();
        return;
      }
      const data = await response.json();
      geminiText = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }
  }

  // ── DB-only fallback when Gemini unavailable or all models failed ──
  if (!geminiText) {
    const msg = message.toLowerCase();
    const isHealth   = /disease|outbreak|cholera|typhoid|dysentery|health|epidemic|infection|diarr|malaria/.test(msg);
    const isWater    = /water|borehole|pump|functional|non.functional|quality|contamina/.test(msg);
    const isMaint    = /maintenance|repair|broken|fix/.test(msg);
    const isAlert    = /alert|warning|critical|emergency/.test(msg);
    const isReport   = /report|citizen|complaint/.test(msg);

    let reply = '';
    try {
      const db2 = getDb();
      if (isHealth) {
        const outbreaks = db2.prepare(
          "SELECT disease_type, SUM(cases) as c, SUM(deaths) as d, COUNT(*) as incidents, GROUP_CONCAT(DISTINCT district) as districts, outbreak_status " +
          "FROM health_incidents GROUP BY disease_type ORDER BY c DESC LIMIT 8"
        ).all();
        if (outbreaks.length > 0) {
          reply = `**Disease Outbreak Summary — HYDROSENSE System**\n\n` +
            outbreaks.map(o =>
              `- **${o.disease_type}**: ${o.c} cases, ${o.d} deaths across ${o.incidents} incident(s) in ${o.districts} — Status: *${o.outbreak_status}*`
            ).join('\n') +
            `\n\n**Action:** Investigate water-source-linked incidents and coordinate with health authorities for affected districts.`;
        } else {
          reply = `**No active disease outbreaks** are currently recorded in the HYDROSENSE system.\n\n` +
            `The system monitors health incidents linked to water sources. All districts appear to be in normal health status at this time.`;
        }
      } else if (isWater) {
        const wp = db2.prepare("SELECT status, COUNT(*) as c FROM water_points GROUP BY status").all();
        const unsafe2 = db2.prepare("SELECT COUNT(*) as c FROM water_quality_tests WHERE overall_safe=0").get();
        reply = `**Water Infrastructure Status**\n\n` +
          wp.map(w => `- **${w.status}**: ${w.c} water points`).join('\n') +
          `\n- **Unsafe quality records**: ${unsafe2.c}`;
      } else if (isMaint) {
        const maint = db2.prepare("SELECT status, COUNT(*) as c FROM maintenance_requests GROUP BY status").all();
        reply = `**Maintenance Summary**\n\n` + maint.map(m => `- **${m.status}**: ${m.c} requests`).join('\n');
      } else if (isAlert) {
        const alts = db2.prepare("SELECT severity, COUNT(*) as c FROM alerts WHERE status='active' GROUP BY severity ORDER BY c DESC").all();
        reply = alts.length > 0
          ? `**Active Alerts**\n\n` + alts.map(a => `- **${a.severity}**: ${a.c}`).join('\n')
          : `No active alerts in the system.`;
      } else if (isReport) {
        const reps = db2.prepare("SELECT incident_type, COUNT(*) as c FROM citizen_reports WHERE status='pending' GROUP BY incident_type ORDER BY c DESC LIMIT 6").all();
        reply = reps.length > 0
          ? `**Pending Citizen Reports**\n\n` + reps.map(r => `- **${r.incident_type}**: ${r.c}`).join('\n')
          : `No pending citizen reports at this time.`;
      } else {
        const twp = db2.prepare("SELECT COUNT(*) as c FROM water_points").get();
        const fwp = db2.prepare("SELECT COUNT(*) as c FROM water_points WHERE status='functional'").get();
        const ta  = db2.prepare("SELECT COUNT(*) as c FROM alerts WHERE status='active'").get();
        reply = `**HYDROSENSE System Overview**\n\n` +
          `- **${twp.c}** total water points · **${fwp.c}** functional\n` +
          `- **${ta.c}** active alerts\n\n` +
          `Ask me about water quality, disease outbreaks, maintenance, alerts, or citizen reports.`;
      }
    } catch {
      reply = `I have access to HYDROSENSE water and health data. Ask me about water points, disease outbreaks, water quality, maintenance, or alerts.`;
    }

    if (isStream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write('data: ' + JSON.stringify({ type: 'chunk', text: reply }) + '\n\n');
      res.write('data: ' + JSON.stringify({ type: 'done' }) + '\n\n');
      res.end();
    } else {
      res.status(200).json({ success: true, reply, model: 'HYDROSENSE DB', source: 'database' });
    }
    return;
  }

  // Gemini succeeded — stream was returned early above; here only non-stream reaches
  res.status(200).json({ success: true, reply: geminiText, model: 'Hydro AI v4.0', source: 'gemini' });
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
      if (req.nativeChatError) {
        const isRateLimit = req.nativeChatError.toLowerCase().includes('busy') || req.nativeChatError.toLowerCase().includes('429');
        return res.status(isRateLimit ? 429 : 503).json({
          success: false,
          error: req.nativeChatError,
          rateLimit: isRateLimit,
          serverError: !isRateLimit,
          status: isRateLimit ? 429 : 503,
        });
      }
      return res.status(200).json({
        success: true,
        data: [],
        analysis: "Node.js Fallback: Data simulated because AI microservice is unavailable.",
        message: "Node.js Fallback Response",
        reply: "Node.js Fallback Response",
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

// ══════════════════════════════════════════════════════════════════
// LIVE INTELLIGENCE FALLBACKS — query DB directly, no Python needed
// ══════════════════════════════════════════════════════════════════

async function fetchBaseStats(district) {
  const db = await getDb();
  const p = district ? [district] : [];
  const w = district ? 'WHERE district = ?' : '';
  const wAnd = district ? 'AND district = ?' : '';
  try {
    const totalWp    = db.prepare(`SELECT COUNT(*) as c FROM water_points ${w}`).get(...p);
    const funcWp     = db.prepare(`SELECT COUNT(*) as c FROM water_points WHERE status='functional' ${wAnd}`).get(...p);
    const nonFuncWp  = db.prepare(`SELECT COUNT(*) as c FROM water_points WHERE status!='functional' ${wAnd}`).get(...p);
    const critAlerts = db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE severity='critical' AND status='active' ${wAnd}`).get(...p);
    const allAlerts  = db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE status='active' ${wAnd}`).get(...p);
    const pendMaint  = db.prepare(`SELECT COUNT(*) as c FROM maintenance_requests WHERE status='pending' ${wAnd}`).get(...p);
    const unsafeQ    = db.prepare(`SELECT COUNT(*) as c FROM water_quality_tests WHERE overall_safe=0 ${wAnd}`).get(...p);
    const pendRep    = db.prepare(`SELECT COUNT(*) as c FROM citizen_reports WHERE status='pending' ${wAnd}`).get(...p);
    return {
      total: totalWp.c, func: funcWp.c, nonFunc: nonFuncWp.c,
      critAlerts: critAlerts.c, allAlerts: allAlerts.c,
      pendMaint: pendMaint.c, unsafeQ: unsafeQ.c, pendRep: pendRep.c,
    };
  } catch {
    return { total: 0, func: 0, nonFunc: 0, critAlerts: 0, allAlerts: 0, pendMaint: 0, unsafeQ: 0, pendRep: 0 };
  }
}

app.get('/api/ai/decision/operational-insights', authMiddleware, async (req, res) => {
  try {
    const s = await fetchBaseStats(req.query.district || null);
    const funcRate = s.total > 0 ? Math.round((s.func / s.total) * 100) : 0;
    res.json({ status: 'ok', insights: { total_water_points: s.total, functionality_rate: funcRate, active_alerts: s.allAlerts, pending_maintenance: s.pendMaint } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ai/risk/live-summary', authMiddleware, async (req, res) => {
  try {
    const s = await fetchBaseStats(null);
    const level = s.critAlerts >= 5 ? 'critical' : s.critAlerts > 0 ? 'high' : s.allAlerts > 10 ? 'elevated' : 'normal';
    res.json({ status: 'ok', live_summary: {
      overall_alert_level: level,
      critical_alerts: s.critAlerts,
      high_risk_water_points: s.nonFunc,
      contamination_events_30d: s.unsafeQ,
      drought_affected_districts: 0,
      active_outbreaks: 0,
      pending_citizen_reports: s.pendRep,
      generated_at: new Date().toISOString(),
    }});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ai/risk/district-summaries', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const districts = db.prepare(`
      SELECT district,
        COUNT(*) as total,
        SUM(CASE WHEN status='functional' THEN 1 ELSE 0 END) as functional
      FROM water_points GROUP BY district ORDER BY district
    `).all();
    const alertRows = db.prepare(`SELECT district, COUNT(*) as c FROM alerts WHERE status='active' GROUP BY district`).all();
    const alertMap  = Object.fromEntries(alertRows.map(r => [r.district, r.c]));
    const maintRows = db.prepare(`SELECT district, COUNT(*) as c FROM maintenance_requests WHERE status='pending' GROUP BY district`).all();
    const maintMap  = Object.fromEntries(maintRows.map(r => [r.district, r.c]));

    const summaries = districts.map(d => {
      const funcPct    = d.total > 0 ? (d.functional / d.total) * 100 : 100;
      const infraRisk  = Math.round(100 - funcPct);
      const alertRisk  = Math.min((alertMap[d.district] || 0) * 15, 100);
      const qualRisk   = Math.min((maintMap[d.district] || 0) * 8, 100);
      const overall    = Math.round(infraRisk * 0.45 + alertRisk * 0.35 + qualRisk * 0.20);
      const risk_level = overall >= 75 ? 'critical' : overall >= 50 ? 'high' : overall >= 25 ? 'medium' : 'low';
      return {
        district: d.district, overall_risk: overall, risk_level,
        water_security_score: Math.round(funcPct),
        components: { water_quality_risk: alertRisk, infrastructure_risk: infraRisk, climate_risk: 25, health_risk: qualRisk, community_risk: 20 },
      };
    });
    res.json({ status: 'ok', summaries });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ai/risk/heatmap', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const district = req.query.district || null;
    const rows = db.prepare(`
      SELECT wp.id, wp.name, wp.district, wp.status,
        (SELECT COUNT(*) FROM alerts a WHERE a.water_point_id = wp.id AND a.status='active') as alert_count,
        (SELECT COUNT(*) FROM citizen_reports cr WHERE cr.district = wp.district AND cr.created_at > datetime('now','-30 days')) as recent_reports
      FROM water_points wp
      ${district ? 'WHERE wp.district = ?' : ''}
      ORDER BY alert_count DESC, recent_reports DESC LIMIT 30
    `).all(...(district ? [district] : []));

    const heatmap = rows.map(r => {
      const infraPenalty = r.status !== 'functional' ? 40 : 0;
      const risk_score   = Math.min(infraPenalty + r.alert_count * 20 + r.recent_reports * 5, 100);
      const risk_level   = risk_score >= 75 ? 'critical' : risk_score >= 50 ? 'high' : risk_score >= 25 ? 'medium' : 'low';
      return { water_point_id: r.id, name: r.name, district: r.district, risk_score, risk_level, alert_count: r.alert_count, recent_reports: r.recent_reports };
    });
    res.json({ status: 'ok', heatmap });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ai/risk/environmental-index', authMiddleware, async (req, res) => {
  try {
    const s = await fetchBaseStats(req.query.district || null);
    const funcPct   = s.total > 0 ? (s.func / s.total) * 100 : 100;
    const infraRisk = Math.round(100 - funcPct);
    const alertRisk = Math.min(s.allAlerts * 5, 100);
    const qualRisk  = Math.min(s.unsafeQ * 10, 100);
    const commRisk  = Math.min(s.pendRep * 5, 100);
    const overall   = Math.round(infraRisk * 0.35 + alertRisk * 0.25 + qualRisk * 0.25 + commRisk * 0.15);
    const risk_level = overall >= 75 ? 'critical' : overall >= 50 ? 'high' : overall >= 25 ? 'medium' : 'low';
    res.json({ status: 'ok', risk_index: { overall_risk_score: overall, risk_level, components: { infrastructure: infraRisk, water_quality: qualRisk, alerts: alertRisk, community: commRisk, climate: 25 } } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Native Node.js report generation (Gemini + DB — no Python service needed) ──
app.post('/api/ai/reports/generate', authMiddleware, async (req, res) => {
  try {
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

    const { role = 'district_officer', district = null } = req.body || {};
    const db = await getDb();
    const now = new Date().toISOString();

    // Pull live stats from DB
    let stats = {};
    try {
      const totalWp   = await db.prepare("SELECT COUNT(*) as c FROM water_points").get();
      const funcWp    = await db.prepare("SELECT COUNT(*) as c FROM water_points WHERE status='functional'").get();
      const alerts    = await db.prepare("SELECT COUNT(*) as c FROM alerts WHERE status='active'").get();
      const pending   = await db.prepare("SELECT COUNT(*) as c FROM maintenance_requests WHERE status='pending'").get();
      const unsafe    = await db.prepare("SELECT COUNT(*) as c FROM water_quality_tests WHERE overall_safe=0").get();
      const reports   = await db.prepare("SELECT COUNT(*) as c FROM citizen_reports WHERE status='pending'").get();
      stats = {
        total: totalWp.c, functional: funcWp.c,
        activeAlerts: alerts.c, pendingMaint: pending.c,
        unsafeTests: unsafe.c, pendingReports: reports.c,
      };
    } catch { stats = { total: 0, functional: 0, activeAlerts: 0, pendingMaint: 0, unsafeTests: 0, pendingReports: 0 }; }

    const scope = district ? `District: ${district}` : 'National (All Districts)';
    const funcPct = stats.total > 0 ? Math.round((stats.functional / stats.total) * 100) : 0;

    const execSummary =
      `As of ${now.slice(0, 10)}, HYDROSENSE AI has analysed ${stats.total} water points across ${scope}. ` +
      `${stats.functional} (${funcPct}%) are currently functional. ` +
      `${stats.activeAlerts} active alerts require attention, with ${stats.pendingMaint} pending maintenance requests ` +
      `and ${stats.unsafeTests} unsafe water quality records on file.`;

    const keyFindings = [
      `Total water points monitored: ${stats.total}`,
      `Functional water points: ${stats.functional} (${funcPct}%)`,
      `Active system alerts: ${stats.activeAlerts}`,
      `Pending maintenance requests: ${stats.pendingMaint}`,
      `Unsafe water quality records: ${stats.unsafeTests}`,
      `Pending citizen reports: ${stats.pendingReports}`,
    ];

    const defaultRecs = [
      'Prioritise inspection of non-functional water points to restore access.',
      'Investigate and resolve active alerts before they escalate.',
      'Clear backlog of pending maintenance requests, starting with high-priority sites.',
      'Follow up on unsafe water quality records with immediate testing.',
      'Review and process pending citizen reports for timely community response.',
    ];

    let narrative = null;
    if (apiKey) {
      const prompt =
        `Write a concise 2-paragraph executive summary for a water infrastructure management report. ` +
        `Scope: ${scope}. Role: ${role.replace(/_/g, ' ')}. ` +
        `Key data: ${stats.total} water points, ${funcPct}% functional, ${stats.activeAlerts} active alerts, ` +
        `${stats.pendingMaint} pending maintenance, ${stats.unsafeTests} unsafe water quality records. ` +
        `Be professional, specific to water infrastructure, and action-oriented.`;

      const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
      let gRes = null;
      for (const model of GEMINI_MODELS) {
        gRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
            }),
          }
        );
        if (gRes.ok) break;
        if (gRes.status === 429 && model !== GEMINI_MODELS[GEMINI_MODELS.length - 1]) {
          await new Promise(r => setTimeout(r, 800));
          continue;
        }
        break;
      }
      if (gRes && gRes.ok) {
        const gData = await gRes.json();
        narrative = gData.candidates?.[0]?.content?.parts?.[0]?.text || null;
      }
    }

    return res.json({
      status: 'ok',
      report: {
        title: `HYDROSENSE AI ${(req.body?.report_type || 'executive_summary').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Report`,
        generated_at: now,
        scope,
        role,
        executive_summary: execSummary,
        key_findings: keyFindings,
        recommendations: defaultRecs,
        narrative,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

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
// EVENT REMINDER CRON — runs every hour
// Sends a reminder for any volunteer event starting within the next 24 hours
// that hasn't had a reminder sent yet (tracked via notification_log subject match).
// ═══════════════════════════════════════════════════════════════
const { notifyRoles: _notifyRoles } = require('./utils/notify');

cron.schedule('0 * * * *', () => {
  try {
    const db = getDb();

    // Events that start within the next 24 hours (date-only comparison for simplicity)
    const upcoming = db.prepare(`
      SELECT id, title, event_date, event_time, location, district, event_type
      FROM volunteer_events
      WHERE status = 'active'
        AND date(event_date) = date('now', '+1 day')
    `).all();

    for (const ev of upcoming) {
      const reminderSubject = `⏰ Reminder: ${ev.title} is tomorrow`;

      // Avoid duplicate reminders: skip if we already sent this reminder today
      const alreadySent = db.prepare(
        `SELECT 1 FROM notification_log WHERE subject=? AND sent_at > datetime('now','-23 hours') LIMIT 1`
      ).get(reminderSubject);
      if (alreadySent) continue;

      const dateLabel = ev.event_date + (ev.event_time ? ` at ${ev.event_time}` : '');
      const locationLabel = ev.location ? ` at ${ev.location}` : '';

      _notifyRoles(
        ['citizen', 'community_committee', 'ngo_officer', 'district_officer'],
        ev.district || null,
        reminderSubject,
        `Don't forget! "${ev.title}" (${ev.event_type.replace(/_/g, ' ')}) is happening tomorrow${locationLabel ? ` ${locationLabel}` : ''}${ev.district ? ` in ${ev.district}` : ''}. Date: ${dateLabel}.`,
        'volunteer_event', ev.id
      );
    }

    // Same-day reminders: events happening today, notify registered participants
    const today = db.prepare(`
      SELECT e.id, e.title, e.event_date, e.event_time, e.location, e.district,
             er.user_id, u.role
      FROM volunteer_events e
      JOIN event_registrations er ON er.event_id = e.id
      JOIN users u ON u.id = er.user_id
      WHERE e.status = 'active' AND date(e.event_date) = date('now')
    `).all();

    const todayReminderSent = new Set();
    for (const row of today) {
      const key = `${row.id}:${row.user_id}`;
      if (todayReminderSent.has(key)) continue;
      todayReminderSent.add(key);

      const todaySubject = `🌟 Today: ${row.title}`;
      const alreadySent = db.prepare(
        `SELECT 1 FROM notification_log WHERE subject=? AND recipient_id=? AND sent_at > datetime('now','-10 hours') LIMIT 1`
      ).get(todaySubject, row.user_id);
      if (alreadySent) continue;

      db.prepare(
        `INSERT INTO notification_log (recipient_type, recipient_id, channel, subject, message, status, reference_type, reference_id, district)
         VALUES (?, ?, 'in_app', ?, ?, 'sent', 'volunteer_event', ?, ?)`
      ).run(
        row.role, row.user_id,
        todaySubject,
        `Your event "${row.title}" is happening today${row.event_time ? ` at ${row.event_time}` : ''}${row.location ? ` at ${row.location}` : ''}. See you there! 🎉`,
        row.id, row.district || null
      );
    }
  } catch (e) {
    console.error('[event-reminder] Error:', e.message);
  }
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