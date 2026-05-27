import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Volume2, VolumeX, Repeat, Sparkles } from 'lucide-react';
import { useAmbient } from '../../contexts/AmbientAudioContext';
import { useAuth } from '../../contexts/AuthContext';

export default function AIAssistantPanel() {
  const {
    isNarrating, stopNarration, startNarration,
    currentSubtitle, voiceName, voicesReady,
    isAIVisible, hideAI, showAI, prefs, toggleMute,
  } = useAmbient();
  const { user } = useAuth();

  const [dismissed, setDismissed] = useState(false);

  const visible = isAIVisible && !dismissed;
  const isSpeaking = isNarrating && currentSubtitle.length > 0;

  useEffect(() => {
    if (isNarrating) setDismissed(false);
  }, [isNarrating]);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="ai-panel"
        initial={{ opacity: 0, y: 40, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3"
      >
        {/* AI Orb */}
        <motion.div className="relative flex items-end gap-3">
          {/* Subtitle bubble */}
          <AnimatePresence mode="wait">
            {currentSubtitle && (
              <motion.div
                key={currentSubtitle.slice(0, 20)}
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 10, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="max-w-xs px-4 py-3 rounded-2xl bg-gray-900/80 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
              >
                <p className="text-sm text-white/90 leading-relaxed">{currentSubtitle}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-[10px] text-white/40">{voiceName || 'AI Voice'}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Orb */}
          <div className="relative">
            {/* Glow rings when speaking */}
            {isSpeaking && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0.5 }}
                animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-0 rounded-full border border-cyan-400/20"
                style={{ width: 72, height: 72, left: -4, top: -4 }}
              />
            )}

            {/* Orb body */}
            <motion.button
              onClick={() => {
                if (isNarrating) stopNarration();
                else startNarration();
              }}
              animate={{
                scale: isSpeaking ? [1, 1.06, 1] : [1, 1.03, 1],
              }}
              transition={{
                duration: isSpeaking ? 1.2 : 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="relative w-16 h-16 rounded-full cursor-pointer group"
              style={{
                background: isSpeaking
                  ? 'radial-gradient(circle at 35% 30%, rgba(0,200,255,0.9), rgba(80,0,200,0.5), rgba(0,0,0,0.3))'
                  : 'radial-gradient(circle at 35% 30%, rgba(100,200,255,0.6), rgba(60,0,180,0.3), rgba(0,0,0,0.2))',
                boxShadow: isSpeaking
                  ? '0 0 30px rgba(0,200,255,0.4), 0 0 60px rgba(0,200,255,0.15), inset 0 0 20px rgba(255,255,255,0.1)'
                  : '0 0 20px rgba(100,200,255,0.2), 0 0 40px rgba(100,200,255,0.08)',
              }}
            >
              {/* Inner core */}
              <div
                className="absolute inset-2 rounded-full"
                style={{
                  background: isSpeaking
                    ? 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.4), transparent)'
                    : 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.2), transparent)',
                }}
              />
              {/* Center icon */}
              <Sparkles size={20} className={`absolute inset-0 m-auto ${isSpeaking ? 'text-white' : 'text-white/60'}`} />
            </motion.button>

            {/* Close button */}
            <button
              onClick={() => { hideAI(); setDismissed(true); }}
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gray-800 border border-white/10 flex items-center justify-center hover:bg-gray-700 transition-colors"
            >
              <X size={10} className="text-white/60" />
            </button>
          </div>
        </motion.div>

        {/* Controls bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900/70 backdrop-blur-lg border border-white/10"
        >
          <button
            onClick={toggleMute}
            className="p-1.5 rounded-lg hover:bg-white/5 text-white/60 hover:text-white transition-all"
            title={prefs.muted ? 'Unmute music' : 'Mute music'}
          >
            {prefs.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>

          {isNarrating ? (
            <button
              onClick={stopNarration}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 transition-all"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={startNarration}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-300 transition-all"
            >
              <Repeat size={12} />
              Replay
            </button>
          )}

          {voicesReady && (
            <span className="hidden sm:block text-[10px] text-white/30 max-w-[100px] truncate border-l border-white/10 pl-2">
              {voiceName}
            </span>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
