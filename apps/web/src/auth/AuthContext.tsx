import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionUser } from '@saac/shared';
import { apiGet, apiSend, setUnauthorizedHandler } from '../api/client';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  /** Why the last session ended, shown on the sign-in screen. */
  notice: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: (notice?: string) => Promise<void>;
  setUser: (u: SessionUser) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const ACTIVITY_EVENTS = ['keydown', 'mousedown', 'pointerdown', 'wheel', 'touchstart'] as const;
const PING_EVERY_MS = 60_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [idleMinutes, setIdleMinutes] = useState(15);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const lastActivity = useRef(Date.now());
  const lastPing = useRef(0);

  const clear = useCallback(
    (message: string | null) => {
      setUser(null);
      setNotice(message);
      qc.clear();
    },
    [qc],
  );

  useEffect(() => {
    apiGet<{ user: SessionUser; idleMinutes: number }>('/api/auth/me')
      .then((r) => {
        setUser(r.user);
        setIdleMinutes(r.idleMinutes);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => clear('You were signed out. Sign in again to continue.'));
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  const logout = useCallback(
    async (message?: string) => {
      await apiSend('POST', '/api/auth/logout').catch(() => undefined);
      clear(message ?? null);
    },
    [clear],
  );

  // Idle sign-out: real use keeps the session alive with a ping; after the idle limit the screen
  // signs out by itself so no student data stays on an unattended desk.
  useEffect(() => {
    if (!user) return;
    lastActivity.current = Date.now();
    const onActivity = () => {
      lastActivity.current = Date.now();
      if (Date.now() - lastPing.current > PING_EVERY_MS) {
        lastPing.current = Date.now();
        void apiSend('POST', '/api/auth/ping').catch(() => undefined);
      }
    };
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, onActivity, { passive: true });
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current > idleMinutes * 60_000) {
        void logout(`Signed out after ${idleMinutes} minutes without activity.`);
      }
    }, 15_000);
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity);
      window.clearInterval(timer);
    };
  }, [user, idleMinutes, logout]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      notice,
      setUser,
      logout,
      login: async (username, password) => {
        const r = await apiSend<{ user: SessionUser; idleMinutes: number }>('POST', '/api/auth/login', { username, password });
        setIdleMinutes(r.idleMinutes);
        setNotice(null);
        lastPing.current = Date.now();
        setUser(r.user);
      },
    }),
    [user, loading, notice, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

export function useIsAdmin() {
  return useAuth().user?.role === 'ADMIN';
}
