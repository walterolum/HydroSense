import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Loader2, Languages, CheckCircle, AlertCircle, Video, VideoOff } from 'lucide-react';

// All supported languages — 'auto' lets Gemini AI detect any language
const LANGUAGES = [
  { code: 'auto', name: '🌍 Auto-Detect Any Language', bcp47: 'mul' },
  { code: 'en',   name: '🇬🇧 English',                 bcp47: 'en-UG' },
  { code: 'lug',  name: '🇺🇬 Luganda',                 bcp47: 'lg' },
  { code: 'ach',  name: '🇺🇬 Acholi',                  bcp47: 'en-UG' },
  { code: 'teo',  name: '🇺🇬 Ateso / Teso',            bcp47: 'en-UG' },
  { code: 'lgg',  name: '🇺🇬 Lugbara',                 bcp47: 'en-UG' },
  { code: 'nyn',  name: '🇺🇬 Runyankore / Nkore',      bcp47: 'rw-RW' },
  { code: 'xog',  name: '🇺🇬 Lusoga',                  bcp47: 'lg' },
  { code: 'cgg',  name: '🇺🇬 Rukiga',                  bcp47: 'rw-RW' },
  { code: 'luo',  name: '🇺🇬 Luo',                     bcp47: 'luo' },
  { code: 'madi', name: '🇺🇬 Madi',                    bcp47: 'en-UG' },
  { code: 'lang', name: '🇺🇬 Langi',                   bcp47: 'en-UG' },
  { code: 'alur', name: '🇺🇬 Alur',                    bcp47: 'en-UG' },
  { code: 'swa',  name: '🌍 Swahili',                  bcp47: 'sw' },
];

export interface VoiceResult {
  original: string;
  english: string;
  explanation: string;
  incidentType?: string;
  severity?: string;
  detectedLanguage?: string;
  durationMs: number;
  blob?: Blob;
  videoBlob?: Blob;
}

interface Props {
  onRecordingComplete: (result: VoiceResult) => void;
  onLiveUpdate?: (text: string) => void;
  maxDurationMs?: number;
}

// Convert Blob to base64 string
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip "data:...;base64," prefix
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function VoiceRecorder({ onRecordingComplete, onLiveUpdate, maxDurationMs = 180000 }: Props) {
  const [phase, setPhase]         = useState<'idle' | 'recording' | 'transcribing' | 'done' | 'error'>('idle');
  const [langCode, setLangCode]   = useState('auto');
  const [withVideo, setWithVideo] = useState(false);
  const [duration, setDuration]   = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [result, setResult]       = useState<VoiceResult | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');
  const [videoUrl, setVideoUrl]   = useState<string | null>(null);
  // interim text shown while recording (from Web Speech API)
  const [interim, setInterim]     = useState('');

  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);
  const videoChunksRef   = useRef<Blob[]>([]);
  const recognitionRef   = useRef<any>(null);
  const timerRef         = useRef<ReturnType<typeof setInterval>>();
  const startTimeRef     = useRef(0);
  const streamRef        = useRef<MediaStream | null>(null);
  const interimAccRef    = useRef(''); // English interim from Web Speech

  const lang    = LANGUAGES.find(l => l.code === langCode) || LANGUAGES[0];
  const isEn    = langCode === 'en';
  const isAuto  = langCode === 'auto';

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const reset = () => {
    setPhase('idle'); setResult(null); setErrorMsg('');
    setInterim(''); setDuration(0); setStatusMsg('');
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }
  };

  // ── Gemini audio transcription (high-accuracy, any language) ──
  const transcribeWithGemini = useCallback(async (
    audioBlob: Blob,
    webSpeechFallback: string
  ): Promise<VoiceResult | null> => {
    try {
      const base64 = await blobToBase64(audioBlob);
      const token  = sessionStorage.getItem('hs_token');
      const res = await fetch('/api/ai/audio-transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ audioBase64: base64, mimeType: audioBlob.type || 'audio/webm' }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data.english) throw new Error('No transcription returned');
      return {
        original:         data.original         || webSpeechFallback,
        english:          data.english,
        explanation:      data.explanation       || '',
        incidentType:     data.incidentType,
        severity:         data.severity,
        detectedLanguage: data.detectedLanguage  || lang.name,
        durationMs:       Date.now() - startTimeRef.current,
        blob:             audioBlob,
      };
    } catch {
      return null;
    }
  }, [lang.name]);

  // ── Text-only translation fallback (existing endpoint) ──
  const translateText = useCallback(async (
    text: string, audioBlob?: Blob
  ): Promise<VoiceResult> => {
    try {
      const token = sessionStorage.getItem('hs_token');
      const res = await fetch('/api/ai/voice-translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text, sourceLang: langCode, languageName: lang.name }),
      });
      const data = await res.json();
      return {
        original:     text,
        english:      data.english     || text,
        explanation:  data.explanation || '',
        incidentType: data.incidentType,
        severity:     data.severity,
        durationMs:   Date.now() - startTimeRef.current,
        blob:         audioBlob,
      };
    } catch {
      return {
        original: text, english: text, explanation: '',
        durationMs: Date.now() - startTimeRef.current, blob: audioBlob,
      };
    }
  }, [langCode, lang.name]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    if (audioRecorderRef.current?.state !== 'inactive') audioRecorderRef.current?.stop();
    if (videoRecorderRef.current?.state !== 'inactive') videoRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startRecording = useCallback(async () => {
    audioChunksRef.current = [];
    videoChunksRef.current = [];
    interimAccRef.current  = '';
    setDuration(0);
    setResult(null);
    setErrorMsg('');
    setStatusMsg('');
    setInterim('');
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }

    // ── 1. Request media stream ──
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation:  true,
          noiseSuppression:  true,
          autoGainControl:   true,
          sampleRate:        16000,
          channelCount:      1,
        },
        ...(withVideo ? {
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        } : {}),
      });
      streamRef.current = stream;
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Microphone access denied. Please allow microphone access and try again.'
        : `Could not access ${withVideo ? 'camera/microphone' : 'microphone'}: ${err?.message || 'Unknown error'}`;
      setErrorMsg(msg);
      setPhase('error');
      return;
    }

    // ── 2. Audio-only MediaRecorder (for Gemini transcription) ──
    const audioStream = new MediaStream(stream.getAudioTracks());
    const audioMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find(t => MediaRecorder.isTypeSupported(t)) || '';
    try {
      const ar = new MediaRecorder(audioStream, audioMime ? { mimeType: audioMime } : {});
      audioRecorderRef.current = ar;
      ar.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      ar.start(250);
    } catch { /* no blob — will fallback to Web Speech text */ }

    // ── 3. Video MediaRecorder (if enabled) ──
    if (withVideo) {
      const videoMime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        .find(t => MediaRecorder.isTypeSupported(t)) || '';
      try {
        const vr = new MediaRecorder(stream, videoMime ? { mimeType: videoMime } : {});
        videoRecorderRef.current = vr;
        vr.ondataavailable = e => { if (e.data.size > 0) videoChunksRef.current.push(e.data); };
        vr.onstop = () => {
          const vBlob = new Blob(videoChunksRef.current, { type: videoMime || 'video/webm' });
          setVideoUrl(URL.createObjectURL(vBlob));
        };
        vr.start(250);
      } catch { /* video recording not supported */ }
    }

    // ── 4. Web Speech API (real-time interim display only) ──
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      const recog = new SR();
      recog.lang             = isAuto ? 'en-UG' : lang.bcp47; // interim in English (fallback)
      recog.continuous       = true;
      recog.interimResults   = true;
      recog.maxAlternatives  = 5;
      recognitionRef.current = recog;

      recog.onresult = (event: any) => {
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            interimAccRef.current += (interimAccRef.current ? ' ' : '') + t;
          } else {
            interimText = t;
          }
        }
        // Show browser's interim as a soft hint (Gemini will give accurate final)
        if (isEn) {
          const full = (interimAccRef.current + ' ' + interimText).trim();
          setInterim(full);
          onLiveUpdate?.(full);
        } else {
          // Non-English: show interim lightly so user knows mic is picking up
          setInterim(interimText || interimAccRef.current);
        }
      };
      recog.onerror = (e: any) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
      };
      recog.onend = () => {}; // handled by MediaRecorder stop
      try { recog.start(); } catch { /* ignore */ }
    }

    // ── 5. Stop handler — runs when MediaRecorder fires stop ──
    if (audioRecorderRef.current) {
      audioRecorderRef.current.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setPhase('transcribing');
        setStatusMsg('🔬 Gemini AI is transcribing & translating your recording…');

        const audioBlob = audioChunksRef.current.length
          ? new Blob(audioChunksRef.current, { type: audioMime || 'audio/webm' })
          : undefined;

        let r: VoiceResult | null = null;

        // Primary: Gemini audio (works for any language)
        if (audioBlob && audioBlob.size > 0) {
          r = await transcribeWithGemini(audioBlob, interimAccRef.current);
        }

        // Fallback: if Gemini fails and we have Web Speech text, translate that
        if (!r && interimAccRef.current.trim()) {
          setStatusMsg('Translating with Hydro AI…');
          r = await translateText(interimAccRef.current.trim(), audioBlob);
        }

        // Last resort: nothing captured
        if (!r) {
          setErrorMsg('No speech detected or transcription failed. Please speak clearly and try again.');
          setPhase('error');
          return;
        }

        if (videoChunksRef.current.length) {
          const vMime = videoRecorderRef.current?.mimeType || 'video/webm';
          r.videoBlob = new Blob(videoChunksRef.current, { type: vMime });
        }

        setResult(r);
        setPhase('done');
        onLiveUpdate?.(r.english);
        onRecordingComplete(r);
      };
    } else {
      // No MediaRecorder — rely entirely on Web Speech API + text translate
      const recog2 = recognitionRef.current;
      if (recog2) {
        recog2.onend = async () => {
          if (timerRef.current) clearInterval(timerRef.current);
          stream.getTracks().forEach(t => t.stop());
          const text = interimAccRef.current.trim();
          if (!text) {
            setErrorMsg('No speech detected. Please try again.');
            setPhase('error');
            return;
          }
          setPhase('transcribing');
          setStatusMsg('Translating with Hydro AI…');
          const r = await translateText(text);
          setResult(r);
          setPhase('done');
          onLiveUpdate?.(r.english);
          onRecordingComplete(r);
        };
      }
    }

    startTimeRef.current = Date.now();
    setPhase('recording');

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setDuration(elapsed);
      if (elapsed >= maxDurationMs) stopRecording();
    }, 200);
  }, [
    withVideo, isAuto, isEn, lang,
    transcribeWithGemini, translateText, stopRecording,
    onLiveUpdate, onRecordingComplete, maxDurationMs, videoUrl,
  ]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, []);

  /* ═══════════════════════════════════════
     RENDER
  ═══════════════════════════════════════ */
  return (
    <div className="space-y-3">

      {/* Language selector */}
      {(phase === 'idle' || phase === 'error') && (
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={langCode}
            onChange={e => setLangCode(e.target.value)}
            className="text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-red-400 max-w-[230px]"
          >
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.name}</option>
            ))}
          </select>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            🤖 Gemini AI · Any Language
          </span>
        </div>
      )}

      {/* IDLE — two prominent action buttons */}
      {phase === 'idle' && (
        <div className="flex flex-wrap gap-3">
          {/* Voice-only button */}
          <button
            type="button"
            onClick={() => { setWithVideo(false); startRecording(); }}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold border-2 border-dashed border-red-400 text-red-600 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
          >
            <Mic size={18} />
            Record Voice
          </button>

          {/* Video + voice button */}
          <button
            type="button"
            onClick={() => { setWithVideo(true); startRecording(); }}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold border-2 border-dashed border-purple-400 text-purple-600 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-all"
          >
            <Video size={18} />
            Record Video
          </button>
        </div>
      )}

      {/* RECORDING */}
      {phase === 'recording' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border-2 border-red-400 bg-red-50 dark:bg-red-950/30">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              {withVideo && <Video size={13} className="text-purple-500 flex-shrink-0" />}
              <span className="text-sm font-bold text-red-700 dark:text-red-400 truncate">
                Recording · {fmt(duration)}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                {lang.name.replace(/^[^\s]+\s/, '')}
              </span>
            </div>
            <button
              type="button"
              onClick={stopRecording}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors flex-shrink-0 ml-3"
            >
              <Square size={12} /> Stop
            </button>
          </div>

          {/* Interim text hint */}
          {interim && (
            <div className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                🎤 Mic picking up… (Gemini will give final accurate text)
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 italic leading-relaxed line-clamp-2">{interim}</p>
            </div>
          )}
        </div>
      )}

      {/* TRANSCRIBING */}
      {phase === 'transcribing' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <Loader2 size={16} className="text-blue-600 animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
              Gemini AI Transcribing…
            </p>
            <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">{statusMsg}</p>
          </div>
        </div>
      )}

      {/* DONE */}
      {phase === 'done' && result && (
        <div className="rounded-xl border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-bold text-green-700 dark:text-green-300">
              <CheckCircle size={14} />
              {result.detectedLanguage
                ? `Recorded in ${result.detectedLanguage} · Translated to English`
                : 'Voice recorded & translated'}
            </span>
            <button type="button" onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 underline">Re-record</button>
          </div>

          {/* Video playback */}
          {videoUrl && (
            <video
              src={videoUrl}
              controls
              className="w-full rounded-lg border border-green-200 dark:border-green-800 max-h-48 object-cover"
            />
          )}

          {/* Original transcript */}
          {result.original && result.original !== result.english && (
            <div className="bg-white dark:bg-gray-900 rounded-lg px-3 py-2 border border-green-200 dark:border-green-800">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5 flex items-center gap-1">
                <Languages size={9} /> Original · {result.detectedLanguage || lang.name.replace(/^[^\s]+\s/, '')}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{result.original}</p>
            </div>
          )}

          {/* AI analysis */}
          {result.explanation && (
            <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-lg px-3 py-2 border border-indigo-200 dark:border-indigo-800">
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-400 mb-0.5">🤖 Hydro AI Analysis</p>
              <p className="text-xs text-indigo-900 dark:text-indigo-100 leading-relaxed">{result.explanation}</p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {result.severity && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    result.severity === 'critical' ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' :
                    result.severity === 'high'     ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300' :
                    result.severity === 'medium'   ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300' :
                                                     'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                  }`}>Severity: {result.severity}</span>
                )}
                {result.incidentType && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                    {result.incidentType.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ERROR */}
      {phase === 'error' && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2.5 flex items-start gap-2">
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
