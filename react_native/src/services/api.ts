/**
 * HyperBabel Demo — Base HTTP Client
 *
 * The demo uses Customer Auth pattern B1 (Firebase Direct Exchange) only.
 * A short-lived customer JWT is stored in expo-secure-store, attached to
 * every request as `Authorization: Bearer …`, and refreshed transparently
 * on 401 via POST /customer/refresh.
 *
 * The integrator's organization API key (`hb_live_…` / `hb_test_…`) MUST
 * NOT ship in the binary. The client throws at startup if it ever sees one
 * — that catches accidental copies from a server-side example into a
 * mobile-side file before they reach production.
 *
 * Usage:
 *   import api from '@/services/api';
 *   const data = await api.get('/unitedchat/rooms');
 *   await api.post('/unitedchat/rooms', { room_type: 'group', ... });
 */

import * as SecureStore from 'expo-secure-store';

// ── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = process.env.EXPO_PUBLIC_HB_API_URL ?? 'https://api.hyperbabel.com/api/v1';

/** Refresh proactively when fewer than this many seconds remain. */
const REFRESH_LEAD_SECONDS = 300; // 5 min — matches https://hyperbabel.com/docs#customer-auth guidance

export const STORAGE_KEY_BASE_URL       = 'hb_base_url';
export const STORAGE_KEY_ACCESS_TOKEN   = 'hb_access_token';
export const STORAGE_KEY_REFRESH_TOKEN  = 'hb_refresh_token';
export const STORAGE_KEY_EXPIRES_AT     = 'hb_expires_at';

// ── Error type ────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Raised when refresh fails — the UI should route the user back to /login. */
export class AuthExpiredError extends ApiError {
  constructor(body?: unknown) {
    super(401, 'Customer session expired — please sign in again.', body);
    this.name = 'AuthExpiredError';
  }
}

// ── Startup guard ─────────────────────────────────────────────────────────
//
// The demo deliberately has no surface for an org API key. If one slipped
// in through .env or a hard-coded constant, fail fast and loud — leaking
// `hb_live_…` to a mobile binary is unrecoverable.

const guardEnvKey = process.env.EXPO_PUBLIC_HB_API_KEY;
if (guardEnvKey && /^hb_(live|test)_/.test(guardEnvKey)) {
  throw new Error(
    'HyperBabel security: EXPO_PUBLIC_HB_API_KEY contains an org API key. ' +
    'This demo only accepts customer JWTs minted via Firebase Direct Exchange. ' +
    'Remove the variable from .env and use the Firebase sign-in flow instead.',
  );
}

const assertNotOrgKey = (token: string): void => {
  if (/^hb_(live|test)_/.test(token)) {
    throw new Error(
      'HyperBabel security: refusing to send an org API key from the device. ' +
      'Only customer JWTs (issued by /customer/auth/firebase-exchange or ' +
      '/customer/issue-token) belong here.',
    );
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────

interface ResolvedConfig {
  baseUrl: string;
  token:   string; // empty string if no session yet (caller sends unauthenticated)
}

const getConfig = async (): Promise<ResolvedConfig> => {
  const [baseUrl, accessToken] = await Promise.all([
    SecureStore.getItemAsync(STORAGE_KEY_BASE_URL),
    SecureStore.getItemAsync(STORAGE_KEY_ACCESS_TOKEN),
  ]);
  return {
    baseUrl: baseUrl ?? DEFAULT_BASE_URL,
    token:   accessToken ?? '',
  };
};

// ── Refresh coordinator ───────────────────────────────────────────────────

/**
 * Shared inflight promise so a burst of expirations (e.g. parallel screen
 * mounts at app start) only triggers a single POST /customer/refresh.
 */
let refreshInflight: Promise<string | null> | null = null;

const attemptRefresh = async (baseUrl: string): Promise<string | null> => {
  if (refreshInflight) return refreshInflight;

  refreshInflight = (async (): Promise<string | null> => {
    try {
      const refreshToken = await SecureStore.getItemAsync(STORAGE_KEY_REFRESH_TOKEN);
      if (!refreshToken) return null;

      const res = await fetch(`${baseUrl}/customer/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as {
        access_token:  string;
        refresh_token: string;
        expires_at:    number;
      };

      await Promise.all([
        SecureStore.setItemAsync(STORAGE_KEY_ACCESS_TOKEN,  data.access_token),
        SecureStore.setItemAsync(STORAGE_KEY_REFRESH_TOKEN, data.refresh_token),
        SecureStore.setItemAsync(STORAGE_KEY_EXPIRES_AT,    String(data.expires_at)),
      ]);
      return data.access_token;
    } catch {
      return null;
    } finally {
      refreshInflight = null;
    }
  })();

  return refreshInflight;
};

/** Refresh up-front if the cached expiry is within REFRESH_LEAD_SECONDS. */
const maybeProactiveRefresh = async (baseUrl: string, token: string): Promise<string> => {
  if (!token) return token;
  const expiresAtStr = await SecureStore.getItemAsync(STORAGE_KEY_EXPIRES_AT);
  if (!expiresAtStr) return token;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt)) return token;
  const secondsLeft = expiresAt - Math.floor(Date.now() / 1000);
  if (secondsLeft > REFRESH_LEAD_SECONDS) return token;
  const refreshed = await attemptRefresh(baseUrl);
  return refreshed ?? token;
};

// ── Request core ──────────────────────────────────────────────────────────

const sendOnce = async (
  baseUrl: string,
  method:  string,
  path:    string,
  token:   string,
  body?:   unknown,
): Promise<Response> => {
  if (token) assertNotOrgKey(token);
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
};

const parseBody = async (res: Response): Promise<unknown> => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const errorMessage = (data: unknown, status: number): string => {
  const d = data as any;
  return d?.error?.message ?? d?.message ?? `HTTP ${status}`;
};

const request = async <T>(
  method: string,
  path:   string,
  body?:  unknown,
): Promise<T> => {
  const { baseUrl, token: storedToken } = await getConfig();
  const token = await maybeProactiveRefresh(baseUrl, storedToken);

  let res = await sendOnce(baseUrl, method, path, token, body);

  // Reactive fallback for any 401 the proactive refresh missed (clock skew,
  // server-side revocation, etc.).
  if (res.status === 401 && token) {
    const refreshed = await attemptRefresh(baseUrl);
    if (refreshed) {
      res = await sendOnce(baseUrl, method, path, refreshed, body);
    } else {
      const data = await parseBody(res);
      throw new AuthExpiredError(data);
    }
  }

  const data = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(res.status, errorMessage(data, res.status), data);
  }
  return data as T;
};

// ── Public API ────────────────────────────────────────────────────────────

const api = {
  get:    <T = unknown>(path: string)                  => request<T>('GET',    path),
  post:   <T = unknown>(path: string, body?: unknown)  => request<T>('POST',   path, body),
  put:    <T = unknown>(path: string, body?: unknown)  => request<T>('PUT',    path, body),
  patch:  <T = unknown>(path: string, body?: unknown)  => request<T>('PATCH',  path, body),
  delete: <T = unknown>(path: string, body?: unknown)  => request<T>('DELETE', path, body),
};

export default api;
