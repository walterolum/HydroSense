import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Loader2, Languages, CheckCircle, AlertCircle } from 'lucide-react';

const LANG_BCP47: Record<string, string> = {
  en:  'en-UG',
  lug: 'lg',
  swa: 'sw',
  luo: 'luo',
  nyn: 'rw-RW',
  teo: 'en-UG',
  lgg: 'en-UG',
  xog: 'lg',
  cgg: 'rw-RW',
  ach: 'en-UG',
};

const LANG_NAMES: Record<string, string> = {
  en: 'English', lug: 'Luganda', swa: 'Swahili', luo: 'Luo',
  nyn: 'Runyankore', teo: 'Teso', lgg: 'Lugbara', xog: 'Lusoga',
  cgg: 'Rukiga', ach: 'Acholi',
};

export interface VoiceResult {
  original: string;
  english: string;
  explanation: string;
  incidentType?: string;
  severity?: string;
  durationMs: number;
  blob?: Blob;
}

interface Props {
  onRecordingComplete: (result: VoiceResult) => void;
  /** Called on every transcript update so parent can reflect text in real-time */
  onLiveUpdate?: (text: string) => void;
  language?: string;
  maxDurationMs?: number;
}

export default function VoiceRecorder({
  onRecordingComplete,
  onLiveUpdate,
  language = 'en',
  maxDurationMs = 120000,
}: Props) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'translating' | 'done' | 'error'>('idle');
  const [duration, setDuration]   = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [result, setResult]       = useState<VoiceResult | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');

  const recognitionRef  = useRef<any>(null);
  const mediaRecorderRef= useRef<MediaRecorder | null>(null);
  const chunksRef       = useRef<Blob[]>([]);
  const timerRef        = useRef<ReturnType<typeof setInterval>>();
  const startTimeRef    = useRef(0);
  // Accumulates finalised English text (or original if English)
  const englishAccRef   = useRef('');
  // Accumulates finalised original text
  const originalAccRef  = useRef('');
  // Queue for segment-by-segment translation
  const translatingRef  = useRef(false);
  const pendingRef      = useRef<string[]>([]);

  const langName = LANG_NAMES[language] || language.toUpperCase();
  const bcp47    = LANG_BCP47[language] || 'en-UG';
  const isEn     = language === 'en';

  /* ── translate a single finalised segment ── */
  const translateSegment = useCallback(async (segment: string) => {
    if (isEn) {
      // English — just accumulate directly
      englishAccRef.current += (englishAccRef.current ? ' ' : '') + segment;
      return;
    }
    try {
      const token = sessionStorage.getItem('hs_token');
      const res = await fetch('/api/ai/voice-translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          text: segment,
          sourceLang: language,
          languageName: langName,
        }),
      });
      const data = await res.json();
      if (data.english) {
        englishAccRef.current += (englishAccRef.current ? ' ' : '') + data.english;
      }
    } catch {
      // fallback: append original
      englishAccRef.current += (englishAccRef.current ? ' ' : '') + segment;
    }
  }, [isEn, language, langName]);

  /* ── drain the pending queue one item at a time ── */
  const drainQueue = useCallback(async () => {
    if (translatingRef.current) return;
    while (pendingRef.current.length > 0) {
      translatingRef.current = true;
      const seg = pendingRef.current.shift()!;
      await translateSegment(seg);
      translatingRef.current = false;
      // After each segment translates, push English text to textarea
      if (englishAccRef.current) onLiveUpdate?.(englishAccRef.current);
    }
    translatingRef.current = false;
  }, [translateSegment, onLiveUpdate]);

  /* ── full translation + analysis for the final result card ── */
  const finalTranslate = useCallback(async (originalText: string, blob?: Blob) => {
    setPhase('translating');
    setStatusMsg('Analysing with Hydro AI…');
    try {
      const token = sessionStorage.getItem('hs_token');
      const res = await fetch('/api/ai/voice-translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: originalText, sourceLang: language, languageName: langName }),
      });
      const data = await res.json();
      const r: VoiceResult = {
        original:    originalText,
        english:     data.english     || englishAccRef.current || originalText,
        explanation: data.explanation || '',
        incidentType:data.incidentType,
        severity:    data.severity,
        durationMs:  Date.now() - startTimeRef.current,
        blob,
      };
      setResult(r);
      setPhase('done');
      onLiveUpdate?.(r.english);
      onRecordingComplete(r);
    } catch {
      const r: VoiceResult = {
        original: originalText, english: englishAccRef.current || originalText,
        explanation: '', durationMs: Date.now() - startTimeRef.current, blob,
      };
      setResult(r);
      setPhase('done');
      onLiveUpdate?.(r.english);
      onRecordingComplete(r);
    }
  }, [language, langName, onLiveUpdate, onRecordingComplete]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startRecording = useCallback(async () => {
    englishAccRef.current  = '';
    originalAccRef.current = '';
    pendingRef.current     = [];
    translatingRef.current = false;
    setDuration(0);
    setResult(null);
    setErrorMsg('');
    setStatusMsg('');

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setErrorMsg('Voice recording requires Chrome or Edge. Please type your report manually.');
      setPhase('error');
      return;
    }

    /* Audio capture (blob) */
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => stream?.getTracks().forEach(t => t.stop());
      mr.start(250);
    } catch { /* no blob — still transcribe */ }

    /* Speech recognition */
    const recog = new SR();
    recog.lang = bcp47;
    recog.continuous = true;
    recog.interimResults = true;
    recognitionRef.current = recog;
    startTimeRef.current = Date.now();

    recog.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          originalAccRef.current += (originalAccRef.current ? ' ' : '') + t;
          if (isEn) {
            englishAccRef.current += (englishAccRef.current ? ' ' : '') + t;
            // English: update textarea immediately
            onLiveUpdate?.(englishAccRef.current);
          } else {
            // Non-English: queue for translation, update textarea only after English arrives
            pendingRef.current.push(t);
            setStatusMsg('Translating…');
            drainQueue().then(() => {
              setStatusMsg('');
              if (englishAccRef.current) onLiveUpdate?.(englishAccRef.current);
            });
          }
        } else {
          interim = t;
          if (isEn) {
            // English interim: show immediately
            onLiveUpdate?.((englishAccRef.current + ' ' + interim).trim());
          }
          // Non-English interim: do NOT push to textarea (would show foreign text)
        }
      }
    };

    recog.onerror = (e: any) => {
      if (e.error === 'no-speech') return;
      if (e.error === 'not-allowed') {
        setErrorMsg('Microphone access denied.');
        setPhase('error');
      }
    };

    recog.onend = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const original = originalAccRef.current.trim();
      if (!original) {
        setErrorMsg('No speech detected. Please try again and speak clearly.');
        setPhase('error');
        return;
      }
      const blob = chunksRef.current.length
        ? new Blob(chunksRef.current, { type: 'audio/webm' })
        : undefined;
      finalTranslate(original, blob);
    };

    recog.start();
    setPhase('recording');

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setDuration(elapsed);
      if (elapsed >= maxDurationMs) stopRecording();
    }, 200);
  }, [bcp47, isEn, drainQueue, finalTranslate, maxDurationMs, onLiveUpdate, stopRecording]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const reset = () => {
    setPhase('idle'); setResult(null); setErrorMsg('');
    englishAccRef.current = ''; originalAccRef.current = '';
  };

  /* ── Render ── */
  return (
    <div className="space-y-2">

      {/* IDLE */}
      {phase === 'idle' && (
        <button type="button" onClick={startRecording}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-dashed border-red-300 text-red-600 hover:border-red-400 hover:bg-red-50 transition-all">
          <Mic size={16} />
          Record Voice
          {language !== 'en' && (
            <span className="ml-1 text-xs bg-red-100 px-1.5 py-0.5 rounded-full font-bold">{langName}</span>
          )}
        </button>
      )}

      {/* RECORDING */}
      {phase === 'recording' && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border-2 border-red-300 bg-red-50 dark:bg-red-950/30">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span className="text-sm font-bold text-red-700 dark:text-red-400 truncate">
              Recording in {langName} · {fmt(duration)}
            </span>
            {statusMsg && (
              <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 flex-shrink-0">
                <Loader2 size={11} className="animate-spin" /> {statusMsg}
              </span>
            )}
          </div>
          <button type="button" onClick={stopRecording}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors flex-shrink-0 ml-3">
            <Square size={12} /> Stop
          </button>
        </div>
      )}

      {/* TRANSLATING */}
      {phase === 'translating' && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200">
          <Loader2 size={15} className="text-blue-600 animate-spin flex-shrink-0" />
          <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
            Translating {langName} → English via Hydro AI…
          </span>
        </div>
      )}

      {/* DONE — result card */}
      {phase === 'done' && result && (
        <div className="rounded-xl border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-bold text-green-700 dark:text-green-300">
              <CheckCircle size={14} /> Voice recorded &amp; translated
            </span>
            <button type="button" onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 underline">Re-record</button>
          </div>

          {!isEn && (
            <div className="bg-white dark:bg-gray-900 rounded-lg px-3 py-2 border border-green-200">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5 flex items-center gap-1">
                <Languages size={9} /> Original · {langName}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{result.original}</p>
            </div>
          )}

          {result.explanation && (
            <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-lg px-3 py-2 border border-indigo-200">
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-400 mb-0.5">🤖 Hydro AI Analysis</p>
              <p className="text-xs text-indigo-900 dark:text-indigo-100 leading-relaxed">{result.explanation}</p>
              {result.severity && (
                <span className={`inline-flex mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  result.severity === 'critical' ? 'bg-red-100 text-red-700' :
                  result.severity === 'high'     ? 'bg-orange-100 text-orange-700' :
                  result.severity === 'medium'   ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>Severity: {result.severity}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ERROR */}
      {phase === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 px-3 py-2.5 flex items-start gap-2">
          <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">{errorMsg}</p>
            <button type="button" onClick={reset} className="text-xs text-red-500 underline mt-1">Try again</button>
          </div>
        </div>
      )}
    </div>
  );
}
