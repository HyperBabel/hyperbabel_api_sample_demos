/**
 * HyperBabel API — Live Stream Service
 *
 * Manages live broadcast sessions. The host publishes video/audio;
 * viewers join with subscriber-only RTC tokens.
 *
 * Base path: /stream
 */

import api, { ApiError } from './api';

const BASE = '/stream';

// ── Types ─────────────────────────────────────────────────────────────────

export interface CreateSessionParams {
  host_user_id:             string;
  title:                    string;
  host_display_name?:       string;
  host_profile_image_url?:  string;
  host_preferred_lang_cd?:  string;
  settings?:                Record<string, unknown>;
}

export interface StreamSession {
  session_id:     string;
  title:          string;
  status:         'created' | 'live' | 'ended';
  host_user_id:   string;
  host_name?:     string;
  viewer_count:   number;
  channel_name?:  string;
  rtc_token?:     string;
  uid?:           number;
  app_id?:        string;
  chat_room_id?:  string;   // United Chat room ID for stream chat
  created_at:     string;
}

export interface ViewerTokenParams {
  user_id?:                  string;
  viewer_display_name?:      string;
  viewer_profile_image_url?: string;
  viewer_preferred_lang_cd?: string;
}

// ── API calls ─────────────────────────────────────────────────────────────

/**
 * Create a new live stream session and get the host's RTC publisher token.
 */
export const createSession = (data: CreateSessionParams) =>
  api.post<{ session: StreamSession }>(`${BASE}/sessions`, data);

/**
 * Generate an RTC subscriber token for a viewer.
 */
export const getViewerToken = (sessionId: string, data: ViewerTokenParams = {}) =>
  api.post<{ session: StreamSession }>(`${BASE}/sessions/${sessionId}/viewer-token`, data);

/**
 * Start the broadcast — transitions session from 'created' to 'live'.
 */
export const startSession = (sessionId: string) =>
  api.post(`${BASE}/sessions/${sessionId}/start`);

/**
 * End the live stream. Calculates duration and records usage.
 */
export const endSession = (sessionId: string) =>
  api.post(`${BASE}/sessions/${sessionId}/end`);

/**
 * List stream sessions for this organisation.
 * Defaults to live sessions for the discovery screen.
 * Gracefully returns an empty list if the endpoint is unavailable.
 */
export const listSessions = async (
  params: { status?: string; limit?: number } = { status: 'live', limit: 20 },
): Promise<{ sessions: StreamSession[] }> => {
  try {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return await api.get<{ sessions: StreamSession[] }>(`${BASE}/sessions?${query}`);
  } catch (err) {
    // Gracefully handle if the list endpoint is not yet available
    if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
      return { sessions: [] };
    }
    throw err;
  }
};
