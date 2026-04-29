import type { ApiError, AuthTokens } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';

const STORAGE_KEY = 'keyloop.tokens.v1';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.message ?? body.detail ?? body.title ?? `HTTP ${status}`);
    this.name = 'ApiClientError';
  }
}

// ===== token store =====

export function loadTokens(): AuthTokens | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthTokens;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: AuthTokens): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

// ===== fetch wrapper =====

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | undefined>;
  /** Skip auth (for /auth/login itself). */
  skipAuth?: boolean;
}

let refreshPromise: Promise<AuthTokens | null> | null = null;

async function refreshAccessToken(): Promise<AuthTokens | null> {
  // Singleton refresh — many requests can race a 401 simultaneously.
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const tokens = loadTokens();
    if (!tokens?.refreshToken) return null;
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      if (!res.ok) {
        clearTokens();
        return null;
      }
      const fresh = (await res.json()) as AuthTokens;
      saveTokens(fresh);
      return fresh;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, opts.query);

  let tokens = opts.skipAuth ? null : loadTokens();
  let attempt = 0;

  while (attempt < 2) {
    attempt += 1;
    const headers: Record<string, string> = {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(opts.headers ?? {}),
    };
    if (tokens?.accessToken) {
      headers['authorization'] = `Bearer ${tokens.accessToken}`;
    }
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (res.status === 401 && !opts.skipAuth && attempt === 1) {
      const fresh = await refreshAccessToken();
      if (!fresh) {
        await throwApiError(res);
      }
      tokens = fresh;
      continue;
    }

    if (res.status === 304) {
      return undefined as T;
    }
    if (!res.ok) {
      await throwApiError(res);
    }
    if (res.status === 204) {
      return undefined as T;
    }
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      return (await res.json()) as T;
    }
    return (await res.text()) as unknown as T;
  }
  throw new Error('Unreachable');
}

async function throwApiError(res: Response): Promise<never> {
  let body: ApiError = {};
  try {
    body = (await res.json()) as ApiError;
  } catch {
    /* non-JSON */
  }
  throw new ApiClientError(res.status, body);
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}
