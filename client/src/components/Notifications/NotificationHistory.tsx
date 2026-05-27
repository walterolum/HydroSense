import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Calendar, MapPin, Video, CheckCircle, Trash2, Clock } from 'lucide-react';
import { NotificationRecord, useNotifications } from '../../contexts/NotificationContext';
import { markNotificationRead, getNotifications } from '../../api/client';

interface Props {
  open: boolean;
  onClose: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  event_posted: '📢',
  event_start: '🔔',
  event_reminder: '⏰',
  mention: '💬',
  reply: '↩️',
  alert: '⚠️',
};

export default function NotificationHistory({ open, onClose }: Props) {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [history, setHistory] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = async () => {
    if (history.length > 0) return;
    setLoading(true);
    try {
      const r = await getNotifications({ limit: 50 });
      setHistory(r.data.data || []);
    } catch {} finally { setLoading(false); }
  };

  const handleMarkRead = (n: NotificationRecord) => {
    markRead(n.id);
    markNotificationRead(n.id).catch(() => {});
  };

  const handleMarkAllRead = () => {
    markAllRead();
    import('../../api/client').then(m => m.markAllNotificationsRead()).catch(() => {});
  };

  const allItems = notifications.length > 0
    ? notifications
    : history;

  const filtered = filter === 'unread' ? allItems.filter(n => !n.read_at) : allItems;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="fixed top-16 right-4 z-[150] w-full max-w-sm max-h-[70vh] flex flex-col rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-emerald-500" />
              <span className="font-bold text-gray-800 dark:text-gray-100 text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
              <X size={16} />
            </button>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-800">
            <button onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === 'all' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              All
            </button>
            <button onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === 'unread' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              Unread {unreadCount > 0 && `(${unreadCount})`}
            </button>
            <div className="flex-1" />
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold px-2 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto overscroll-contain" onMouseEnter={loadHistory}>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Bell size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm font-medium">No notifications</p>
                <p className="text-xs mt-1">You're all caught up!</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((n, i) => (
                  <motion.div
                    key={n.id || i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    onClick={() => handleMarkRead(n)}
                    className={`px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${!n.read_at ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-base flex-shrink-0">{TYPE_ICONS[n.type] || '🔔'}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold ${!n.read_at ? 'text-gray-800 dark:text-gray-100' : 'text-gray-500'}`}>
                          {n.subject}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                          <Clock size={8} />
                          {new Date(n.sent_at).toLocaleString()}
                          {n.district && <> · {n.district}</>}
                        </div>
                      </div>
                      {!n.read_at && <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 mt-1" />}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Footer actions */}
          {filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex justify-between">
              <button onClick={() => { clearAll(); setHistory([]); }}
                className="text-xs text-red-500 hover:text-red-600 font-semibold flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                <Trash2 size={10} /> Clear All
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
