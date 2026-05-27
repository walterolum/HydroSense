import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { useNotificationSound, NotificationSound } from '../hooks/useNotificationSound';
import { getNotificationUnreadCount } from '../api/client';

export interface EventData {
  title: string;
  description?: string;
  date: string;
  time: string;
  location?: string;
  district?: string;
  event_type?: string;
  organizer?: string;
  meeting_link?: string | null;
  venue?: string | null;
  isOnline?: boolean;
  minutesBefore?: number;
}

export interface NotificationRecord {
  id: number;
  recipient_type: string;
  recipient_id: number;
  channel: string;
  subject: string;
  message: string;
  status: string;
  reference_type?: string;
  reference_id?: number;
  district?: string;
  sent_at: string;
  read_at?: string | null;
  type: 'event_posted' | 'event_start' | 'event_reminder' | 'mention' | 'reply' | 'alert' | 'chime';
  sound: NotificationSound;
  priority: 'normal' | 'high' | 'urgent';
  event_data: EventData | null;
}

interface NotificationContextType {
  notifications: NotificationRecord[];
  unreadCount: number;
  activeAlarm: NotificationRecord | null;
  addNotification: (n: NotificationRecord) => void;
  dismissAlarm: () => void;
  clearAll: () => void;
  markRead: (id: number) => void;
  markAllRead: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const { play } = useNotificationSound();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeAlarm, setActiveAlarm] = useState<NotificationRecord | null>(null);
  const prefMuted = useRef(false);

  // Load unread count on mount
  useEffect(() => {
    if (!user) { setUnreadCount(0); return; }
    getNotificationUnreadCount().then(r => setUnreadCount(r.data.count)).catch(() => {});
  }, [user]);

  const addNotification = useCallback((n: NotificationRecord) => {
    setNotifications(prev => [n, ...prev].slice(0, 100));
    setUnreadCount(prev => prev + 1);

    // Check mute preference
    try {
      const raw = localStorage.getItem('hs_notif_sound_prefs');
      if (raw) {
        const p = JSON.parse(raw);
        if (p.muted) return;
      }
    } catch {}

    // Play sound based on type
    play(n.sound || 'chime');

    // Show urgent alarms as fullscreen popup
    if (n.priority === 'urgent' || n.type === 'event_start') {
      setActiveAlarm(n);
    }
  }, [play]);

  const dismissAlarm = useCallback(() => setActiveAlarm(null), []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  const markRead = useCallback((id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    setUnreadCount(0);
  }, []);

  // Listen for real-time notifications from Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handleNewNotif = (data: NotificationRecord) => {
      addNotification(data);
    };

    const handleCount = (data: { count: number }) => {
      setUnreadCount(data.count);
    };

    socket.on('notification:new', handleNewNotif);
    socket.on('notification:count', handleCount);

    return () => {
      socket.off('notification:new', handleNewNotif);
      socket.off('notification:count', handleCount);
    };
  }, [socket, addNotification]);

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      activeAlarm,
      addNotification,
      dismissAlarm,
      clearAll,
      markRead,
      markAllRead,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
