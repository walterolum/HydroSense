import { useState, useEffect, useRef } from 'react';
import { Bell, Menu, Sun, Moon, CheckCheck, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { getNotifications, getNotificationUnreadCount, markNotificationRead, markAllNotificationsRead } from '../../api/client';
import AIStatusIndicator from '../common/AIStatusIndicator';
import LanguageSwitcher from '../common/LanguageSwitcher';

const roleColors: Record<string, string> = {
  national_admin:      'bg-purple-500',
  district_officer:    'bg-blue-500',
  community_committee: 'bg-emerald-500',
  citizen:             'bg-gray-400',
  ngo_officer:         'bg-orange-500',
  technician:          'bg-yellow-500',
  health_officer:      'bg-red-500',
  climate_scientist:   'bg-cyan-500',
};

interface Notification {
  id: number;
  subject: string | null;
  message: string;
  sent_at: string;
  read_at: string | null;
  reference_type: string | null;
  reference_id: number | null;
}

interface HeaderProps {
  onMenuClick: () => void;
  title: string;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Header({ onMenuClick, title }: HeaderProps) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, translate } = useLanguage();
  const [translatedTitle, setTranslatedTitle] = useState(title);
  const [tNotifications, setTNotifications] = useState('Notifications');
  const [tMarkAllRead, setTMarkAllRead] = useState('Mark all read');
  const [tNoNotifications, setTNoNotifications] = useState('No notifications');
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [time, setTime] = useState(new Date());
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const fetchUnread = () => {
    getNotificationUnreadCount()
      .then(r => setUnreadCount(r.data.count ?? 0))
      .catch(() => {});
  };

  const fetchNotifications = () => {
    getNotifications({ limit: 20 })
      .then(r => setNotifications(r.data.data ?? []))
      .catch(() => {});
  };

  useEffect(() => {
    fetchUnread();
    const poll = setInterval(fetchUnread, 30000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Close panel on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current && !bellRef.current.contains(e.target as Node)
      ) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  const handleBellClick = () => {
    if (!notifOpen) fetchNotifications();
    setNotifOpen(v => !v);
  };

  const handleMarkRead = async (id: number) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch {}
  };

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
      setUnreadCount(0);
    } catch {}
  };

  useEffect(() => {
    if (language === 'en') {
      setTranslatedTitle(title);
      setTNotifications('Notifications');
      setTMarkAllRead('Mark all read');
      setTNoNotifications('No notifications');
      return;
    }
    translate(title).then(setTranslatedTitle);
    translate('Notifications').then(setTNotifications);
    translate('Mark all read').then(setTMarkAllRead);
    translate('No notifications').then(setTNoNotifications);
  }, [language, title]); // eslint-disable-line react-hooks/exhaustive-deps

  const initials = user
    ? user.name.split(' ').map((n: string) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : '?';

  const avatarColor = roleColors[user?.role || ''] || 'bg-blue-600';

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-2.5 flex items-center gap-3 sticky top-0 z-10 shadow-sm transition-colors duration-200">

      {/* Hamburger (mobile) */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
      >
        <Menu size={19} />
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{translatedTitle}</h1>
        <div className="text-xs text-gray-400 dark:text-gray-500">
          {time.toLocaleDateString('en-UG', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
          {' · '}
          {time.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">

        {/* AI Status Indicator */}
        <div className="hidden sm:block">
          <AIStatusIndicator compact />
        </div>

        {/* Language Switcher */}
        <LanguageSwitcher compact />

        {/* Dark / Light toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          {theme === 'dark'
            ? <Sun size={18} className="text-yellow-400" />
            : <Moon size={18} />}
        </button>

        {/* Notification bell */}
        <div className="relative">
          <button
            ref={bellRef}
            onClick={handleBellClick}
            className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            title="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown panel */}
          {notifOpen && (
            <div
              ref={panelRef}
              className="fixed left-2 right-2 top-[62px] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 lg:w-96 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{tNotifications}</span>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAll}
                      className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      title="Mark all as read"
                    >
                      <CheckCheck size={13} />
                      {tMarkAllRead}
                    </button>
                  )}
                  <button
                    onClick={() => setNotifOpen(false)}
                    className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                    {tNoNotifications}
                  </div>
                ) : (
                  notifications.map(n => (
                    <button
                      key={n.id}
                      onClick={() => { if (!n.read_at) handleMarkRead(n.id); }}
                      className={`w-full text-left px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
                        n.read_at ? '' : 'bg-blue-50/60 dark:bg-blue-950/30'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Unread dot */}
                        <div className="mt-1.5 flex-shrink-0">
                          {n.read_at
                            ? <div className="w-2 h-2 rounded-full bg-transparent border border-gray-300 dark:border-gray-600" />
                            : <div className="w-2 h-2 rounded-full bg-blue-500" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          {n.subject && (
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                              {n.subject}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                            {n.message}
                          </p>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                            {timeAgo(n.sent_at)}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User avatar */}
        {user && (
          <div className="flex items-center gap-2.5 pl-2 border-l border-gray-100 dark:border-gray-800">
            <div className={`w-8 h-8 rounded-xl ${avatarColor} flex items-center justify-center text-white text-xs font-bold shadow-sm`}>
              {initials}
            </div>
            <div className="hidden sm:block leading-tight">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{user.name.split(' ')[0]}</div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500 capitalize">{user.role.replace(/_/g, ' ')}</div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
