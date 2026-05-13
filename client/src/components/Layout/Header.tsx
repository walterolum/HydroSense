import { useState, useEffect } from 'react';
import { Bell, Menu, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getAlerts } from '../../api/client';
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

interface HeaderProps {
  onMenuClick: () => void;
  title: string;
}

export default function Header({ onMenuClick, title }: HeaderProps) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [alertCount, setAlertCount] = useState(0);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    getAlerts({ status: 'active', limit: 1 }).then(r => setAlertCount(r.data.total)).catch(() => {});
    const poll = setInterval(() => {
      getAlerts({ status: 'active', limit: 1 }).then(r => setAlertCount(r.data.total)).catch(() => {});
    }, 30000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  const initials = user
    ? user.name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
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
        <h1 className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{title}</h1>
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

        {/* Alert bell */}
        <a
          href="/emergency"
          className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <Bell size={18} />
          {alertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold animate-pulse">
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </a>

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
