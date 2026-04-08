/**
 * HyperBabel Demo — Base HTTP Client
 *
 * Thin fetch wrapper that:
 *  1. Reads the API base URL and API key from app config / SecureStore
 *  2. Attaches Authorization header automatically
 *  3. Parses JSON responses and surfaces typed errors
 *
 * Usage:
 *   import api from '@/services/api';
 *   const data = await api.get('/unitedchat/rooms');
 *   await api.post('/unitedchat/rooms', { room_type: 'group', ... });
 */

import * as SecureStore from 'expo-secure-store';

// ── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = process.env.EXPO_PUBLIC_HB_API_URL ?? 'https://api.hyperbabel.com/api/v1';

export const STORAGE_KEY_API_KEY  = 'hb_api_key';
export const STORAGE_KEY_BASE_URL = 'hb_base_url';

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

// ── Helpers ───────────────────────────────────────────────────────────────

/** Read stored API key and base URL (set by the login screen). */
const getConfig = async (): Promise<{ apiKey: string; baseUrl: string }> => {
  const [apiKey, baseUrl] = await Promise.all([
    SecureStore.getItemAsync(STORAGE_KEY_API_KEY),
    SecureStore.getItemAsync(STORAGE_KEY_BASE_URL),
  ]);
  return {
    apiKey:  apiKey  ?? process.env.EXPO_PUBLIC_HB_API_KEY ?? '',
    baseUrl: baseUrl ?? DEFAULT_BASE_URL,
  };
};

/** Execute a fetch request, parse JSON, and surface errors. */
const request = async <T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> => {
  const { apiKey, baseUrl } = await getConfig();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      (data as any)?.error?.message ??
      (data as any)?.message ??
      `HTTP ${res.status}`;
    throw new ApiError(res.status, message, data);
  }

  return data as T;
};

// ── Public API ────────────────────────────────────────────────────────────

const api = {
  get:    <T = unknown>(path: string)                   => request<T>('GET',    path),
  post:   <T = unknown>(path: string, body?: unknown)   => request<T>('POST',   path, body),
  put:    <T = unknown>(path: string, body?: unknown)   => request<T>('PUT',    path, body),
  patch:  <T = unknown>(path: string, body?: unknown)   => request<T>('PATCH',  path, body),
  delete: <T = unknown>(path: string, body?: unknown)   => request<T>('DELETE', path, body),
};

export default api;
