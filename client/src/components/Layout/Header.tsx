import { useState, useEffect, useRef } from 'react';
import { Bell, Menu, Sun, Moon, CheckCheck, X, Volume2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useNotifications } from '../../contexts/NotificationContext';
import NotificationPopup from '../Notifications/NotificationPopup';
import NotificationHistory from '../Notifications/NotificationHistory';
import NotificationPreferences from '../Notifications/NotificationPreferences';
import EventStartAlarm from '../Notifications/EventStartAlarm';
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

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface HeaderProps {
  onMenuClick: () => void;
  title: string;
}

export default function Header({ onMenuClick, title }: HeaderProps) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, translate } = useLanguage();
  const { unreadCount, activeAlarm, dismissAlarm } = useNotifications();
  const [translatedTitle, setTranslatedTitle] = useState(title);
  const [tNotifications, setTNotifications] = useState('Notifications');
  const [tMarkAllRead, setTMarkAllRead] = useState('Mark all read');
  const [tNoNotifications, setTNoNotifications] = useState('No notifications');
  const [notifHistoryOpen, setNotifHistoryOpen] = useState(false);
  const [soundPrefsOpen, setSoundPrefsOpen] = useState(false);
  const [time, setTime] = useState(new Date());
  const [lastNotif, setLastNotif] = useState<any>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  // Track incoming notifications for the popup
  useEffect(() => {
    if (activeAlarm) {
      setLastNotif(activeAlarm);
    }
  }, [activeAlarm]);

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
  }, [language, title]);

  useEffect(() => {
    const tick = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Close history panel on outside click
  useEffect(() => {
    if (!notifHistoryOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current && !bellRef.current.contains(e.target as Node)
      ) {
        setNotifHistoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifHistoryOpen]);

  const handleBellClick = () => {
    setNotifHistoryOpen(v => !v);
    setSoundPrefsOpen(false);
  };

  const initials = user
    ? user.name.split(' ').map((n: string) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : '?';

  const avatarColor = roleColors[user?.role || ''] || 'bg-blue-600';

  return (
    <>
      {/* Global notification popup (floating card) */}
      <NotificationPopup
        notification={lastNotif && lastNotif.type !== 'event_start' ? lastNotif : null}
        onDismiss={() => setLastNotif(null)}
        onJoin={(n) => { setLastNotif(null); window.location.href = '/citizen-hub'; }}
      />

      {/* Fullscreen event start alarm */}
      <EventStartAlarm
        alarm={activeAlarm}
        onDismiss={dismissAlarm}
        onJoin={() => { dismissAlarm(); window.location.href = '/citizen-hub'; }}
      />

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

          {/* Sound preferences */}
          <button
            onClick={() => { setSoundPrefsOpen(v => !v); setNotifHistoryOpen(false); }}
            title="Notification Sounds"
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <Volume2 size={18} />
          </button>

          <NotificationPreferences open={soundPrefsOpen} onClose={() => setSoundPrefsOpen(false)} />

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
          </div>

          {/* User avatar */}
          {user && (
            <div className="flex items-center gap-2.5 pl-2 border-l border-gray-100 dark:border-gray-800">
              <div className={`w-8 h-8 rounded-xl flex-shrink-0 overflow-hidden shadow-sm ${user.avatar ? '' : `${avatarColor} flex items-center justify-center`}`}>
                {user.avatar
                  ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                  : <span className="text-white text-xs font-bold">{initials}</span>}
              </div>
              <div className="hidden sm:block leading-tight">
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{user.name.split(' ')[0]}</div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500 capitalize">{user.role.replace(/_/g, ' ')}</div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Notification history panel (rendered outside header for z-index) */}
      <NotificationHistory open={notifHistoryOpen} onClose={() => setNotifHistoryOpen(false)} />
    </>
  );
}
