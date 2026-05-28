/**
 * HyperBabel API — base HTTP client (Customer Auth pattern B1).
 *
 * The demo authenticates end-users with Firebase in the browser, then
 * exchanges the resulting Firebase ID token at HyperBabel for a
 * short-lived customer JWT. The customer JWT pair is persisted to
 * localStorage by the auth flow in `pages/login.js` /
 * `api/firebaseAuth.js`; this client reads the access token on every
 * request and transparently refreshes via POST /customer/refresh
 * on 401.
 *
 * The integrator's organization API key (`hb_live_…` / `hb_test_…`)
 * MUST NOT ship in the browser bundle. The client throws at startup
 * if it sees one — that catches accidental copies from server-side
 * examples before they reach production.
 *
 * Browser storage trade-off:
 *   localStorage is XSS-readable, which is the inherent cost of any
 *   client-direct B1 flow. The risk is bounded — customer JWTs are
 *   short-lived (1 h access, 30 d refresh) and scoped to a single
 *   end-user; they cannot create new users or touch billing. For
 *   higher assurance, host an httpOnly-cookie backend that brokers
 *   the exchange (pattern B2 in https://hyperbabel.com/docs#customer-auth).
 */

const BASE_URL = (import.meta.env.VITE_HB_API_URL || 'https://api.hyperbabel.com/api/v1').replace(/\/$/, '');

/** Refresh proactively when fewer than this many seconds remain. */
const REFRESH_LEAD_SECONDS = 300; // matches https://hyperbabel.com/docs#customer-auth guidance

export const STORAGE_KEY_ACCESS_TOKEN  = 'hb_access_token';
export const STORAGE_KEY_REFRESH_TOKEN = 'hb_refresh_token';
export const STORAGE_KEY_EXPIRES_AT    = 'hb_expires_at';

// ── Startup guard ─────────────────────────────────────────────────────────

const guardEnvKey = import.meta.env.VITE_HB_API_KEY;
if (guardEnvKey && /^hb_(live|test)_/.test(guardEnvKey)) {
  throw new Error(
    'HyperBabel security: VITE_HB_API_KEY contains an org API key. ' +
    'This demo only accepts customer JWTs minted via Firebase Direct Exchange. ' +
    'Remove the variable from .env and use the Firebase sign-in flow instead.',
  );
}

function assertNotOrgKey(token) {
  if (/^hb_(live|test)_/.test(token)) {
    throw new Error(
      'HyperBabel security: refusing to send an org API key from the browser. ' +
      'Only customer JWTs (issued by /customer/auth/firebase-exchange or ' +
      '/customer/issue-token) belong here.',
    );
  }
}

// ── Token helpers ─────────────────────────────────────────────────────────

const readAccessToken = () => {
  try { return localStorage.getItem(STORAGE_KEY_ACCESS_TOKEN) || ''; }
  catch { return ''; }
};

const readExpiresAt = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EXPIRES_AT);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
};

const writeTokenPair = (data) => {
  try {
    localStorage.setItem(STORAGE_KEY_ACCESS_TOKEN,  data.access_token);
    localStorage.setItem(STORAGE_KEY_REFRESH_TOKEN, data.refresh_token);
    localStorage.setItem(STORAGE_KEY_EXPIRES_AT,    String(data.expires_at));
  } catch { /* private mode / quota — fail silently */ }
};

// ── Refresh coordinator ───────────────────────────────────────────────────

let refreshInflight = null;

async function attemptRefresh() {
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
}

/** Refresh up-front if the cached expiry is within REFRESH_LEAD_SECONDS. */
async function maybeProactiveRefresh(token) {
  if (!token) return token;
  const expiresAt = readExpiresAt();
  if (!expiresAt) return token;
  const secondsLeft = expiresAt - Math.floor(Date.now() / 1000);
  if (secondsLeft > REFRESH_LEAD_SECONDS) return token;
  return (await attemptRefresh()) || token;
}

// ── Request core ──────────────────────────────────────────────────────────

async function sendOnce(method, path, { body, query }, token) {
  if (token) assertNotOrgKey(token);
  const url = new URL(BASE_URL + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
  }
  return fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function parseBody(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function request(method, path, options = {}) {
  const token = await maybeProactiveRefresh(readAccessToken());

  let res = await sendOnce(method, path, options, token);

  // Reactive fallback for any 401 the proactive refresh missed.
  if (res.status === 401 && token) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      res = await sendOnce(method, path, options, refreshed);
    } else {
      const data = await parseBody(res);
      const err  = new Error('Customer session expired — please sign in again.');
      err.status = 401;
      err.code   = 'auth_expired';
      err.body   = data;
      throw err;
    }
  }

  const data = await parseBody(res);
  if (!res.ok) {
    const message = data?.error?.message || data?.message || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.body   = data;
    throw err;
  }
  return data;
}

export const api = {
  get:  (path, query)        => request('GET',    path, { query }),
  post: (path, body)         => request('POST',   path, { body }),
  put:  (path, body)         => request('PUT',    path, { body }),
  // Several DELETE endpoints carry a body (e.g. /users/block needs
  // {blocker_id, blocked_id}, /unitedchat/rooms/:id/freeze needs {user_id}).
  // Accept both an optional body and an optional query so callers don't
  // need to know which transport the server expects.
  del:  (path, body, query)  => request('DELETE', path, { body, query }),
};

export const baseUrl = BASE_URL;
