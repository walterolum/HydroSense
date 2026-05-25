import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { User } from '../types';
import { login as apiLogin, getMe } from '../api/client';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;     // 30-min inactivity for non-remembered sessions
const WARNING_BEFORE_MS  =  2 * 60 * 1000;
const REMEMBER_MS        = 365 * 24 * 60 * 60 * 1000; // 365 days (matches server JWT expiry)

// Storage keys
const K_TOKEN   = 'hs_token';
const K_USER    = 'hs_user';
const K_EXPIRY  = 'hs_expiry';   // only written for remembered logins

function saveSession(token: string, user: User, remember: boolean) {
  if (remember) {
    const expiry = Date.now() + REMEMBER_MS;
    localStorage.setItem(K_TOKEN,  token);
    localStorage.setItem(K_USER,   JSON.stringify(user));
    localStorage.setItem(K_EXPIRY, String(expiry));
    // Clear any stale sessionStorage entry so the two don't conflict
    sessionStorage.removeItem(K_TOKEN);
    sessionStorage.removeItem(K_USER);
  } else {
    sessionStorage.setItem(K_TOKEN, token);
    sessionStorage.setItem(K_USER,  JSON.stringify(user));
    // Clear any stale localStorage entry
    localStorage.removeItem(K_TOKEN);
    localStorage.removeItem(K_USER);
    localStorage.removeItem(K_EXPIRY);
  }
}

function clearSession() {
  sessionStorage.removeItem(K_TOKEN);
  sessionStorage.removeItem(K_USER);
  localStorage.removeItem(K_TOKEN);
  localStorage.removeItem(K_USER);
  localStorage.removeItem(K_EXPIRY);
}

// Returns { token, user, remembered } or null
function readStoredSession(): { token: string; user: User; remembered: boolean } | null {
  // Try localStorage first (remembered login)
  const lsToken  = localStorage.getItem(K_TOKEN);
  const lsUser   = localStorage.getItem(K_USER);
  const lsExpiry = localStorage.getItem(K_EXPIRY);
  if (lsToken && lsUser && lsExpiry && Date.now() < Number(lsExpiry)) {
    try {
      return { token: lsToken, user: JSON.parse(lsUser), remembered: true };
    } catch {}
  }

  // Fall back to sessionStorage (tab-only session)
  const ssToken = sessionStorage.getItem(K_TOKEN);
  const ssUser  = sessionStorage.getItem(K_USER);
  if (ssToken && ssUser) {
    try {
      return { token: ssToken, user: JSON.parse(ssUser), remembered: false };
    } catch {}
  }

  return null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
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
  const [user, setUser]                           = useState<User | null>(null);
  const [token, setToken]                         = useState<string | null>(null);
  const [loading, setLoading]                     = useState(true);
  const [sessionTimeRemaining, setSessionRemaining] = useState<number | null>(null);
  const [sessionWarning, setSessionWarning]       = useState(false);
  const [remembered, setRemembered]               = useState(false);

  const lastActivityRef  = useRef(Date.now());
  const sessionTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopSessionTimer = useCallback(() => {
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
    setRemembered(false);
    setSessionRemaining(null);
    setSessionWarning(false);
    stopSessionTimer();
  }, [stopSessionTimer]);

  const extendSession = useCallback(() => {
    lastActivityRef.current = Date.now();
    setSessionWarning(false);
  }, []);

  // Start the 30-min inactivity timer — only used for non-remembered sessions
  const startSessionTimer = useCallback(() => {
    stopSessionTimer();
    lastActivityRef.current = Date.now();
    setSessionWarning(false);
    sessionTimerRef.current = setInterval(() => {
      const elapsed   = Date.now() - lastActivityRef.current;
      const remaining = SESSION_TIMEOUT_MS - elapsed;
      if (remaining <= 0) {
        logout();
      } else {
        setSessionRemaining(Math.max(0, remaining));
        setSessionWarning(remaining < WARNING_BEFORE_MS);
      }
    }, 1000);
  }, [logout, stopSessionTimer]);

  // Track user activity — only matters when a session timer is running
  useEffect(() => {
    const onActivity = () => {
      if (user && !remembered) extendSession();
    };
    window.addEventListener('mousedown', onActivity);
    window.addEventListener('keydown',   onActivity);
    window.addEventListener('touchstart', onActivity);
    return () => {
      window.removeEventListener('mousedown', onActivity);
      window.removeEventListener('keydown',   onActivity);
      window.removeEventListener('touchstart', onActivity);
    };
  }, [user, remembered, extendSession]);

  // Boot: restore session from storage
  useEffect(() => {
    const stored = readStoredSession();
    if (stored) {
      setToken(stored.token);
      setUser(stored.user);
      setRemembered(stored.remembered);
      if (!stored.remembered) startSessionTimer();

      // Validate token is still alive on the server
      getMe()
        .then(r => {
          setUser(r.data.user);
          if (stored.remembered) {
            localStorage.setItem(K_USER, JSON.stringify(r.data.user));
          } else {
            sessionStorage.setItem(K_USER, JSON.stringify(r.data.user));
          }
        })
        .catch(() => logout())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    return stopSessionTimer;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email: string, password: string, rememberMe = false) => {
    const res = await apiLogin(email, password, rememberMe);
    const { token: t, user: u } = res.data;
    saveSession(t, u, rememberMe);
    setToken(t);
    setUser(u);
    setRemembered(rememberMe);
    if (rememberMe) {
      // No inactivity timer for remembered sessions
      stopSessionTimer();
      setSessionRemaining(null);
      setSessionWarning(false);
    } else {
      startSessionTimer();
    }
  };

  const isRole = (...roles: string[]) => !!user && roles.includes(user.role);

  const refreshUser = async () => {
    const r = await getMe();
    setUser(r.data.user);
    if (remembered) {
      localStorage.setItem(K_USER, JSON.stringify(r.data.user));
    } else {
      sessionStorage.setItem(K_USER, JSON.stringify(r.data.user));
    }
  };

  const patchUser = (partial: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...partial };
      if (remembered) {
        localStorage.setItem(K_USER, JSON.stringify(updated));
      } else {
        sessionStorage.setItem(K_USER, JSON.stringify(updated));
      }
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{
      user, token, loading,
      login, logout, isRole,
      refreshUser, patchUser,
      sessionTimeRemaining, sessionWarning, extendSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
