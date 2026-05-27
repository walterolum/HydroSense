import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX, Bell, X, Play, Save } from 'lucide-react';
import { useNotificationSound, NotificationSound } from '../../hooks/useNotificationSound';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SOUND_TYPES: { type: NotificationSound; label: string }[] = [
  { type: 'chime', label: 'Default Chime' },
  { type: 'new_event', label: 'New Event' },
  { type: 'event_start', label: 'Event Start Alarm' },
  { type: 'reminder', label: 'Event Reminder' },
  { type: 'mention', label: 'Mention' },
  { type: 'reply', label: 'Reply' },
  { type: 'alert', label: 'System Alert' },
];

export default function NotificationPreferences({ open, onClose }: Props) {
  const { preview, setVolume, setMuted, getPrefs } = useNotificationSound();
  const [volume, setVol] = useState(0.7);
  const [muted, setMut] = useState(false);

  useEffect(() => {
    if (open) {
      const prefs = getPrefs();
      setVol(prefs.volume);
      setMut(prefs.muted);
    }
  }, [open]);

  const handleVolume = (val: number) => {
    setVol(val);
    setVolume(val);
  };

  const toggleMute = () => {
    setMut(!muted);
    setMuted(!muted);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="fixed top-16 right-4 z-[160] w-full max-w-sm rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-emerald-500" />
              <span className="font-bold text-gray-800 dark:text-gray-100 text-sm">Notification Sounds</span>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
              <X size={16} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Master volume & mute */}
            <div className="flex items-center gap-3">
              <button onClick={toggleMute}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                  muted
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-500'
                    : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'
                }`}>
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <div className="flex-1">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center justify-between">
                  <span>{muted ? 'Muted' : `Volume ${Math.round(volume * 100)}%`}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={e => handleVolume(parseFloat(e.target.value))}
                  disabled={muted}
                  className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-emerald-500 mt-1 disabled:opacity-40"
                  style={{
                    background: `linear-gradient(to right, ${muted ? '#9ca3af' : '#10b981'} ${volume * 100}%, #e5e7eb ${volume * 100}%)`,
                  }}
                />
              </div>
            </div>

            {/* Sound preview list */}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Preview Sounds</p>
              {SOUND_TYPES.map(st => (
                <button
                  key={st.type}
                  onClick={() => preview(st.type)}
                  disabled={muted}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
                    <Play size={12} className="text-white fill-white" />
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">{st.label}</span>
                  <span className="text-[10px] text-gray-400">{st.type === 'event_start' ? '🔊 Loud' : st.type === 'chime' ? '🔈 Soft' : '🔉 Medium'}</span>
                </button>
              ))}
            </div>

            {/* Info */}
            <div className="px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400">
              <p className="font-semibold text-gray-600 dark:text-gray-300 mb-1">🔊 About Notification Sounds</p>
              <p>Sounds are generated using Web Audio API — no audio files needed. Works on all modern browsers including mobile.</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
