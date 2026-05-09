/**
 * HyperBabel API — base HTTP client.
 *
 * Wraps `fetch` with the standard Bearer-token header and JSON handling that
 * every other service module in this demo expects.
 */

const BASE_URL = (import.meta.env.VITE_HB_API_URL || 'https://api.hyperbabel.com/api/v1').replace(/\/$/, '');

function getApiKey() {
  return localStorage.getItem('hb_api_key') || import.meta.env.VITE_HB_API_KEY || '';
}

async function request(method, path, { body, query } = {}) {
  const url = new URL(BASE_URL + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
  }
  const apiKey = getApiKey();
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.error?.message || data?.message || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.body = data;
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
