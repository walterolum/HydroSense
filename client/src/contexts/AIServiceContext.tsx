import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { getAIHealth, getAIDiagnostics, getNetworkQuality } from '../api/aiClient';

export type AIStatus = 'idle' | 'thinking' | 'processing' | 'responding' | 'completed' | 'reconnecting' | 'offline' | 'error';

export interface AIRequestState {
  id: string;
  status: 'pending' | 'processing' | 'responding' | 'completed' | 'failed' | 'timeout';
  startTime: number;
  duration: number | null;
  retryCount: number;
  message: string;
}

type NetworkQuality = 'offline' | 'poor' | 'moderate' | 'good';

interface AIServiceContextType {
  status: AIStatus;
  aiOnline: boolean;
  error: string | null;
  lastChecked: Date | null;
  checkNow: () => Promise<void>;
  capabilities: string[];
  retryCount: number;
  latency: number | null;
  statusMessage: string;
  activeRequest: AIRequestState | null;
  requestHistory: AIRequestState[];
  diagnostics: () => any;
  setAIStatus: (status: AIStatus, message?: string) => void;
  startRequest: (message: string) => string;
  updateRequest: (id: string, status: AIRequestState['status']) => void;
  completeRequest: (id: string) => void;
  failRequest: (id: string, reason?: string) => void;
  networkQuality: NetworkQuality;
  sessionId: string;
}

const AIServiceContext = createContext<AIServiceContextType | null>(null);

const AI_HEALTH_URLS = ['/api/ai/health'];
const FAST_POLL_MS = 20000;
const SLOW_POLL_MS = 45000;
const OFFLINE_THRESHOLD = 3;
const HEALTH_TIMEOUT_MS = 35000;
const MAX_BACKOFF_MS = 90000;
const RECOVERY_GRACE_MS = 5000;
const STALL_DETECTION_MS = 30000;

const STATUS_MESSAGES: Record<AIStatus, string> = {
  idle: 'Hydro AI Online',
  thinking: 'Processing Environmental Insights',
  processing: 'Processing Environmental Insights',
  responding: 'Processing Environmental Insights',
  completed: 'Environmental Intelligence Active',
  reconnecting: 'Reconnecting to AI Service...',
  offline: 'AI Service Offline',
  error: 'AI Service Error',
};

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function AIServiceProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AIStatus>('idle');
  const [aiOnline, setAiOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);
  const [activeRequest, setActiveRequest] = useState<AIRequestState | null>(null);
  const [requestHistory, setRequestHistory] = useState<AIRequestState[]>([]);
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>('good');

  const statusRef = useRef<AIStatus>('idle');
  const aiOnlineRef = useRef(false);
  const retryRef = useRef(0);
  const isChecking = useRef(false);
  const wasOnlineRef = useRef(false);
  const requestCounter = useRef(0);
  const pendingRequestsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const healthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const activeRequestRef = useRef<AIRequestState | null>(null);
  const capabilitiesRef = useRef<string[]>([]);
  const latencyRef = useRef<number | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef(generateSessionId());
  const firstCheckDoneRef = useRef(false);

  const syncRefs = useCallback(() => {
    statusRef.current = status;
    aiOnlineRef.current = aiOnline;
    activeRequestRef.current = activeRequest;
    capabilitiesRef.current = capabilities;
    latencyRef.current = latency;
  }, [status, aiOnline, activeRequest, capabilities, latency]);

  useEffect(() => { syncRefs(); }, [syncRefs]);

  const getStatusMessage = useCallback((): string => {
    return STATUS_MESSAGES[statusRef.current] || STATUS_MESSAGES.idle;
  }, []);

  const setAIStatus = useCallback((newStatus: AIStatus, message?: string) => {
    setStatus(newStatus);
    if (newStatus === 'completed') {
      setTimeout(() => {
        setStatus(prev => prev === 'completed' ? 'idle' : prev);
      }, 3000);
    }
  }, []);

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const startStallTimer = useCallback((requestId: string) => {
    clearStallTimer();
    stallTimerRef.current = setTimeout(() => {
      const current = activeRequestRef.current;
      if (current && current.id === requestId && current.status === 'processing') {
        setActiveRequest(prev => prev?.id === requestId ? { ...prev, status: 'timeout', duration: Date.now() - prev.startTime } : prev);
        setStatus('idle');
      }
    }, STALL_DETECTION_MS);
  }, [clearStallTimer]);

  const startRequest = useCallback((message: string): string => {
    requestCounter.current++;
    const id = `req_${Date.now()}_${requestCounter.current}`;
    const request: AIRequestState = {
      id, status: 'pending', startTime: Date.now(),
      duration: null, retryCount: 0, message: message.slice(0, 100),
    };
    setActiveRequest(request);
    activeRequestRef.current = request;
    setStatus('thinking');
    return id;
  }, []);

  const updateRequest = useCallback((id: string, state: AIRequestState['status']) => {
    setActiveRequest(prev => {
      if (prev?.id !== id) return prev;
      const updated = { ...prev, status: state };
      if (state === 'processing') {
        setStatus('processing');
        startStallTimer(id);
      }
      if (state === 'responding') {
        setStatus('responding');
        clearStallTimer();
      }
      return updated;
    });
  }, [clearStallTimer, startStallTimer]);

  const completeRequest = useCallback((id: string) => {
    clearStallTimer();
    setActiveRequest(prev => {
      if (prev?.id !== id) return prev;
      const completed: AIRequestState = { ...prev, status: 'completed', duration: Date.now() - prev.startTime };
      setRequestHistory(hist => [completed, ...hist].slice(0, 50));
      return completed;
    });
    setStatus('completed');
  }, [clearStallTimer]);

  const failRequest = useCallback((id: string, reason?: string) => {
    clearStallTimer();
    setActiveRequest(prev => {
      if (prev?.id !== id) return prev;
      const failed: AIRequestState = { ...prev, status: 'failed', duration: Date.now() - prev.startTime };
      setRequestHistory(hist => [failed, ...hist].slice(0, 50));
      return failed;
    });
    if (reason) setError(reason);
    setStatus(aiOnlineRef.current ? 'idle' : 'offline');
  }, [clearStallTimer]);

  const handleDegraded = useCallback(() => {
    retryRef.current++;
    const rc = retryRef.current;
    setRetryCount(rc);
    setCapabilities([]);
    setLastChecked(new Date());

    if (wasOnlineRef.current && rc === 1) {
      setStatus('reconnecting');
      setError(null);
    }

    if (rc <= OFFLINE_THRESHOLD) {
      setAiOnline(false);
      aiOnlineRef.current = false;
      setStatus('reconnecting');
    } else {
      setAiOnline(false);
      aiOnlineRef.current = false;
      setStatus('offline');
    }
  }, []);

  const performHealthCheck = useCallback(async () => {
    if (!mountedRef.current || isChecking.current) return;
    isChecking.current = true;

    const tryUrl = async (url: string): Promise<{ ok: boolean; data?: any; latency?: number }> => {
      try {
        const start = performance.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        clearTimeout(timeoutId);
        const ms = Math.round(performance.now() - start);
        setLatency(ms);
        latencyRef.current = ms;

        if (res.ok) {
          const data = await res.json();
          return { ok: true, data, latency: ms };
        }
      } catch {}
      return { ok: false };
    };

    let success = false;
    let healthData: any = null;
    let responseLatency = 0;

    for (const url of AI_HEALTH_URLS) {
      const result = await tryUrl(url);
      if (result.ok) {
        success = true;
        healthData = result.data;
        responseLatency = result.latency || 0;
        break;
      }
    }

    if (success && healthData) {
      const currentStatus = statusRef.current;
      const wasRecovering = currentStatus === 'reconnecting' || currentStatus === 'offline' || currentStatus === 'error';

      setAiOnline(true);
      aiOnlineRef.current = true;
      setError(null);
      setCapabilities(healthData.capabilities || []);
      capabilitiesRef.current = healthData.capabilities || [];
      setLastChecked(new Date());

      retryRef.current = 0;
      setRetryCount(0);
      wasOnlineRef.current = true;

      if (healthData.session_id) {
        sessionIdRef.current = healthData.session_id;
      }

      if (wasRecovering && !activeRequestRef.current) {
        if (responseLatency > 2000) {
          setTimeout(() => { if (mountedRef.current) { setStatus('idle'); } }, RECOVERY_GRACE_MS);
        } else {
          setStatus('idle');
        }
      }

      if (!wasRecovering && currentStatus === 'idle' && firstCheckDoneRef.current) {
      }
    } else {
      handleDegraded();
    }

    isChecking.current = false;
    firstCheckDoneRef.current = true;

    const nextRetryCount = retryRef.current;
    const delay = nextRetryCount > OFFLINE_THRESHOLD
      ? SLOW_POLL_MS
      : Math.min(FAST_POLL_MS + (nextRetryCount * 3000), MAX_BACKOFF_MS);

    healthTimerRef.current = setTimeout(() => { performHealthCheck(); }, delay);
  }, [handleDegraded]);

  const checkNow = useCallback(async () => {
    retryRef.current = 0;
    setRetryCount(0);
    if (healthTimerRef.current) {
      clearTimeout(healthTimerRef.current);
      healthTimerRef.current = null;
    }
    await performHealthCheck();
  }, [performHealthCheck]);

  const diagnostics = useCallback(() => {
    return {
      status: statusRef.current,
      aiOnline: aiOnlineRef.current,
      latency: latencyRef.current,
      retryCount: retryRef.current,
      activeRequest: activeRequestRef.current,
      requestHistory: requestHistory.slice(0, 20),
      pendingRequests: pendingRequestsRef.current.size,
      lastChecked,
      capabilities: capabilitiesRef.current,
      aiClient: getAIDiagnostics(),
      networkQuality: getNetworkQuality(),
      sessionId: sessionIdRef.current,
    };
  }, [lastChecked, requestHistory]);

  const updateNetworkQuality = useCallback(() => {
    const q = getNetworkQuality() as NetworkQuality;
    setNetworkQuality(q);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const nqInterval = setInterval(updateNetworkQuality, 10000);
    return () => {
      mountedRef.current = false;
      clearInterval(nqInterval);
      if (healthTimerRef.current) clearTimeout(healthTimerRef.current);
      for (const [, timeout] of pendingRequestsRef.current) clearTimeout(timeout);
      pendingRequestsRef.current.clear();
    };
  }, [updateNetworkQuality]);

  useEffect(() => {
    performHealthCheck();
  }, []);

  return (
    <AIServiceContext.Provider
      value={{
        status, aiOnline, error, lastChecked, checkNow, capabilities,
        retryCount, latency, statusMessage: getStatusMessage(),
        activeRequest, requestHistory, diagnostics,
        setAIStatus, startRequest, updateRequest, completeRequest, failRequest,
        networkQuality, sessionId: sessionIdRef.current,
      }}
    >
      {children}
    </AIServiceContext.Provider>
  );
}

export function useAIService() {
  const ctx = useContext(AIServiceContext);
  if (!ctx) throw new Error('useAIService must be used within AIServiceProvider');
  return ctx;
}
