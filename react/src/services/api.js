/**
 * HyperBabel API — Base HTTP Client (Customer Auth pattern B1)
 *
 * The demo authenticates end-users with Firebase on the browser, then
 * exchanges the resulting Firebase ID token at HyperBabel for a short-lived
 * customer JWT. The customer JWT pair is persisted to localStorage by
 * AuthContext; this client reads the access token on every request and
 * transparently refreshes via POST /customer/refresh on 401.
 *
 * The integrator's organization API key (`hb_live_…` / `hb_test_…`) MUST
 * NOT ship in the browser bundle. The client throws at startup if it ever
 * sees one — that catches accidental copies from server-side examples
 * before they reach production.
 *
 * Browser storage trade-off (read this before deploying):
 *   localStorage is XSS-readable, which is the inherent cost of any
 *   client-direct B1 flow. The risk is bounded — customer JWTs are
 *   short-lived (1 h access, 30 d refresh) and scoped to a single
 *   end-user; they cannot create new users or touch billing. For higher
 *   assurance, host an httpOnly-cookie backend that brokers the exchange
 *   (pattern B2 in https://hyperbabel.com/docs#customer-auth).
 *
 * Usage:
 *   import api from './api';
 *   const data = await api.get('/unitedchat/rooms');
 *   const res  = await api.post('/unitedchat/rooms', { room_type: 'group' });
 */

// ── Configuration ─────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_HB_API_URL || 'https://api.hyperbabel.com/api/v1';

/** Refresh proactively when fewer than this many seconds remain. */
const REFRESH_LEAD_SECONDS = 300; // 5 min — matches https://hyperbabel.com/docs#customer-auth guidance

export const STORAGE_KEY_ACCESS_TOKEN  = 'hb_access_token';
export const STORAGE_KEY_REFRESH_TOKEN = 'hb_refresh_token';
export const STORAGE_KEY_EXPIRES_AT    = 'hb_expires_at';

// ── Startup guard ─────────────────────────────────────────────────────────
//
// The demo deliberately has no surface for an org API key. If one slipped
// in through .env or a hard-coded constant, fail fast and loud — leaking
// `hb_live_…` to a browser bundle is unrecoverable.

const guardEnvKey = import.meta.env.VITE_HB_API_KEY;
if (guardEnvKey && /^hb_(live|test)_/.test(guardEnvKey)) {
  throw new Error(
    'HyperBabel security: VITE_HB_API_KEY contains an org API key. ' +
    'This demo only accepts customer JWTs minted via Firebase Direct Exchange. ' +
    'Remove the variable from .env and use the Firebase sign-in flow instead.',
  );
}

const assertNotOrgKey = (token) => {
  if (/^hb_(live|test)_/.test(token)) {
    throw new Error(
      'HyperBabel security: refusing to send an org API key from the browser. ' +
      'Only customer JWTs (issued by /customer/auth/firebase-exchange or ' +
      '/customer/issue-token) belong here.',
    );
  }
};

// ── Token helpers ─────────────────────────────────────────────────────────

const readAccessToken = () => {
  try { return localStorage.getItem(STORAGE_KEY_ACCESS_TOKEN) ?? ''; }
  catch { return ''; }
};

const readExpiresAt = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EXPIRES_AT);
    const n   = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
};

const writeTokenPair = (data) => {
  try {
    localStorage.setItem(STORAGE_KEY_ACCESS_TOKEN,  data.access_token);
    localStorage.setItem(STORAGE_KEY_REFRESH_TOKEN, data.refresh_token);
    localStorage.setItem(STORAGE_KEY_EXPIRES_AT,    String(data.expires_at));
  } catch { /* private mode / quota — fail silently, next request will 401 and retry */ }
};

// ── Refresh coordinator ───────────────────────────────────────────────────

/** Shared inflight promise so a burst of expirations only triggers one refresh. */
let refreshInflight = null;

const attemptRefresh = async () => {
  if (refreshInflight) return refreshInflight;

  refreshInflight = (async () => {
    try {
      const refreshToken = localStorage.getItem(STORAGE_KEY_REFRESH_TOKEN);
      if (!refreshToken) return null;

      const res = await fetch(`${BASE_URL}/customer/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return null;

      const data = await res.json();
      writeTokenPair(data);
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
const maybeProactiveRefresh = async (token) => {
  if (!token) return token;
  const expiresAt = readExpiresAt();
  if (!expiresAt) return token;
  const secondsLeft = expiresAt - Math.floor(Date.now() / 1000);
  if (secondsLeft > REFRESH_LEAD_SECONDS) return token;
  const refreshed = await attemptRefresh();
  return refreshed ?? token;
};

// ── Core request ──────────────────────────────────────────────────────────

const sendOnce = async (endpoint, options, token) => {
  if (token) assertNotOrgKey(token);

  let url = `${BASE_URL}${endpoint}`;
  if (options.params) {
    const qs = new URLSearchParams(
      Object.entries(options.params).filter(([, v]) => v !== undefined && v !== null),
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const config = {
    method:  options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  };
  if (options.body !== undefined) config.body = JSON.stringify(options.body);

  return fetch(url, config);
};

const parseBody = async (res) => {
  if (res.status === 204) return {};
  try { return await res.json(); } catch { return null; }
};

async function request(endpoint, options = {}) {
  const token = await maybeProactiveRefresh(readAccessToken());

  let response = await sendOnce(endpoint, options, token);

  // Reactive fallback for any 401 the proactive refresh missed (clock skew,
  // server-side revocation, etc.).
  if (response.status === 401 && token) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      response = await sendOnce(endpoint, options, refreshed);
    } else {
      const data  = await parseBody(response);
      const error = new Error('Customer session expired — please sign in again.');
      error.status = 401;
      error.code   = 'auth_expired';
      error.data   = data;
      throw error;
    }
  }

  const data = await parseBody(response);
  if (!response.ok) {
    const error = new Error(data?.error?.message ?? `API Error ${response.status}`);
    error.status = response.status;
    error.data   = data;
    throw error;
  }
  return data;
}

// ── Public API ────────────────────────────────────────────────────────────

const api = {
  get:    (endpoint, params, headers) => request(endpoint, { method: 'GET',    params, headers }),
  post:   (endpoint, body,   headers) => request(endpoint, { method: 'POST',   body,   headers }),
  put:    (endpoint, body,   headers) => request(endpoint, { method: 'PUT',    body,   headers }),
  patch:  (endpoint, body,   headers) => request(endpoint, { method: 'PATCH',  body,   headers }),
  delete: (endpoint, body,   headers) => request(endpoint, { method: 'DELETE', body,   headers }),
};

export default api;
