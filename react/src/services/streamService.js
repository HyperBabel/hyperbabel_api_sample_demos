/**
 * HyperBabel API — Live Stream Service
 *
 * Manages live broadcast sessions. The host publishes video/audio;
 * viewers join with subscriber-only tokens.
 *
 * Base path: /stream
 */

import api from './api';

const BASE = '/stream';

/**
 * Create a new live stream session and get the host's RTC publisher token.
 *
 * @param {object} data
 * @param {string} data.host_user_id
 * @param {string} data.title
 * @param {string} [data.host_display_name]
 * @param {string} [data.host_profile_image_url]
 * @param {string} [data.host_preferred_lang_cd]
 * @param {object} [data.settings]
 * @returns {Promise<{ session: object }>}
 */
export const createSession = (data) => api.post(`${BASE}/sessions`, data);

/**
 * Generate an RTC subscriber token for a viewer to watch the stream.
 *
 * @param {string} sessionId
 * @param {object} [data]
 * @param {string} [data.user_id]
 * @param {string} [data.viewer_display_name]
 * @param {string} [data.viewer_profile_image_url]
 * @param {string} [data.viewer_preferred_lang_cd]
 */
export const getViewerToken = (sessionId, data = {}) =>
  api.post(`${BASE}/sessions/${sessionId}/viewer-token`, data);

/**
 * Start the broadcast — transitions session from 'created' to 'live'.
 * @param {string} sessionId
 */
export const startSession = (sessionId) =>
  api.post(`${BASE}/sessions/${sessionId}/start`);

/**
 * End the live stream. Calculates duration and records usage.
 * @param {string} sessionId
 */
export const endSession = (sessionId) =>
  api.post(`${BASE}/sessions/${sessionId}/end`);

/**
 * List active (live) stream sessions for this organisation.
 * Used by the Dashboard to show a live broadcast discovery list.
 *
 * @param {{ status?: string, limit?: number }} [params]
 * @returns {Promise<{ sessions: array }>}
 */
export const listSessions = async (params = { status: 'live', limit: 20 }) => {
  try {
    const query = new URLSearchParams(params).toString();
    return await api.get(`${BASE}/sessions?${query}`);
  } catch (err) {
    // Gracefully handle if the list endpoint is not yet available on the backend
    if (err.status === 404 || err.status === 501) return { sessions: [] };
    throw err;
  }
};
