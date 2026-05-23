import { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, X, RotateCcw, ZapOff } from 'lucide-react';

interface Props {
  onCapture: (dataUrl: string, file: File) => void;
  onClose: () => void;
}

export default function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [ready,  setReady]  = useState(false);
  const [error,  setError]  = useState('');

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const startStream = useCallback(async (mode: 'environment' | 'user') => {
    stopStream();
    setReady(false);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setError('Camera access was denied or is unavailable. Please allow camera permission in your browser settings, then try again.');
    }
  }, []);

  useEffect(() => {
    startStream('environment');
    return stopStream;
  }, [startStream]);

  const flip = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    startStream(next);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    canvas.toBlob(blob => {
      if (blob) {
        onCapture(dataUrl, new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' }));
      }
    }, 'image/jpeg', 0.9);
  };

  const handleClose = () => { stopStream(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/70 safe-top">
        <span className="text-white font-semibold text-sm tracking-wide">Take Photo</span>
        <button onClick={handleClose} className="text-white hover:text-gray-300 transition-colors p-1">
          <X size={22} />
        </button>
      </div>

      {/* Viewfinder */}
      <div className="flex-1 relative overflow-hidden bg-black">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <ZapOff size={40} className="text-gray-400" />
            <p className="text-white text-sm leading-relaxed">{error}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onCanPlay={() => setReady(true)}
              className="w-full h-full object-cover"
            />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {/* Corner guides */}
            {ready && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-64 relative opacity-60">
                  <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white rounded-tl-sm" />
                  <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white rounded-tr-sm" />
                  <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white rounded-bl-sm" />
                  <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white rounded-br-sm" />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-10 py-7 bg-black/70 safe-bottom">
        {/* Flip camera */}
        <button
          onClick={flip}
          disabled={!!error}
          className="text-white disabled:opacity-30 hover:text-gray-300 transition-colors"
          title="Flip camera"
        >
          <RotateCcw size={26} />
        </button>

        {/* Shutter */}
        <button
          onClick={capture}
          disabled={!ready || !!error}
          className="w-[68px] h-[68px] rounded-full bg-white border-4 border-gray-400 disabled:opacity-30 hover:scale-105 active:scale-95 transition-transform shadow-lg"
          title="Capture photo"
        />

        {/* Spacer to keep shutter centred */}
        <div className="w-[26px]" />
      </div>
    </div>
  );
}
