/**
 * HyperBabel API — Base HTTP Client
 *
 * Centralized fetch wrapper that injects the API key and base URL for every
 * outbound request.  All service modules import `api` from this file.
 *
 * Usage:
 *   import api from './api';
 *   const data = await api.get('/chat/channels');
 *   const res  = await api.post('/chat/channels', { channel_name: 'general' });
 */

// ---------------------------------------------------------------------------
// Configuration — set these via environment variables or edit the defaults
// ---------------------------------------------------------------------------
const BASE_URL = import.meta.env.VITE_HB_API_URL || 'https://api.hyperbabel.com/api/v1';
const API_KEY  = import.meta.env.VITE_HB_API_KEY || '';

// ---------------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------------

/**
 * Send an HTTP request to the HyperBabel API.
 *
 * @param {string}  endpoint  — API path (e.g. '/chat/channels')
 * @param {object}  options
 * @param {string}  [options.method='GET']
 * @param {object}  [options.body]           — JSON body (auto-serialised)
 * @param {object}  [options.headers]        — Extra headers to merge
 * @param {object}  [options.params]         — Query-string parameters
 * @returns {Promise<any>} Parsed JSON response
 */
async function request(endpoint, { method = 'GET', body, headers = {}, params } = {}) {
  // Build query string from params object
  let url = `${BASE_URL}${endpoint}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const config = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      ...headers,
    },
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(url, config);

  // Parse JSON (or return empty object for 204 No Content)
  const data = response.status === 204 ? {} : await response.json();

  if (!response.ok) {
    const error = new Error(data?.error?.message || `API Error ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Convenience shortcuts
// ---------------------------------------------------------------------------

const api = {
  get:    (endpoint, params, headers) => request(endpoint, { method: 'GET',    params, headers }),
  post:   (endpoint, body,   headers) => request(endpoint, { method: 'POST',   body,   headers }),
  put:    (endpoint, body,   headers) => request(endpoint, { method: 'PUT',    body,   headers }),
  patch:  (endpoint, body,   headers) => request(endpoint, { method: 'PATCH',  body,   headers }),
  delete: (endpoint, body,   headers) => request(endpoint, { method: 'DELETE', body,   headers }),
};

export default api;
