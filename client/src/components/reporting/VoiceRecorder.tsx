import { useState, useRef, useCallback } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

interface Props {
  onRecordingComplete: (blob: Blob, durationMs: number) => void;
  maxDurationMs?: number;
}

export default function VoiceRecorder({ onRecordingComplete, maxDurationMs = 120000 }: Props) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [processing, setProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setProcessing(true);
        try {
          onRecordingComplete(blob, duration);
        } finally {
          setProcessing(false);
        }
        setDuration(0);
      };

      recorder.start(250);
      setRecording(true);
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        setDuration(elapsed);
        if (elapsed >= maxDurationMs) stopRecording();
      }, 100);
    } catch {
      alert('Microphone access is required for voice recording.');
    }
  }, [onRecordingComplete, maxDurationMs, duration]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }, []);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3">
      {!recording ? (
        <button
          type="button"
          onClick={startRecording}
          disabled={processing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-dashed border-red-300 text-red-600 hover:border-red-400 hover:bg-red-50 transition-all disabled:opacity-50"
        >
          {processing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Mic size={16} />
          )}
          {processing ? 'Processing...' : 'Record Voice'}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-red-50 border-2 border-red-300">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-bold text-red-700 font-mono">{formatTime(duration)}</span>
          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors"
          >
            <Square size={12} /> Stop
          </button>
        </div>
      )}
      {duration > 0 && !recording && (
        <span className="text-xs text-gray-400">{formatTime(duration)} recorded</span>
      )}
    </div>
  );
}
