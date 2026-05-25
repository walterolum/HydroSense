import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Loader2, Languages, CheckCircle, AlertCircle, Video, Sparkles } from 'lucide-react';

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

// First caption fires after this delay (give user time to start speaking)
const CAPTION_WARMUP_MS  = 10000;
// Subsequent captions every this interval
const CAPTION_INTERVAL_MS = 6000;

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

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror   = reject;
    reader.readAsDataURL(blob);
  });
}

export default function VoiceRecorder({ onRecordingComplete, onLiveUpdate, maxDurationMs = 180000 }: Props) {
  const [phase, setPhase]               = useState<'idle' | 'recording' | 'transcribing' | 'done' | 'error'>('idle');
  const [langCode, setLangCode]         = useState('auto');
  const [withVideo, setWithVideo]       = useState(false);
  const [duration, setDuration]         = useState(0);
  const [statusMsg, setStatusMsg]       = useState('');
  const [result, setResult]             = useState<VoiceResult | null>(null);
  const [errorMsg, setErrorMsg]         = useState('');
  const [videoUrl, setVideoUrl]         = useState<string | null>(null);
  const [captionLines, setCaptionLines] = useState<string[]>([]);
  const [captionBusy, setCaptionBusy]   = useState(false);
  const [captionsStarted, setCaptionsStarted] = useState(false);
  const [interim, setInterim]           = useState('');

  const audioRecorderRef   = useRef<MediaRecorder | null>(null);
  const videoRecorderRef   = useRef<MediaRecorder | null>(null);
  const audioChunksRef     = useRef<Blob[]>([]);
  const videoChunksRef     = useRef<Blob[]>([]);
  const recognitionRef     = useRef<any>(null);
  const timerRef           = useRef<ReturnType<typeof setInterval>>();
  const captionTimerRef    = useRef<ReturnType<typeof setInterval>>();
  const captionWarmupRef   = useRef<ReturnType<typeof setTimeout>>();
  const startTimeRef       = useRef(0);
  const streamRef          = useRef<MediaStream | null>(null);
  const interimAccRef      = useRef('');
  const audioMimeRef       = useRef('');
  const lastCaptionIdxRef  = useRef(0);
  const captionPendingRef  = useRef(false);
  // Direct ref to the live <video> element
  const videoElRef         = useRef<HTMLVideoElement | null>(null);

  const lang   = LANGUAGES.find(l => l.code === langCode) || LANGUAGES[0];
  const isEn   = langCode === 'en';
  const isAuto = langCode === 'auto';

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  // ── Attach live camera stream to <video> whenever phase becomes 'recording' ──
  useEffect(() => {
    if (phase === 'recording' && withVideo && videoElRef.current && streamRef.current) {
      const el = videoElRef.current;
      el.srcObject = streamRef.current;
      // Attempt play (needed for some browsers alongside autoPlay attr)
      el.play().catch(() => {});
    }
  }, [phase, withVideo]);

  const reset = () => {
    setPhase('idle'); setResult(null); setErrorMsg('');
    setInterim(''); setDuration(0); setStatusMsg('');
    setCaptionLines([]); setCaptionBusy(false); setCaptionsStarted(false);
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }
  };

  // ── Gemini full transcription (called after recording stops) ──
  const transcribeWithGemini = useCallback(async (
    audioBlob: Blob, webSpeechFallback: string
  ): Promise<VoiceResult | null> => {
    try {
      const base64 = await blobToBase64(audioBlob);
      const token  = sessionStorage.getItem('hs_token');
      const res = await fetch('/api/ai/audio-transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ audioBase64: base64, mimeType: audioBlob.type || 'audio/webm' }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data.english) throw new Error('empty');
      return {
        original: data.original || webSpeechFallback, english: data.english,
        explanation: data.explanation || '', incidentType: data.incidentType,
        severity: data.severity, detectedLanguage: data.detectedLanguage || lang.name,
        durationMs: Date.now() - startTimeRef.current, blob: audioBlob,
      };
    } catch { return null; }
  }, [lang.name]);

  const translateText = useCallback(async (text: string, audioBlob?: Blob): Promise<VoiceResult> => {
    try {
      const token = sessionStorage.getItem('hs_token');
      const res = await fetch('/api/ai/voice-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text, sourceLang: langCode, languageName: lang.name }),
      });
      const data = await res.json();
      return { original: text, english: data.english || text, explanation: data.explanation || '', incidentType: data.incidentType, severity: data.severity, durationMs: Date.now() - startTimeRef.current, blob: audioBlob };
    } catch {
      return { original: text, english: text, explanation: '', durationMs: Date.now() - startTimeRef.current, blob: audioBlob };
    }
  }, [langCode, lang.name]);

  // ── Live caption: send recent audio chunk to Gemini ──
  const triggerLiveCaption = useCallback(async () => {
    if (captionPendingRef.current) return;
    const newChunks = audioChunksRef.current.slice(lastCaptionIdxRef.current);
    if (!newChunks.length) return;
    lastCaptionIdxRef.current = audioChunksRef.current.length;
    const blob = new Blob(newChunks, { type: audioMimeRef.current || 'audio/webm' });
    if (blob.size < 3000) return; // skip silence / too short

    captionPendingRef.current = true;
    setCaptionBusy(true);
    try {
      const base64 = await blobToBase64(blob);
      const token  = sessionStorage.getItem('hs_token');
      const res = await fetch('/api/ai/audio-transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ audioBase64: base64, mimeType: blob.type }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.english?.trim()) {
        setCaptionLines(prev => [...prev, data.english.trim()]);
        onLiveUpdate?.(data.english.trim());
      }
    } catch { /* ignore — next interval will retry */ }
    finally { captionPendingRef.current = false; setCaptionBusy(false); }
  }, [onLiveUpdate]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    if (audioRecorderRef.current?.state !== 'inactive') audioRecorderRef.current?.stop();
    if (videoRecorderRef.current?.state !== 'inactive') videoRecorderRef.current?.stop();
    if (timerRef.current)        clearInterval(timerRef.current);
    if (captionTimerRef.current) clearInterval(captionTimerRef.current);
    if (captionWarmupRef.current) clearTimeout(captionWarmupRef.current);
    // Detach stream from preview
    if (videoElRef.current) { videoElRef.current.srcObject = null; }
  }, []);

  const startRecording = useCallback(async (wVideo: boolean) => {
    audioChunksRef.current    = [];
    videoChunksRef.current    = [];
    interimAccRef.current     = '';
    lastCaptionIdxRef.current = 0;
    captionPendingRef.current = false;
    setDuration(0); setResult(null); setErrorMsg('');
    setStatusMsg(''); setInterim(''); setCaptionLines([]); setCaptionBusy(false); setCaptionsStarted(false);
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }

    // ── 1. Request camera + mic ──
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000, channelCount: 1 },
        ...(wVideo ? { video: { width: { ideal: 1280 }, height: { ideal: 720 } } } : {}),
      });
      streamRef.current = stream;
    } catch (err: any) {
      setErrorMsg(err?.name === 'NotAllowedError'
        ? `Please allow ${wVideo ? 'camera & microphone' : 'microphone'} access in your browser and try again.`
        : `Could not open ${wVideo ? 'camera & microphone' : 'microphone'}: ${err?.message || 'Unknown error'}`);
      setPhase('error');
      return;
    }

    // ── 2. Audio-only recorder (clean audio for Gemini) ──
    const audioStream = new MediaStream(stream.getAudioTracks());
    const audioMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find(t => MediaRecorder.isTypeSupported(t)) || '';
    audioMimeRef.current = audioMime;
    try {
      const ar = new MediaRecorder(audioStream, audioMime ? { mimeType: audioMime } : {});
      audioRecorderRef.current = ar;
      ar.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      ar.start(250);
    } catch { /* fallback to Web Speech only */ }

    // ── 3. Video recorder ──
    if (wVideo) {
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
      } catch { /* video not supported */ }
    }

    // ── 4. Warmup delay → then start live caption interval ──
    if (wVideo) {
      captionWarmupRef.current = setTimeout(() => {
        setCaptionsStarted(true);
        // Fire first caption immediately after warmup
        triggerLiveCaption();
        // Then fire every CAPTION_INTERVAL_MS
        captionTimerRef.current = setInterval(triggerLiveCaption, CAPTION_INTERVAL_MS);
      }, CAPTION_WARMUP_MS);
    }

    // ── 5. Web Speech API (audio-only interim) ──
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      const recog = new SR();
      recog.lang = isAuto ? 'en-UG' : lang.bcp47;
      recog.continuous = true; recog.interimResults = true; recog.maxAlternatives = 3;
      recognitionRef.current = recog;
      recog.onresult = (event: any) => {
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) interimAccRef.current += (interimAccRef.current ? ' ' : '') + t;
          else interimText = t;
        }
        if (!wVideo) {
          if (isEn) { const full = (interimAccRef.current + ' ' + interimText).trim(); setInterim(full); onLiveUpdate?.(full); }
          else setInterim(interimText || interimAccRef.current);
        }
      };
      recog.onerror = () => {};
      recog.onend = () => {};
      try { recog.start(); } catch { /* ignore */ }
    }

    // ── 6. Stop handler ──
    if (audioRecorderRef.current) {
      audioRecorderRef.current.onstop = async () => {
        if (captionTimerRef.current)  clearInterval(captionTimerRef.current);
        if (captionWarmupRef.current) clearTimeout(captionWarmupRef.current);
        stream.getTracks().forEach(t => t.stop());
        setPhase('transcribing');
        setStatusMsg('🔬 Gemini AI is transcribing & translating your full recording…');

        const audioBlob = audioChunksRef.current.length
          ? new Blob(audioChunksRef.current, { type: audioMime || 'audio/webm' })
          : undefined;

        let r: VoiceResult | null = null;
        if (audioBlob && audioBlob.size > 0) r = await transcribeWithGemini(audioBlob, interimAccRef.current);
        if (!r && interimAccRef.current.trim()) {
          setStatusMsg('Translating with Hydro AI…');
          r = await translateText(interimAccRef.current.trim(), audioBlob);
        }
        if (!r) {
          setErrorMsg('No speech detected or transcription failed. Please speak clearly and try again.');
          setPhase('error'); return;
        }
        if (videoChunksRef.current.length) {
          const vMime = videoRecorderRef.current?.mimeType || 'video/webm';
          r.videoBlob = new Blob(videoChunksRef.current, { type: vMime });
        }
        setResult(r); setPhase('done');
        onLiveUpdate?.(r.english); onRecordingComplete(r);
      };
    } else {
      const recog2 = recognitionRef.current;
      if (recog2) {
        recog2.onend = async () => {
          if (timerRef.current)        clearInterval(timerRef.current);
          if (captionTimerRef.current) clearInterval(captionTimerRef.current);
          if (captionWarmupRef.current) clearTimeout(captionWarmupRef.current);
          stream.getTracks().forEach(t => t.stop());
          const text = interimAccRef.current.trim();
          if (!text) { setErrorMsg('No speech detected. Please try again.'); setPhase('error'); return; }
          setPhase('transcribing'); setStatusMsg('Translating with Hydro AI…');
          const r = await translateText(text);
          setResult(r); setPhase('done'); onLiveUpdate?.(r.english); onRecordingComplete(r);
        };
      }
    }

    startTimeRef.current = Date.now();
    setWithVideo(wVideo);
    setPhase('recording');

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setDuration(elapsed);
      if (elapsed >= maxDurationMs) stopRecording();
    }, 200);
  }, [isAuto, isEn, lang, videoUrl, transcribeWithGemini, translateText, stopRecording, triggerLiveCaption, onLiveUpdate, onRecordingComplete, maxDurationMs]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (timerRef.current)        clearInterval(timerRef.current);
    if (captionTimerRef.current) clearInterval(captionTimerRef.current);
    if (captionWarmupRef.current) clearTimeout(captionWarmupRef.current);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, []);

  /* ══════════════════════ RENDER ══════════════════════ */
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
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">🤖 Gemini AI · Any Language</span>
        </div>
      )}

      {/* ── IDLE ── */}
      {phase === 'idle' && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => startRecording(false)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold border-2 border-dashed border-red-400 text-red-600 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
          >
            <Mic size={18} /> Record Voice
          </button>
          <button
            type="button"
            onClick={() => startRecording(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold border-2 border-dashed border-purple-400 text-purple-600 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-all"
          >
            <Video size={18} /> Record Video
          </button>
        </div>
      )}

      {/* ── RECORDING ── */}
      {phase === 'recording' && (
        <div className="space-y-2">

          {/* Live camera with caption overlay */}
          {withVideo && (
            <div
              className="relative rounded-2xl overflow-hidden bg-black border-2 border-purple-500 shadow-2xl"
              style={{ minHeight: 280 }}
            >
              {/* Live camera feed */}
              <video
                ref={videoElRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
                style={{ minHeight: 280, display: 'block' }}
              />

              {/* Dark vignette overlay so text is always readable */}
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.75) 100%)' }} />

              {/* REC badge + timer — top left */}
              <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-black/60 backdrop-blur-md rounded-full px-3 py-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white text-xs font-extrabold tracking-widest">REC {fmt(duration)}</span>
              </div>

              {/* Caption status indicator — top center */}
              {!captionsStarted && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-black/50 backdrop-blur-md rounded-full px-3 py-1 border border-white/10">
                  <Sparkles size={10} className="text-purple-300" />
                  <span className="text-purple-200 text-[10px] font-semibold">AI captions starting soon…</span>
                </div>
              )}
              {captionBusy && captionsStarted && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-black/50 backdrop-blur-md rounded-full px-3 py-1 border border-white/10">
                  <Loader2 size={10} className="text-yellow-300 animate-spin" />
                  <span className="text-yellow-200 text-[10px] font-semibold">Translating…</span>
                </div>
              )}

              {/* Stop button — top right */}
              <button
                type="button"
                onClick={stopRecording}
                className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-600/90 backdrop-blur-md text-white text-xs font-bold hover:bg-red-700 active:scale-95 transition-all shadow-lg"
              >
                <Square size={11} fill="white" /> Stop
              </button>

              {/* ── Live English caption bar — bottom ── */}
              <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-4 pt-10">
                {captionLines.length > 0 ? (
                  <div className="space-y-1">
                    {captionLines.slice(-2).map((line, i) => (
                      <p
                        key={i}
                        className={`text-center font-semibold leading-snug transition-opacity ${i < captionLines.slice(-2).length - 1 ? 'text-sm text-white/70' : 'text-base text-white'}`}
                        style={{ textShadow: '0 2px 8px rgba(0,0,0,1), 0 0 20px rgba(0,0,0,0.8)' }}
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p
                    className="text-center text-sm italic text-white/40"
                    style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
                  >
                    {captionsStarted ? 'Listening…' : 'Record your report — AI English captions will appear here'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Audio-only status bar */}
          {!withVideo && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border-2 border-red-400 bg-red-50 dark:bg-red-950/30">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                <span className="text-sm font-bold text-red-700 dark:text-red-400 truncate">Recording · {fmt(duration)}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">{lang.name.replace(/^[^\s]+\s/, '')}</span>
              </div>
              <button
                type="button"
                onClick={stopRecording}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors flex-shrink-0 ml-3"
              >
                <Square size={12} /> Stop
              </button>
            </div>
          )}

          {/* Audio-only interim hint */}
          {!withVideo && interim && (
            <div className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">🎤 Mic picking up…</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 italic leading-relaxed line-clamp-2">{interim}</p>
            </div>
          )}
        </div>
      )}

      {/* ── TRANSCRIBING ── */}
      {phase === 'transcribing' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <Loader2 size={16} className="text-blue-600 animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-blue-700 dark:text-blue-300">Gemini AI Transcribing…</p>
            <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">{statusMsg}</p>
          </div>
        </div>
      )}

      {/* ── DONE ── */}
      {phase === 'done' && result && (
        <div className="rounded-xl border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-bold text-green-700 dark:text-green-300">
              <CheckCircle size={14} />
              {result.detectedLanguage ? `Recorded in ${result.detectedLanguage} · Translated to English` : 'Voice recorded & translated'}
            </span>
            <button type="button" onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 underline">Re-record</button>
          </div>

          {videoUrl && (
            <video src={videoUrl} controls className="w-full rounded-lg border border-green-200 dark:border-green-800 max-h-64 object-cover" />
          )}

          {result.original && result.original !== result.english && (
            <div className="bg-white dark:bg-gray-900 rounded-lg px-3 py-2 border border-green-200 dark:border-green-800">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5 flex items-center gap-1">
                <Languages size={9} /> Original · {result.detectedLanguage || lang.name.replace(/^[^\s]+\s/, '')}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{result.original}</p>
            </div>
          )}

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

      {/* ── ERROR ── */}
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
