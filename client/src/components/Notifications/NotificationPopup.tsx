import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Calendar, MapPin, Video, ExternalLink } from 'lucide-react';
import { NotificationRecord } from '../../contexts/NotificationContext';

interface Props {
  notification: NotificationRecord | null;
  onDismiss: () => void;
  onJoin?: (n: NotificationRecord) => void;
}

export default function NotificationPopup({ notification, onDismiss, onJoin }: Props) {
  const [visible, setVisible] = useState(false);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (notification) {
      setVisible(true);
      // Auto-dismiss after 8 seconds for non-urgent
      if (notification.priority !== 'urgent') {
        const t = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 300); }, 8000);
        setTimer(t);
      }
    } else {
      setVisible(false);
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [notification]);

  if (!notification) return null;

  const isOnline = notification.event_data?.isOnline ?? ['online', 'hybrid'].includes(notification.event_data?.event_type || '');
  const isUrgent = notification.priority === 'urgent';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: 80, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 80, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className="fixed top-4 right-4 z-[100] max-w-sm w-full pointer-events-auto"
        >
          <div className={`rounded-2xl shadow-2xl border overflow-hidden backdrop-blur-sm ${
            isUrgent
              ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/90 dark:to-orange-950/90 border-amber-300 dark:border-amber-700'
              : 'bg-white/95 dark:bg-gray-900/95 border-gray-200 dark:border-gray-700'
          }`}>
            {/* Header bar */}
            <div className={`h-1.5 ${isUrgent ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-emerald-500 to-cyan-500'}`} />

            <div className="p-4">
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isUrgent
                    ? 'bg-amber-100 dark:bg-amber-800/50 text-amber-600'
                    : 'bg-emerald-100 dark:bg-emerald-800/50 text-emerald-600'
                }`}>
                  {notification.type === 'event_start' ? (
                    <Bell size={20} className="fill-current" />
                  ) : (
                    <Bell size={20} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`font-bold text-sm truncate ${isUrgent ? 'text-amber-800 dark:text-amber-200' : 'text-gray-800 dark:text-gray-100'}`}>
                      {notification.subject}
                    </p>
                    <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                  <p className={`text-xs mt-0.5 line-clamp-2 ${isUrgent ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400'}`}>
                    {notification.message}
                  </p>

                  {/* Event details */}
                  {notification.event_data && (
                    <div className={`mt-2 space-y-1 text-xs ${isUrgent ? 'text-amber-600' : 'text-gray-500'}`}>
                      {notification.event_data.title && (
                        <p className="font-semibold">{notification.event_data.title}</p>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Calendar size={10} />
                        {notification.event_data.date} {notification.event_data.time && `at ${notification.event_data.time}`}
                      </div>
                      {notification.event_data.location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin size={10} /> {notification.event_data.location}
                        </div>
                      )}
                      {isOnline && notification.event_data.meeting_link && (
                        <a href={notification.event_data.meeting_link} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-blue-600 hover:underline">
                          <Video size={10} /> Join Online
                          <ExternalLink size={8} />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className={`flex gap-2 mt-3 ${isUrgent ? '' : ''}`}>
                    {notification.type === 'event_start' && onJoin && (
                      <button onClick={() => onJoin(notification)}
                        className="flex-1 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold hover:shadow-lg transition-all active:scale-95">
                        Join Event Now
                      </button>
                    )}
                    {notification.type === 'event_posted' && onJoin && (
                      <button onClick={() => onJoin(notification)}
                        className="flex-1 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-xs font-bold hover:shadow-lg transition-all active:scale-95">
                        View Event
                      </button>
                    )}
                    <button onClick={onDismiss}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                        isUrgent
                          ? 'bg-amber-100 dark:bg-amber-800/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                      }`}>
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
