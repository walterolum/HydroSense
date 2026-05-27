import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Volume2, VolumeX, Cpu } from 'lucide-react';

export interface AIWelcomeData {
  greeting: string;
  motivational: string;
  aiInsight: string;
  timeOfDay: string;
  systemStatus: string;
  role: string;
  district: string;
  unreadCount: number;
  generatedAt: string;
}

interface Props {
  data: AIWelcomeData | null;
  loading: boolean;
  onDismiss: () => void;
  ttsEnabled?: boolean;
  onTtsToggle?: () => void;
  userName?: string;
}

function TypewriterText({ text, speed = 40, onComplete }: { text: string; speed?: number; onComplete?: () => void }) {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed('');
    timerRef.current = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayed(text.slice(0, indexRef.current + 1));
        indexRef.current++;
      } else {
        if (timerRef.current) clearInterval(timerRef.current);
        onComplete?.();
      }
    }, speed);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [text, speed, onComplete]);

  return (
    <span>
      {displayed}
      {displayed.length < text.length && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          className="inline-block w-[2px] h-5 bg-cyan-400 ml-0.5 align-middle"
        />
      )}
    </span>
  );
}

function HexParticles() {
  const particles = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 1,
    duration: Math.random() * 20 + 15,
    delay: Math.random() * 10,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: `rgba(6, 182, 212, ${0.2 + Math.random() * 0.3})`,
            boxShadow: `0 0 ${p.size * 3}px rgba(6, 182, 212, 0.3)`,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0.2, 0.8, 0.2],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

function RotatingHexRing() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.07]">
      <motion.div
        className="w-[600px] h-[600px] border border-cyan-500/30 rounded-[30%]"
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute w-[400px] h-[400px] border border-blue-500/20 rounded-[40%]"
        animate={{ rotate: -360 }}
        transition={{ duration: 45, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute w-[500px] h-[500px] border border-teal-400/10 rounded-[35%]"
        animate={{ rotate: 360 }}
        transition={{ duration: 50, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

const SYSTEM_STATUS_LABELS: Record<string, { text: string; color: string }> = {
  critical: { text: 'Critical Attention Required', color: 'text-red-400' },
  elevated: { text: 'System Alert — Elevated Risk', color: 'text-orange-400' },
  warning: { text: 'Precautionary Mode Active', color: 'text-yellow-400' },
  normal: { text: 'All Systems Nominal', color: 'text-emerald-400' },
};

export default function AIWelcome({ data, loading, onDismiss, ttsEnabled, onTtsToggle, userName }: Props) {
  const [stage, setStage] = useState<'greeting' | 'motivational' | 'insight' | 'complete'>('greeting');
  const [showContent, setShowContent] = useState(false);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!loading && data) {
      const g = setTimeout(() => setShowContent(true), 300);
      const s = setTimeout(() => setStage('motivational'), 2500);
      const i = setTimeout(() => setStage('insight'), 5000);
      const c = setTimeout(() => setStage('complete'), 7200);
      const d = setTimeout(() => onDismiss(), 8500);
      return () => {
        clearTimeout(g); clearTimeout(s); clearTimeout(i); clearTimeout(c); clearTimeout(d);
      };
    }
  }, [loading, data, onDismiss]);

  useEffect(() => {
    if (loading || !data || !ttsEnabled) return;
    const msg = `${data.greeting}. ${data.motivational}. ${data.aiInsight}.`;
    const utterance = new SpeechSynthesisUtterance(msg);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 0.7;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes('Google UK Female') || v.name.includes('Samantha') || v.name.includes('Microsoft Zira'));
    if (preferred) utterance.voice = preferred;
    synthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [loading, data, ttsEnabled]);

  const isComplete = stage === 'complete';
  const statusLabel = data ? SYSTEM_STATUS_LABELS[data.systemStatus] || SYSTEM_STATUS_LABELS.normal : SYSTEM_STATUS_LABELS.normal;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.8, ease: 'easeInOut' } }}
      >
        <motion.div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(6, 78, 120, 0.95) 0%, rgba(2, 32, 54, 0.98) 50%, rgba(0, 10, 20, 1) 100%)',
          }}
        />
        <HexParticles />
        <RotatingHexRing />

        {loading && (
          <div className="relative z-10 flex flex-col items-center gap-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <Cpu size={48} className="text-cyan-400" />
            </motion.div>
            <p className="text-cyan-300 text-sm font-mono tracking-widest animate-pulse">
              INITIALIZING HYDRO INTELLIGENCE...
            </p>
          </div>
        )}

        {!loading && data && showContent && (
          <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="mb-6"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 backdrop-blur-sm border border-cyan-500/20 mb-4">
                <Sparkles size={12} className="text-cyan-400" />
                <span className="text-[11px] font-mono text-cyan-300 tracking-widest uppercase">
                  Hydro AI · v4.0
                </span>
              </div>

              <div className="relative">
                <motion.div
                  className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24"
                  animate={{
                    boxShadow: [
                      '0 0 40px rgba(6, 182, 212, 0.3)',
                      '0 0 80px rgba(6, 182, 212, 0.6)',
                      '0 0 40px rgba(6, 182, 212, 0.3)',
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                />
                <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-3 tracking-tight">
                  <TypewriterText
                    key={data.greeting}
                    text={data.greeting}
                    speed={30}
                  />
                </h1>
              </div>

              {(stage === 'motivational' || stage === 'insight' || stage === 'complete') && (
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="text-base md:text-lg text-cyan-200/80 font-light max-w-xl mx-auto mb-6 leading-relaxed"
                >
                  <TypewriterText
                    key={`motivational-${stage}`}
                    text={data.motivational}
                    speed={25}
                  />
                </motion.p>
              )}

              {(stage === 'insight' || stage === 'complete') && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="mb-8"
                >
                  <div className="inline-block px-5 py-3 rounded-2xl bg-white/[0.04] backdrop-blur-sm border border-cyan-500/10 max-w-xl mx-auto">
                    <p className="text-xs text-cyan-400/60 font-mono uppercase tracking-widest mb-1.5">AI Insight</p>
                    <p className="text-sm text-cyan-100/90 font-medium leading-relaxed">
                      <TypewriterText
                        key={`insight-${stage}`}
                        text={data.aiInsight}
                        speed={20}
                      />
                    </p>
                  </div>
                </motion.div>
              )}

              {isComplete && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="flex flex-col items-center gap-4"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-mono font-bold ${statusLabel.color}`}>
                      ▲ {statusLabel.text}
                    </span>
                    <span className="text-white/20">|</span>
                    <span className="text-xs font-mono text-white/40">
                      {data.unreadCount} unread
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={onTtsToggle}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white/90 text-xs transition-all"
                    >
                      {ttsEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                      Voice
                    </button>
                    <motion.button
                      onClick={onDismiss}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-bold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-shadow"
                    >
                      Enter Dashboard
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </div>
        )}

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.4, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="text-[10px] font-mono text-white/20 tracking-[0.3em] uppercase"
          >
            {userName ? `${userName} · ` : ''}HydroSense Intelligence Network
          </motion.p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
