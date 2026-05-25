import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Loader2, Languages, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';

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

// Both modes: wait 8 s before first Gemini caption, then every 6 s
const CAPTION_WARMUP_MS  = 8000;
const CAPTION_INTERVAL_MS = 6000;

interface TimedCaption { text: string; startMs: number; endMs: number; }

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
  timedCaptions?: TimedCaption[];
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

function fmtVTT(ms: number) {
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  const s  = Math.floor((ms % 60000) / 1000);
  const ms2 = ms % 1000;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms2).padStart(3,'0')}`;
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
  // Live caption chunks (both modes)
  const [captionLines, setCaptionLines]   = useState<string[]>([]);
  const [captionBusy, setCaptionBusy]     = useState(false);
  const [captionsStarted, setCaptionsStarted] = useState(false);
  // Playback caption (video done state)
  const [playbackCaption, setPlaybackCaption] = useState('');

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
  // Timed captions collected during recording (for video playback subtitles)
  const timedCaptionsRef   = useRef<TimedCaption[]>([]);
  // Live camera preview element
  const videoLiveRef       = useRef<HTMLVideoElement | null>(null);
  // Video playback element (done state)
  const videoPlaybackRef   = useRef<HTMLVideoElement | null>(null);

  const lang   = LANGUAGES.find(l => l.code === langCode) || LANGUAGES[0];
  const isAuto = langCode === 'auto';

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  // Attach live camera stream to preview video element when phase becomes 'recording'
  useEffect(() => {
    if (phase === 'recording' && withVideo) {
      const el = videoLiveRef.current;
      if (el && streamRef.current) {
        el.srcObject = streamRef.current;
        el.play().catch(() => {});
      }
    }
  }, [phase, withVideo]);

  // Wire up timeupdate subtitles when video playback element appears
  useEffect(() => {
    if (phase !== 'done') return;
    const el = videoPlaybackRef.current;
    if (!el || !timedCaptionsRef.current.length) return;

    const onTimeUpdate = () => {
      const ms = el.currentTime * 1000;
      const active = timedCaptionsRef.current.find(c => ms >= c.startMs && ms < c.endMs);
      setPlaybackCaption(active?.text ?? '');
    };
    el.addEventListener('timeupdate', onTimeUpdate);
    return () => el.removeEventListener('timeupdate', onTimeUpdate);
  }, [phase, videoUrl]);

  const reset = () => {
    setPhase('idle'); setResult(null); setErrorMsg('');
    setDuration(0); setStatusMsg('');
    setCaptionLines([]); setCaptionBusy(false); setCaptionsStarted(false);
    setPlaybackCaption('');
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }
    timedCaptionsRef.current = [];
  };

  // Gemini full transcription (after recording stops)
  const transcribeWithGemini = useCallback(async (
    audioBlob: Blob, fallback: string
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
        original: data.original || fallback, english: data.english,
        explanation: data.explanation || '', incidentType: data.incidentType,
        severity: data.severity, detectedLanguage: data.detectedLanguage || lang.name,
        durationMs: Date.now() - startTimeRef.current, blob: audioBlob,
        timedCaptions: timedCaptionsRef.current,
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
      return { original: text, english: data.english || text, explanation: data.explanation || '', incidentType: data.incidentType, severity: data.severity, durationMs: Date.now() - startTimeRef.current, blob: audioBlob, timedCaptions: timedCaptionsRef.current };
    } catch {
      return { original: text, english: text, explanation: '', durationMs: Date.now() - startTimeRef.current, blob: audioBlob, timedCaptions: timedCaptionsRef.current };
    }
  }, [langCode, lang.name]);

  // Gemini live caption — same logic for BOTH voice and video
  const triggerLiveCaption = useCallback(async () => {
    if (captionPendingRef.current) return;
    const newChunks = audioChunksRef.current.slice(lastCaptionIdxRef.current);
    if (!newChunks.length) return;

    const chunkStartMs = Math.max(0, (lastCaptionIdxRef.current > 0 ? CAPTION_WARMUP_MS + (lastCaptionIdxRef.current > 0 ? (timedCaptionsRef.current.length) * CAPTION_INTERVAL_MS : 0) : CAPTION_WARMUP_MS));
    lastCaptionIdxRef.current = audioChunksRef.current.length;

    const blob = new Blob(newChunks, { type: audioMimeRef.current || 'audio/webm' });
    if (blob.size < 2000) return;

    captionPendingRef.current = true;
    setCaptionBusy(true);

    const captureStartMs = Date.now() - startTimeRef.current - CAPTION_INTERVAL_MS;
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
        const nowMs = Date.now() - startTimeRef.current;
        const tc: TimedCaption = {
          text: data.english.trim(),
          startMs: Math.max(0, captureStartMs),
          endMs: nowMs + 1000, // keep visible 1 s past chunk end
        };
        timedCaptionsRef.current.push(tc);
        setCaptionLines(prev => [...prev, tc.text]);
        onLiveUpdate?.(tc.text);
      }
    } catch { /* ignore */ }
    finally { captionPendingRef.current = false; setCaptionBusy(false); }
  }, [onLiveUpdate]);

  const stopAllTimers = () => {
    if (timerRef.current)         clearInterval(timerRef.current);
    if (captionTimerRef.current)  clearInterval(captionTimerRef.current);
    if (captionWarmupRef.current) clearTimeout(captionWarmupRef.current);
  };

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    if (audioRecorderRef.current?.state !== 'inactive') audioRecorderRef.current?.stop();
    if (videoRecorderRef.current?.state !== 'inactive') videoRecorderRef.current?.stop();
    stopAllTimers();
    if (videoLiveRef.current) { videoLiveRef.current.srcObject = null; }
  }, []);

  const startRecording = useCallback(async (wVideo: boolean) => {
    audioChunksRef.current    = [];
    videoChunksRef.current    = [];
    interimAccRef.current     = '';
    lastCaptionIdxRef.current = 0;
    captionPendingRef.current = false;
    timedCaptionsRef.current  = [];
    setDuration(0); setResult(null); setErrorMsg(''); setStatusMsg('');
    setCaptionLines([]); setCaptionBusy(false); setCaptionsStarted(false); setPlaybackCaption('');
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }

    // ── 1. Acquire media ──
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000, channelCount: 1 },
        ...(wVideo ? { video: { width: { ideal: 1280 }, height: { ideal: 720 } } } : {}),
      });
      streamRef.current = stream;
    } catch (err: any) {
      setErrorMsg(err?.name === 'NotAllowedError'
        ? `Please allow ${wVideo ? 'camera & microphone' : 'microphone'} access and try again.`
        : `Could not open ${wVideo ? 'camera & microphone' : 'microphone'}: ${err?.message || 'Unknown error'}`);
      setPhase('error');
      return;
    }

    // ── 2. Audio recorder (clean for Gemini) ──
    const audioStream = new MediaStream(stream.getAudioTracks());
    const audioMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find(t => MediaRecorder.isTypeSupported(t)) || '';
    audioMimeRef.current = audioMime;
    try {
      const ar = new MediaRecorder(audioStream, audioMime ? { mimeType: audioMime } : {});
      audioRecorderRef.current = ar;
      ar.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      ar.start(250);
    } catch { /* Web Speech fallback */ }

    // ── 3. Video recorder ──
    if (wVideo) {
      const vMime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        .find(t => MediaRecorder.isTypeSupported(t)) || '';
      try {
        const vr = new MediaRecorder(stream, vMime ? { mimeType: vMime } : {});
        videoRecorderRef.current = vr;
        vr.ondataavailable = e => { if (e.data.size > 0) videoChunksRef.current.push(e.data); };
        vr.onstop = () => {
          const vBlob = new Blob(videoChunksRef.current, { type: vMime || 'video/webm' });
          setVideoUrl(URL.createObjectURL(vBlob));
        };
        vr.start(250);
      } catch { /* not supported */ }
    }

    // ── 4. Warmup → Gemini live caption interval (SAME for both voice & video) ──
    captionWarmupRef.current = setTimeout(() => {
      setCaptionsStarted(true);
      triggerLiveCaption();
      captionTimerRef.current = setInterval(triggerLiveCaption, CAPTION_INTERVAL_MS);
    }, CAPTION_WARMUP_MS);

    // ── 5. Web Speech API — accumulate text as fallback for final transcription ──
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      try {
        const recog = new SR();
        recog.lang = isAuto ? 'en-UG' : lang.bcp47;
        recog.continuous = true; recog.interimResults = false; recog.maxAlternatives = 1;
        recognitionRef.current = recog;
        recog.onresult = (e: any) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) interimAccRef.current += ' ' + e.results[i][0].transcript;
          }
        };
        recog.onerror = () => {};
        recog.onend = () => {};
        recog.start();
      } catch { /* ignore */ }
    }

    // ── 6. Stop handler → full Gemini transcription ──
    if (audioRecorderRef.current) {
      audioRecorderRef.current.onstop = async () => {
        stopAllTimers();
        stream.getTracks().forEach(t => t.stop());
        setPhase('transcribing');
        setStatusMsg('🔬 Gemini AI is transcribing your full recording…');

        const audioBlob = audioChunksRef.current.length
          ? new Blob(audioChunksRef.current, { type: audioMime || 'audio/webm' })
          : undefined;

        let r: VoiceResult | null = null;
        if (audioBlob && audioBlob.size > 0) r = await transcribeWithGemini(audioBlob, interimAccRef.current.trim());
        if (!r && interimAccRef.current.trim()) {
          setStatusMsg('Translating with Hydro AI…');
          r = await translateText(interimAccRef.current.trim(), audioBlob);
        }
        if (!r) {
          setErrorMsg('No speech detected. Please speak clearly and try again.');
          setPhase('error'); return;
        }
        if (videoChunksRef.current.length) {
          const vMime2 = videoRecorderRef.current?.mimeType || 'video/webm';
          r.videoBlob = new Blob(videoChunksRef.current, { type: vMime2 });
        }
        setResult(r); setPhase('done');
        onLiveUpdate?.(r.english); onRecordingComplete(r);
      };
    }

    startTimeRef.current = Date.now();
    setWithVideo(wVideo);
    setPhase('recording');

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setDuration(elapsed);
      if (elapsed >= maxDurationMs) stopRecording();
    }, 200);
  }, [isAuto, lang, videoUrl, transcribeWithGemini, translateText, stopRecording, triggerLiveCaption, onLiveUpdate, onRecordingComplete, maxDurationMs]);

  // Cleanup on unmount
  useEffect(() => () => {
    recognitionRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    stopAllTimers();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, []);

  /* ══════════════════════════ RENDER ══════════════════════════ */
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
        </div>
      )}

      {/* ── RECORDING ── */}
      {phase === 'recording' && (
        <div className="space-y-2">

          {/* ════ VIDEO MODE: live camera + captions overlay ════ */}
          {withVideo && (
            <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-purple-500 shadow-2xl" style={{ minHeight: 300 }}>
              <video
                ref={videoLiveRef}
                autoPlay muted playsInline
                className="w-full h-full object-cover"
                style={{ minHeight: 300, display: 'block' }}
              />
              {/* Gradient vignette */}
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 28%, transparent 58%, rgba(0,0,0,0.82) 100%)' }} />

              {/* REC + timer */}
              <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-black/60 backdrop-blur-md rounded-full px-3 py-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white text-xs font-extrabold tracking-widest">REC {fmt(duration)}</span>
              </div>

              {/* Caption status badge (top-center) */}
              {!captionsStarted ? (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-black/50 backdrop-blur-md rounded-full px-3 py-1 border border-white/10">
                  <Sparkles size={9} className="text-purple-300" />
                  <span className="text-purple-200 text-[10px] font-semibold">AI captions starting soon…</span>
                </div>
              ) : captionBusy ? (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-black/50 backdrop-blur-md rounded-full px-3 py-1 border border-white/10">
                  <Loader2 size={9} className="text-yellow-300 animate-spin" />
                  <span className="text-yellow-200 text-[10px] font-semibold">Translating…</span>
                </div>
              ) : null}

              {/* Stop button */}
              <button
                type="button"
                onClick={stopRecording}
                className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-600/90 backdrop-blur-md text-white text-xs font-bold hover:bg-red-700 active:scale-95 transition-all shadow-lg"
              >
                <Square size={11} fill="white" /> Stop
              </button>

              {/* Live English captions — bottom overlay */}
              <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-4 pt-8 text-center">
                {captionLines.length > 0 ? (
                  <div className="space-y-1">
                    {captionLines.slice(-2).map((line, i, arr) => (
                      <p
                        key={i}
                        className={`font-semibold leading-snug ${i < arr.length - 1 ? 'text-sm text-white/65' : 'text-base text-white'}`}
                        style={{ textShadow: '0 2px 10px rgba(0,0,0,1), 0 0 20px rgba(0,0,0,0.9)' }}
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic text-white/40" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                    {captionsStarted ? 'Listening…' : 'Speak clearly — English captions will appear here'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ════ VOICE MODE: status bar + live caption text ════ */}
          {!withVideo && (
            <>
              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border-2 border-red-400 bg-red-50 dark:bg-red-950/30">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                  <span className="text-sm font-bold text-red-700 dark:text-red-400 truncate">Recording · {fmt(duration)}</span>
                  {captionBusy && <Loader2 size={11} className="text-gray-400 animate-spin flex-shrink-0" />}
                </div>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 flex-shrink-0 ml-3"
                >
                  <Square size={12} /> Stop
                </button>
              </div>

              {/* Live Gemini captions for voice mode */}
              <div className="min-h-[52px] px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-dashed border-gray-300 dark:border-gray-600">
                {captionLines.length > 0 ? (
                  <div>
                    <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Sparkles size={9} /> Live AI Translation · English
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                      {captionLines.slice(-3).join(' ')}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                    {captionsStarted ? 'Listening…' : '🎤 Speak in any language — English translation will appear here'}
                  </p>
                )}
              </div>
            </>
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
              {result.detectedLanguage
                ? `Detected: ${result.detectedLanguage} · Translated to English`
                : 'Recorded & translated to English'}
            </span>
            <button type="button" onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 underline">Re-record</button>
          </div>

          {/* ── Video playback WITH subtitle overlay ── */}
          {videoUrl && (
            <div className="relative rounded-xl overflow-hidden bg-black border border-green-200 dark:border-green-800 shadow-md">
              <video
                ref={videoPlaybackRef}
                src={videoUrl}
                controls
                className="w-full max-h-72 object-cover"
              />
              {/* Subtitle overlay — appears above the video controls bar */}
              {playbackCaption && (
                <div
                  className="absolute left-0 right-0 flex justify-center px-4 pointer-events-none"
                  style={{ bottom: '52px' }}
                >
                  <span
                    className="bg-black/80 text-white text-sm font-semibold px-4 py-2 rounded-lg text-center max-w-full"
                    style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
                  >
                    {playbackCaption}
                  </span>
                </div>
              )}
            </div>
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

          {/* Caption timeline — shown if video has timed captions */}
          {result.timedCaptions && result.timedCaptions.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">📝 Caption Timeline</p>
              <div className="space-y-1">
                {result.timedCaptions.map((tc, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="text-gray-400 dark:text-gray-500 font-mono flex-shrink-0">{fmt(tc.startMs)}</span>
                    <span className="text-gray-700 dark:text-gray-300 leading-snug">{tc.text}</span>
                  </div>
                ))}
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
