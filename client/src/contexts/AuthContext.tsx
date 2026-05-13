import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { User } from '../types';
import { login as apiLogin, getMe } from '../api/client';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_MS = 2 * 60 * 1000;   // warn 2 min before

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isRole: (...roles: string[]) => boolean;
  refreshUser: () => Promise<void>;
  patchUser: (partial: Partial<User>) => void;
  sessionTimeRemaining: number | null;
  sessionWarning: boolean;
  extendSession: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionTimeRemaining, setSessionTimeRemaining] = useState<number | null>(null);
  const [sessionWarning, setSessionWarning] = useState(false);

  const lastActivityRef = useRef(Date.now());
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const logout = useCallback(() => {
    localStorage.removeItem('hs_token');
    localStorage.removeItem('hs_user');
    setToken(null);
    setUser(null);
    setSessionTimeRemaining(null);
    setSessionWarning(false);
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
  }, []);

  const extendSession = useCallback(() => {
    lastActivityRef.current = Date.now();
    setSessionWarning(false);
  }, []);

  const startSessionTimer = useCallback(() => {
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    lastActivityRef.current = Date.now();
    setSessionWarning(false);
    sessionTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = SESSION_TIMEOUT_MS - elapsed;
      if (remaining <= 0) {
        logout();
      } else {
        setSessionTimeRemaining(Math.max(0, remaining));
        setSessionWarning(remaining < WARNING_BEFORE_MS);
      }
    }, 1000);
  }, [logout]);

  useEffect(() => {
    const onActivity = () => {
      if (user) extendSession();
    };
    window.addEventListener('mousedown', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('touchstart', onActivity);
    return () => {
      window.removeEventListener('mousedown', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('touchstart', onActivity);
    };
  }, [user, extendSession]);

  useEffect(() => {
    const storedToken = localStorage.getItem('hs_token');
    const storedUser = localStorage.getItem('hs_user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      startSessionTimer();
      getMe().then(r => {
        setUser(r.data.user);
        localStorage.setItem('hs_user', JSON.stringify(r.data.user));
      }).catch(() => {
        logout();
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    };
  }, [logout, startSessionTimer]);

  const login = async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    const { token: t, user: u } = res.data;
    localStorage.setItem('hs_token', t);
    localStorage.setItem('hs_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
    startSessionTimer();
  };

  const isRole = (...roles: string[]) => !!user && roles.includes(user.role);

  const refreshUser = async () => {
    const r = await getMe();
    setUser(r.data.user);
    localStorage.setItem('hs_user', JSON.stringify(r.data.user));
  };

  const patchUser = (partial: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...partial };
      localStorage.setItem('hs_user', JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isRole, refreshUser, patchUser, sessionTimeRemaining, sessionWarning, extendSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
