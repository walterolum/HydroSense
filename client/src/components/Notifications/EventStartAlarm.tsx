import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, MapPin, Video, ExternalLink, Bell, X, CheckCircle } from 'lucide-react';
import { NotificationRecord } from '../../contexts/NotificationContext';

interface Props {
  alarm: NotificationRecord | null;
  onDismiss: () => void;
  onJoin?: (n: NotificationRecord) => void;
}

export default function EventStartAlarm({ alarm, onDismiss, onJoin }: Props) {
  const [countdown, setCountdown] = useState('');
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!alarm || alarm.type !== 'event_start') { setPhase('enter'); return; }

    setPhase('show');

    let alarmCtx: AudioContext | null = null;

    // Play alarm sound
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      alarmCtx = ctx;
      const now = ctx.currentTime;
      const notes = [783.99, 659.25, 523.25, 392];
      for (let rep = 0; rep < 3; rep++) {
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.value = freq;
          const g = ctx.createGain();
          const t = now + rep * 1.0 + i * 0.18;
          g.gain.setValueAtTime(0.001, t);
          g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
          osc.connect(g).connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.16);
        });
      }
      setTimeout(() => { if (alarmCtx) alarmCtx.close(); }, 5000);
    } catch {}

    // Countdown timer
    const interval = setInterval(() => {
      if (alarm.event_data?.time) {
        const [h, m] = alarm.event_data.time.split(':').map(Number);
        const eventTime = new Date();
        eventTime.setHours(h, m, 0, 0);
        const diff = eventTime.getTime() - Date.now();
        if (diff <= 0) { setCountdown('Now'); clearInterval(interval); return; }
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
      }
    }, 1000);

    return () => { clearInterval(interval); if (alarmCtx) alarmCtx.close(); };
  }, [alarm]);

  const handleDismiss = () => {
    setPhase('exit');
    setTimeout(onDismiss, 300);
  };

  const handleJoin = () => {
    if (alarm && onJoin) onJoin(alarm);
    handleDismiss();
  };

  if (!alarm) return null;

  const isOnline = alarm.event_data?.isOnline ?? ['online', 'hybrid'].includes(alarm.event_data?.event_type || '');
  const ed = alarm.event_data;

  return (
    <AnimatePresence>
      {phase !== 'exit' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="w-full max-w-md mx-4"
          >
            <div className="rounded-3xl overflow-hidden shadow-2xl border-2 border-amber-400/50 bg-gradient-to-br from-amber-50 via-orange-50 to-white dark:from-amber-950 dark:via-orange-950 dark:to-gray-950">
              {/* Animated pulse bar */}
              <div className="h-2 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 animate-pulse" />

              <div className="p-6 text-center">
                {/* Icon */}
                <motion.div
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg"
                >
                  <Bell size={36} className="text-white fill-white" />
                </motion.div>

                <h2 className="text-2xl font-black text-amber-800 dark:text-amber-200 mb-1">
                  Event Starting Now
                </h2>

                {/* Event title */}
                <p className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1">
                  {ed?.title || alarm.subject}
                </p>

                {/* Countdown */}
                {countdown && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-bold text-sm mb-4">
                    <Clock size={14} />
                    {countdown === 'Now' ? 'Starting Now' : `${countdown} until start`}
                  </div>
                )}

                {/* Event details */}
                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400 mb-6 text-left bg-white/50 dark:bg-gray-900/50 rounded-2xl p-4">
                  {ed?.date && (
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-amber-500" />
                      <span>{ed.date} {ed.time && `at ${ed.time}`}</span>
                    </div>
                  )}
                  {ed?.location && (
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-amber-500" />
                      <span>{ed.location}</span>
                    </div>
                  )}
                  {ed?.district && (
                    <div className="flex items-center gap-2 text-xs">
                      <MapPin size={12} className="text-gray-400" />
                      <span>{ed.district} District</span>
                    </div>
                  )}
                  {isOnline && ed?.meeting_link && (
                    <a href={ed.meeting_link} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-600 hover:underline font-semibold">
                      <Video size={14} />
                      Join Meeting Link
                      <ExternalLink size={10} />
                    </a>
                  )}
                  {ed?.venue && (
                    <div className="flex items-center gap-2 text-xs">
                      <MapPin size={12} className="text-gray-400" />
                      <span>Venue: {ed.venue}</span>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button onClick={handleDismiss}
                    className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    Dismiss
                  </button>
                  <button onClick={handleJoin}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:shadow-lg hover:from-amber-600 hover:to-orange-600 transition-all active:scale-[0.97] flex items-center justify-center gap-2">
                    <CheckCircle size={16} />
                    Join Event
                  </button>
                </div>

                {isOnline && ed?.meeting_link && (
                  <button onClick={() => window.open(ed.meeting_link!, '_blank')}
                    className="mt-2 w-full py-2.5 rounded-xl bg-blue-500 text-white font-bold text-sm hover:bg-blue-600 transition-all active:scale-[0.97] flex items-center justify-center gap-2">
                    <Video size={16} />
                    Open Meeting Link
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
