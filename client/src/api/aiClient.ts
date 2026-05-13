import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';

const AI_BASE = '';

const ai: AxiosInstance = axios.create({
  baseURL: AI_BASE,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

interface PendingRequest {
  promise: Promise<any>;
  controller: AbortController;
  timestamp: number;
  retryCount: number;
}

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

const pendingRequests = new Map<string, PendingRequest>();
const responseCache = new Map<string, CacheEntry>();
const FAILED_REQUEST_QUEUE: Array<{ key: string; factory: () => Promise<any>; timestamp: number }> = [];
const NETWORK_LATENCY_SAMPLES: number[] = [];
const MAX_LATENCY_SAMPLES = 50;
const DEFAULT_CACHE_TTL = 15000;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000;
const FAILED_REQUEST_TTL = 300000;

let isOnline = navigator.onLine;
let networkQuality: 'offline' | 'poor' | 'moderate' | 'good' = 'good';

function isWeakNetwork(): boolean {
  return networkQuality === 'poor' || networkQuality === 'offline';
}

function updateNetworkQuality() {
  if (!isOnline) {
    networkQuality = 'offline';
    return;
  }
  const samples = NETWORK_LATENCY_SAMPLES;
  if (samples.length < 3) {
    networkQuality = 'good';
    return;
  }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (avg > 3000) networkQuality = 'poor';
  else if (avg > 1000) networkQuality = 'moderate';
  else networkQuality = 'good';
}

window.addEventListener('online', () => {
  isOnline = true;
  updateNetworkQuality();
  processFailedQueue();
});

window.addEventListener('offline', () => {
  isOnline = false;
  networkQuality = 'offline';
});

function recordLatency(ms: number) {
  NETWORK_LATENCY_SAMPLES.push(ms);
  if (NETWORK_LATENCY_SAMPLES.length > MAX_LATENCY_SAMPLES) {
    NETWORK_LATENCY_SAMPLES.shift();
  }
  updateNetworkQuality();
}

function cacheKey(method: string, url: string, data?: any): string {
  return `${method}:${url}:${data ? JSON.stringify(data) : ''}`;
}

function getFromCache(key: string): any | null {
  const entry = responseCache.get(key);
  if (entry && Date.now() - entry.timestamp < entry.ttl) return entry.data;
  responseCache.delete(key);
  return null;
}

function setCache(key: string, data: any, ttl: number = DEFAULT_CACHE_TTL) {
  responseCache.set(key, { data, timestamp: Date.now(), ttl });
}

async function dedupRequest<T>(
  key: string,
  factory: (signal: AbortSignal) => Promise<T>,
  ttl?: number,
): Promise<T> {
  const existing = pendingRequests.get(key);
  if (existing && Date.now() - existing.timestamp < 5000) {
    return existing.promise as Promise<T>;
  }
  const controller = new AbortController();
  const promise = factory(controller.signal);
  pendingRequests.set(key, { promise, controller, timestamp: Date.now(), retryCount: 0 });
  try {
    const result = await promise;
    if (ttl) setCache(key, result, ttl);
    return result;
  } finally {
    pendingRequests.delete(key);
  }
}

export function cancelPendingRequest(key: string) {
  const existing = pendingRequests.get(key);
  if (existing) {
    existing.controller.abort();
    pendingRequests.delete(key);
  }
}

export function clearAICache() {
  responseCache.clear();
  for (const [, req] of pendingRequests) {
    req.controller.abort();
  }
  pendingRequests.clear();
  FAILED_REQUEST_QUEUE.length = 0;
}

export function getNetworkQuality(): string {
  return networkQuality;
}

const AI_DIAGNOSTICS = {
  requests: [] as { id: string; url: string; start: number; duration: number; status: string }[],
  maxLogSize: 200,
};

function logRequest(id: string, url: string, start: number, status: string) {
  AI_DIAGNOSTICS.requests.push({ id, url, start, duration: Date.now() - start, status });
  if (AI_DIAGNOSTICS.requests.length > AI_DIAGNOSTICS.maxLogSize) {
    AI_DIAGNOSTICS.requests.shift();
  }
}

export function getAIDiagnostics() {
  return {
    ...AI_DIAGNOSTICS,
    cacheSize: responseCache.size,
    pendingSize: pendingRequests.size,
    failedQueueSize: FAILED_REQUEST_QUEUE.length,
    networkQuality,
    isOnline,
    avgLatency: NETWORK_LATENCY_SAMPLES.length > 0
      ? Math.round(NETWORK_LATENCY_SAMPLES.reduce((a, b) => a + b, 0) / NETWORK_LATENCY_SAMPLES.length)
      : 0,
  };
}

export interface AIHealthResponse {
  status: string;
  service: string;
  version: string;
  uptime_seconds: number;
  database_connected: boolean;
  gemini_configured: boolean;
  mode: string;
  initialized: boolean;
  active_requests: number;
  connection_state: string;
  session_id: string;
  capabilities: string[];
}

export interface AIPrediction {
  water_point_id: number;
  name: string;
  type: string;
  status: string;
  district: string;
  failure_risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  days_to_failure: number | null;
  recommendation: string;
  beneficiaries: number;
  infrastructure_score: number;
  pending_repairs: number;
}

export interface AIAnomaly {
  sensor_id: number;
  sensor_name: string;
  sensor_type: string;
  water_point: string;
  district: string;
  current_value: number;
  expected_mean: number;
  unit: string;
  z_score: number;
  direction: 'above' | 'below';
  severity: 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
  detected_at: string;
}

export interface AISmartAlert {
  type: string;
  severity: string;
  title: string;
  message: string;
  district: string;
  water_point: string;
  score: number;
  source: string;
  generated_at: string;
}

export interface AIForecastMonth {
  month: string;
  predicted_rainfall_mm: number;
  predicted_spi: number;
  drought_risk: string;
  confidence: number;
}

export interface AIClimateForecast {
  summary: {
    avg_spi: number;
    avg_rainfall_mm: number;
    avg_temp_max_c: number;
    spi_trend: string;
    outlook: string;
  };
  forecast: AIForecastMonth[];
  recommendations: string[];
}

export interface AIDashboard {
  role: string;
  district: string | null;
  generated_at: string;
  system_stats: {
    total_water_points: number;
    functional_points: number;
    active_alerts: number;
    pending_maintenance: number;
  };
  ai_summary: {
    critical_failure_risk: number;
    high_failure_risk: number;
    contamination_hotspots: number;
    sensor_anomalies: number;
    smart_alerts_generated: number;
  };
  top_predictions: AIPrediction[];
  anomalies: AIAnomaly[];
  smart_alerts: AISmartAlert[];
  climate_outlook: any;
  ai_recommendations: string[];
  district_risk_summary?: Array<{
    district: string;
    total: number;
    critical: number;
    high: number;
    avg_score: number;
  }>;
}

ai.interceptors.request.use(config => {
  const token = localStorage.getItem('hs_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const params = config.params || {};
  const requestId = `fe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  config.headers['X-Request-ID'] = requestId;
  (config as any)._requestId = requestId;

  if (isWeakNetwork()) {
    if (!config.timeout || config.timeout < 120000) config.timeout = 120000;
    if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
      try {
        const str = JSON.stringify(config.data);
        if (str.length > 1000) {
          (config as any)._compressed = true;
        }
      } catch {}
    }
  }
  return config;
});

ai.interceptors.response.use(
  res => {
    const duration = Date.now() - (res.config as any).__startTime || 0;
    recordLatency(duration);
    return res;
  },
  (error: AxiosError) => {
    if (error.code === 'ERR_CANCELED') {
      return Promise.reject({ cancelled: true, message: 'Request cancelled' });
    }
    if (error.code === 'ECONNABORTED') {
      return Promise.reject({ timeout: true, message: 'Request timed out' });
    }
    if (!error.response) {
      return Promise.reject({ network: true, message: 'Network error - AI service unreachable', retryable: true });
    }
    const status = error.response.status;
    if (status === 429) {
      return Promise.reject({ rateLimit: true, message: 'AI rate limit exceeded', retryAfter: 30000, retryable: true });
    }
    if (status >= 500) {
      return Promise.reject({ serverError: true, status, message: `AI server error (${status})`, retryable: true });
    }
    return Promise.reject(error);
  },
);

function calculateBackoff(attempt: number): number {
  const delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
  return delay + Math.random() * 1000;
}

function isRetryable(error: any): boolean {
  return error?.retryable || error?.timeout || error?.network || error?.serverError;
}

async function withAdaptiveRetry<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = calculateBackoff(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (err.cancelled) throw err;
      if (attempt < maxRetries && isRetryable(err)) {
        continue;
      }
      if (err.network) {
        queueFailedRequest(context, fn);
      }
      throw err;
    }
  }
  throw lastError;
}

function queueFailedRequest(key: string, factory: () => Promise<any>) {
  FAILED_REQUEST_QUEUE.push({ key, factory, timestamp: Date.now() });
  while (FAILED_REQUEST_QUEUE.length > 50) FAILED_REQUEST_QUEUE.shift();
}

async function processFailedQueue() {
  if (!isOnline || FAILED_REQUEST_QUEUE.length === 0) return;
  const batch = [...FAILED_REQUEST_QUEUE];
  FAILED_REQUEST_QUEUE.length = 0;
  for (const item of batch) {
    if (Date.now() - item.timestamp > FAILED_REQUEST_TTL) continue;
    try {
      await item.factory();
    } catch {}
  }
}

export async function getAIHealth(): Promise<{ data: AIHealthResponse }> {
  return withAdaptiveRetry(
    () => ai.get('/ai/health', { timeout: 10000 }),
    '/ai/health',
    2,
  );
}

export async function getFailurePredictions(district?: string) {
  const key = cacheKey('GET', '/ai/predictions/failure', { district });
  const cached = getFromCache(key);
  if (cached) return cached;
  return dedupRequest(
    key,
    signal => withAdaptiveRetry(
      () => ai.get('/ai/predictions/failure', { params: district ? { district } : {}, signal }),
      '/ai/predictions/failure',
    ),
    30000,
  );
}

export async function getMaintenancePredictions(district?: string) {
  const key = cacheKey('GET', '/ai/predictions/maintenance', { district });
  const cached = getFromCache(key);
  if (cached) return cached;
  return dedupRequest(
    key,
    signal => withAdaptiveRetry(
      () => ai.get('/ai/predictions/maintenance', { params: district ? { district } : {}, signal }),
      '/ai/predictions/maintenance',
    ),
    30000,
  );
}

export async function getContaminationRisk(district?: string) {
  return dedupRequest(
    cacheKey('GET', '/ai/predictions/contamination', { district }),
    signal => withAdaptiveRetry(
      () => ai.get('/ai/predictions/contamination', { params: district ? { district } : {}, signal }),
      '/ai/predictions/contamination',
    ),
    30000,
  );
}

export async function getAnomalies(district?: string) {
  return dedupRequest(
    cacheKey('GET', '/ai/anomalies', { district }),
    signal => withAdaptiveRetry(
      () => ai.get('/ai/anomalies', { params: district ? { district } : {}, signal }),
      '/ai/anomalies',
    ),
    30000,
  );
}

export async function getAIClimateForecast(district?: string) {
  return dedupRequest(
    cacheKey('GET', '/ai/climate/forecast', { district }),
    signal => withAdaptiveRetry(
      () => ai.get('/ai/climate/forecast', { params: district ? { district } : {}, signal }),
      '/ai/climate/forecast',
    ),
    60000,
  );
}

export async function getSmartAlerts(district?: string) {
  return dedupRequest(
    cacheKey('GET', '/ai/smart-alerts', { district }),
    signal => withAdaptiveRetry(
      () => ai.get('/ai/smart-alerts', { params: district ? { district } : {}, signal }),
      '/ai/smart-alerts',
    ),
    15000,
  );
}

export async function getAIDashboard(role: string, district?: string) {
  return dedupRequest(
    cacheKey('GET', `/ai/dashboard/${role}`, { district }),
    signal => withAdaptiveRetry(
      () => ai.get(`/ai/dashboard/${role}`, { params: district ? { district } : {}, signal }),
      `/ai/dashboard/${role}`,
    ),
    30000,
  );
}

interface ChatMessage {
  role: string;
  content: string;
}

export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
  role: string,
  district?: string,
  imageBase64?: string,
  imageMime?: string,
  conversationId?: number,
  signal?: AbortSignal,
) {
  const startTime = Date.now();
  const payload = {
    message,
    history,
    role,
    district: district || null,
    image_data: imageBase64 || null,
    image_mime: imageMime || null,
    conversation_id: conversationId || null,
  };
  const reqKey = cacheKey('POST', '/ai/chat', payload);
  const cached = getFromCache(reqKey);
  if (cached) return cached;

  try {
    const res = await withAdaptiveRetry(
      () => {
        const config: AxiosRequestConfig = {
          signal,
          timeout: isWeakNetwork() ? 180000 : 120000,
          headers: isWeakNetwork() ? { 'X-Network-Quality': networkQuality } : {},
        };
        (config as any).__startTime = Date.now();
        return ai.post('/ai/chat', payload, config);
      },
      '/ai/chat',
      2,
    );
    logRequest(`chat_${Date.now()}`, '/ai/chat', startTime, 'success');
    setCache(reqKey, res, 5000);
    return res;
  } catch (err) {
    logRequest(`chat_${Date.now()}`, '/ai/chat', startTime, 'error');
    throw err;
  }
}

export async function sendChatMessageStream(
  message: string,
  history: ChatMessage[],
  role: string,
  district?: string,
  imageBase64?: string,
  imageMime?: string,
  conversationId?: number,
  onChunk?: (text: string) => void,
  onDone?: (fullText: string) => void,
  onError?: (error: any) => void,
  signal?: AbortSignal,
): Promise<void> {
  const controller = new AbortController();
  const combinedSignal = signal ? combineAbortSignals(signal, controller.signal) : controller.signal;

  const payload = {
    message,
    history,
    role,
    district: district || null,
    image_data: imageBase64 || null,
    image_mime: imageMime || null,
    conversation_id: conversationId || null,
  };

  const streamRequestId = `fe_stream_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    const response = await fetch('/ai/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': streamRequestId },
      body: JSON.stringify(payload),
      signal: combinedSignal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No reader available');

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const data = JSON.parse(jsonStr);
            if (data.type === 'chunk' && data.text) {
              fullText += data.text;
              onChunk?.(data.text);
            } else if (data.type === 'done') {
              onDone?.(fullText || data.full_text || '');
              return;
            } else if (data.type === 'error') {
              onError?.(new Error(data.message || 'Stream error'));
              return;
            } else if (data.type === 'fallback') {
              onDone?.(data.text || '');
              return;
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }
    }
    onDone?.(fullText);
  } catch (err: any) {
    if (err.name === 'AbortError') return;
    if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
      onError?.({ network: true, message: 'AI service unreachable', retryable: true });
      return;
    }
    onError?.(err);
  }
}

export async function generateAIReport(reportType: string, role: string, district?: string) {
  return ai.post('/ai/reports/generate', { report_type: reportType, role, district: district || null });
}

export async function getPrioritizedIncidents(limit?: number) {
  return ai.get('/ai/decision/prioritize-incidents', { params: { limit } });
}

export async function getResponseStrategy(
  incidentType: string,
  severity: string,
  district: string,
  affectedPopulation?: number,
) {
  return ai.get('/ai/decision/response-strategy', {
    params: { incident_type: incidentType, severity, district, affected_population: affectedPopulation || 0 },
  });
}

export const postAutoAssign = (incident: object) => ai.post('/ai/decision/auto-assign', { incident });
export const postEscalate = (incident: object) => ai.post('/ai/decision/escalate', { incident });

export async function getOperationalInsights(district?: string) {
  return ai.get('/ai/decision/operational-insights', { params: district ? { district } : {} });
}

export async function getRiskHeatmap(district?: string) {
  return ai.get('/ai/risk/heatmap', { params: district ? { district } : {} });
}

export async function getEnvironmentalRiskIndex(district?: string) {
  return ai.get('/ai/risk/environmental-index', { params: district ? { district } : {} });
}

export async function getWaterSecurityScore(district?: string) {
  return ai.get('/ai/risk/water-security', { params: district ? { district } : {} });
}

export const getLiveRiskSummary = () => ai.get('/ai/risk/live-summary');
export const getDistrictRiskSummaries = () => ai.get('/ai/risk/district-summaries');
export const analyzeImage = (data: string, context: string, text: string) => ai.post('/ai/analyze/image', { data, context, text });
export const analyzeDocument = (text: string, context?: string) => ai.post('/ai/analyze/document', { text, context });
export const analyzeSMS = (text: string) => ai.post('/ai/analyze/sms', { text });
export const analyzeWhatsApp = (text: string, context?: string) => ai.post('/ai/analyze/whatsapp', { text, context });
export const analyzeSatellite = (text: string, context?: string) => ai.post('/ai/analyze/satellite', { text, context });
export const classifyPollution = (description: string, imageAnalysis?: string) =>
  ai.post('/ai/analyze/pollution-classify', { description, image_analysis: imageAnalysis || '' });
export const verifyReport = (reportText: string, imageAnalysis?: string, locationData?: object) =>
  ai.post('/ai/analyze/verify-report', { report_text: reportText, image_analysis: imageAnalysis || '', location_data: locationData || null });
export const getAgencyCoordination = (incidentId?: number) =>
  ai.get('/ai/agency/coordination', { params: incidentId ? { incident_id: incidentId } : {} });
export const createAIServiceConversation = (title: string, userId: number, role: string, district?: string, category?: string) =>
  ai.post('/ai/conversations/create', { title, user_id: userId, role, district, category }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
export const getConversationContext = (conversationId: number) => ai.get(`/ai/conversations/${conversationId}/context`);
export const summarizeAIConversation = (conversationId: number) => ai.post(`/ai/conversations/${conversationId}/summarize`);
export const logAIDecision = (data: object) => ai.post('/ai/decision/log', data);
export const getAIDiagnosticsReport = () => ai.get('/ai/diagnostics/report');
export const getAISystemPing = () => ai.get('/ai/system/ping');

function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

export default ai;
