import axios, { AxiosError } from 'axios';

import type { SessionUser } from '@/types';

/** API base: '' in dev (Vite proxies /api to Nginx); the Render URL in production builds. */
const baseURL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export const http = axios.create({ baseURL, withCredentials: true, timeout: 20_000 });

// The access token lives in memory only; the refresh token is an HttpOnly cookie.
let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;

let onSessionExpired: (() => void) | null = null;
export const setSessionExpiredHandler = (handler: (() => void) | null) => {
  onSessionExpired = handler;
};

export interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: { path: string; message: string }[] };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof AxiosError) {
    const body = err.response?.data as ApiErrorBody | undefined;
    if (!err.response) return new ApiError('Cannot reach the server. Check your connection and try again.', 0, 'NETWORK_ERROR');
    return new ApiError(body?.error?.message ?? 'Something went wrong', err.response.status, body?.error?.code ?? 'UNKNOWN', body?.error?.details);
  }
  return new ApiError(err instanceof Error ? err.message : 'Something went wrong', 0, 'UNKNOWN');
}

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.set('Authorization', `Bearer ${accessToken}`);
  return config;
});

let refreshing: Promise<SessionUser | null> | null = null;

export interface SessionResponse {
  accessToken: string;
  user: SessionUser;
}

/** Single-flight refresh so parallel 401s share one rotation. */
export function refreshSession(): Promise<SessionUser | null> {
  refreshing ??= http
    .post<SessionResponse>('/api/auth/refresh', undefined, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, _skipRefresh: true })
    .then((res) => {
      setAccessToken(res.data.accessToken);
      return res.data.user;
    })
    .catch(() => {
      setAccessToken(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

declare module 'axios' {
  interface AxiosRequestConfig {
    _skipRefresh?: boolean;
    _retried?: boolean;
  }
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config;
    const code = (error.response?.data as ApiErrorBody | undefined)?.error?.code;
    const expired = error.response?.status === 401 && (code === 'TOKEN_EXPIRED' || code === 'UNAUTHORIZED');
    if (original && expired && !original._skipRefresh && !original._retried) {
      original._retried = true;
      const user = await refreshSession();
      if (user) return http(original);
      onSessionExpired?.();
    }
    return Promise.reject(toApiError(error));
  },
);
