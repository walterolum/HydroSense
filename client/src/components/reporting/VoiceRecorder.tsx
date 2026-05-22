import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Loader2, Languages, CheckCircle, AlertCircle } from 'lucide-react';

/* ── Language code → BCP-47 for SpeechRecognition ── */
const LANG_BCP47: Record<string, string> = {
  en:  'en-UG',
  lug: 'lg',       // Luganda
  swa: 'sw',       // Swahili
  luo: 'luo',      // Luo
  nyn: 'rw-RW',    // Runyankore → closest (Kinyarwanda)
  teo: 'en-UG',    // Teso fallback
  lgg: 'en-UG',    // Lugbara fallback
  xog: 'lg',       // Lusoga → closest (Luganda family)
  cgg: 'rw-RW',    // Rukiga → closest
  ach: 'en-UG',    // Acholi fallback
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
  language?: string;
  maxDurationMs?: number;
}

export default function VoiceRecorder({ onRecordingComplete, language = 'en', maxDurationMs = 120000 }: Props) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'translating' | 'done' | 'error'>('idle');
  const [liveText, setLiveText]       = useState('');
  const [finalText, setFinalText]     = useState('');
  const [result, setResult]           = useState<VoiceResult | null>(null);
  const [errorMsg, setErrorMsg]       = useState('');
  const [duration, setDuration]       = useState(0);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const timerRef         = useRef<ReturnType<typeof setInterval>>();
  const startTimeRef     = useRef(0);
  const accumulatedRef   = useRef(''); // holds all finalised segments

  const langName = LANG_NAMES[language] || language.toUpperCase();
  const bcp47    = LANG_BCP47[language] || 'en-UG';

  /* Translate transcript via Gemini */
  const translate = useCallback(async (text: string, blob?: Blob) => {
    setPhase('translating');
    try {
      const token = sessionStorage.getItem('hs_token');
      const res = await fetch('/api/ai/voice-translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text, sourceLang: language, languageName: langName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Translation failed');

      const r: VoiceResult = {
        original:     data.original || text,
        english:      data.english  || text,
        explanation:  data.explanation || '',
        incidentType: data.incidentType,
        severity:     data.severity,
        durationMs:   Date.now() - startTimeRef.current,
        blob,
      };
      setResult(r);
      setPhase('done');
      onRecordingComplete(r);
    } catch (err: any) {
      setErrorMsg(err.message || 'Translation failed. Your recording was saved.');
      setPhase('error');
      // Still emit so the form can use the raw text
      onRecordingComplete({
        original: text, english: text, explanation: '',
        durationMs: Date.now() - startTimeRef.current, blob,
      });
    }
  }, [language, langName, onRecordingComplete]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('translating');
  }, []);

  const startRecording = useCallback(async () => {
    setLiveText('');
    setFinalText('');
    setResult(null);
    setErrorMsg('');
    accumulatedRef.current = '';
    setDuration(0);

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMsg('Your browser does not support voice recognition. Please use Chrome or Edge.');
      setPhase('error');
      return;
    }

    /* Start MediaRecorder for audio blob */
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => stream?.getTracks().forEach(t => t.stop());
      mr.start(250);
    } catch {
      /* Mic not available — still do speech recognition without blob */
    }

    /* Speech Recognition */
    const recog = new SpeechRecognition();
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
          accumulatedRef.current += (accumulatedRef.current ? ' ' : '') + t;
        } else {
          interim = t;
        }
      }
      setFinalText(accumulatedRef.current);
      setLiveText(interim);
    };

    recog.onerror = (e: any) => {
      if (e.error === 'no-speech') return; // ignore silence
      if (e.error === 'not-allowed') {
        setErrorMsg('Microphone access denied. Please allow microphone and try again.');
        setPhase('error');
      }
    };

    recog.onend = () => {
      /* Triggered when recognition stops (user clicked stop or timeout) */
      const fullText = accumulatedRef.current || liveText;
      const blob = chunksRef.current.length
        ? new Blob(chunksRef.current, { type: 'audio/webm' })
        : undefined;
      if (fullText.trim()) {
        translate(fullText.trim(), blob);
      } else {
        setErrorMsg('No speech detected. Please try again and speak clearly.');
        setPhase('error');
      }
    };

    recog.start();
    setPhase('recording');

    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setDuration(elapsed);
      if (elapsed >= maxDurationMs) stopRecording();
    }, 200);
  }, [bcp47, liveText, maxDurationMs, stopRecording, translate]);

  /* Cleanup on unmount */
  useEffect(() => () => {
    recognitionRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const reset = () => { setPhase('idle'); setResult(null); setLiveText(''); setFinalText(''); setErrorMsg(''); };

  return (
    <div className="space-y-3">

      {/* ── Button row ── */}
      {phase === 'idle' && (
        <button
          type="button"
          onClick={startRecording}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-dashed border-red-300 text-red-600 hover:border-red-400 hover:bg-red-50 transition-all"
        >
          <Mic size={16} />
          Record Voice
          {language !== 'en' && (
            <span className="ml-1 text-xs bg-red-100 px-1.5 py-0.5 rounded-full font-bold">{langName}</span>
          )}
        </button>
      )}

      {phase === 'recording' && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 dark:bg-red-950/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-bold text-red-700 dark:text-red-400">
                Recording in {langName} · {fmt(duration)}
              </span>
            </div>
            <button
              type="button"
              onClick={stopRecording}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors"
            >
              <Square size={12} /> Stop
            </button>
          </div>

          {/* Live transcript */}
          {(finalText || liveText) && (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-2.5 text-sm border border-red-200">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-1">Live transcript</p>
              <p className="text-gray-700 dark:text-gray-200">
                {finalText}
                {liveText && <span className="text-gray-400 italic"> {liveText}</span>}
              </p>
            </div>
          )}
        </div>
      )}

      {phase === 'translating' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <Loader2 size={16} className="text-blue-600 animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-blue-700 dark:text-blue-300">Translating & Analysing…</p>
            <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">
              Converting {langName} to English via Hydro AI
            </p>
          </div>
        </div>
      )}

      {/* ── Result card ── */}
      {phase === 'done' && result && (
        <div className="rounded-xl border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-green-600 dark:text-green-400" />
              <span className="text-sm font-bold text-green-700 dark:text-green-300">Voice Recorded &amp; Translated</span>
            </div>
            <button type="button" onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 underline">Re-record</button>
          </div>

          {/* Original */}
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-green-200 dark:border-green-800">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1 flex items-center gap-1">
              <Languages size={10} /> Original · {langName}
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{result.original}</p>
          </div>

          {/* English translation */}
          <div className="bg-blue-50 dark:bg-blue-950/40 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-400 mb-1">🇬🇧 English Translation</p>
            <p className="text-sm text-blue-900 dark:text-blue-100 font-medium leading-relaxed">{result.english}</p>
          </div>

          {/* AI Explanation */}
          {result.explanation && (
            <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800">
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-400 mb-1">🤖 Hydro AI Analysis</p>
              <p className="text-sm text-indigo-900 dark:text-indigo-100 leading-relaxed">{result.explanation}</p>
              {result.severity && (
                <span className={`inline-flex mt-2 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  result.severity === 'critical' ? 'bg-red-100 text-red-700' :
                  result.severity === 'high'     ? 'bg-orange-100 text-orange-700' :
                  result.severity === 'medium'   ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  Severity: {result.severity}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Error state ── */}
      {phase === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 flex items-start gap-2">
          <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">{errorMsg}</p>
            <button type="button" onClick={reset} className="text-xs text-red-500 underline mt-1">Try again</button>
          </div>
        </div>
      )}
    </div>
  );
}
