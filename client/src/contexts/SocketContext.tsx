import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  onlineUsers: Set<number>;
  typingUsers: Record<number, string[]>;
  joinChannel: (channelId: number) => void;
  leaveChannel: (channelId: number) => void;
  sendTypingStart: (channel_id: number, user_name: string) => void;
  sendTypingStop: (channel_id: number) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Record<number, string[]>>({});
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
      setConnected(false);
      return;
    }

    const s = io({ transports: ['websocket', 'polling'] });
    socketRef.current = s;

    s.on('connect', () => {
      setConnected(true);
      s.emit('authenticate', { id: user.id, name: user.name, role: user.role });
    });

    s.on('disconnect', () => setConnected(false));
    s.on('authenticated', () => {});

    s.on('user_online', (data: { user_id: number; user_name: string }) => {
      setOnlineUsers(prev => new Set(prev).add(data.user_id));
    });

    s.on('user_offline', (data: { user_id: number }) => {
      setOnlineUsers(prev => { const n = new Set(prev); n.delete(data.user_id); return n; });
    });

    s.on('user_typing', (data: { channel_id: number; user_id: number; user_name: string }) => {
      setTypingUsers(prev => {
        const channelTyping = [...(prev[data.channel_id] || [])];
        if (!channelTyping.includes(data.user_name)) channelTyping.push(data.user_name);
        return { ...prev, [data.channel_id]: channelTyping };
      });
      setTimeout(() => {
        setTypingUsers(prev => {
          const channelTyping = (prev[data.channel_id] || []).filter(n => n !== data.user_name);
          return { ...prev, [data.channel_id]: channelTyping };
        });
      }, 4000);
    });

    s.on('user_stopped_typing', (data: { channel_id: number; user_id: number }) => {
      setTypingUsers(prev => {
        const channelTyping = (prev[data.channel_id] || []).filter(n => n !== '');
        return { ...prev, [data.channel_id]: channelTyping };
      });
    });

    return () => { s.disconnect(); };
  }, [user, token]);

  const joinChannel = useCallback((channelId: number) => {
    socketRef.current?.emit('channel_join', channelId);
  }, []);

  const leaveChannel = useCallback((channelId: number) => {
    socketRef.current?.emit('channel_leave', channelId);
  }, []);

  const sendTypingStart = useCallback((channel_id: number, user_name: string) => {
    socketRef.current?.emit('typing_start', { channel_id, user_name });
  }, []);

  const sendTypingStop = useCallback((channel_id: number) => {
    socketRef.current?.emit('typing_stop', { channel_id });
  }, []);

  return (
    <SocketContext.Provider value={{
      socket, connected, onlineUsers, typingUsers,
      joinChannel, leaveChannel, sendTypingStart, sendTypingStop,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
