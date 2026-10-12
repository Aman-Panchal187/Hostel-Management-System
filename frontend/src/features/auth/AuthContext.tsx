import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshSession, setSessionExpiredHandler } from '@/services/api';
import { authApi } from '@/services/endpoints';
import type { SessionUser } from '@/types';

interface AuthState {
  user: SessionUser | null;
  /** true while the initial silent refresh is running */
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    refreshSession().then((restored) => {
      if (active) {
        setUser(restored);
        setLoading(false);
      }
    });
    setSessionExpiredHandler(() => {
      queryClient.clear();
      setUser(null);
    });
    return () => {
      active = false;
      setSessionExpiredHandler(null);
    };
  }, [queryClient]);

  const login = useCallback(
    async (email: string, password: string) => {
      const next = await authApi.login(email, password);
      queryClient.clear();
      setUser(next);
      return next;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      queryClient.clear();
      setUser(null);
    }
  }, [queryClient]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const HOME_BY_ROLE: Record<SessionUser['role'], string> = {
  PLATFORM_ADMIN: '/platform',
  HOSTEL_ADMIN: '/hostel',
  ASSISTANT: '/assistant',
  STUDENT: '/student',
};
