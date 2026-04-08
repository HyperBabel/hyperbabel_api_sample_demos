/**
 * HyperBabel API — Video Call Service
 *
 * Standalone video call management for custom implementations.
 * Supports 1-to-1 and group calls with rich participant metadata.
 *
 * For video calls embedded inside chat rooms, use the United Chat API
 * video-call endpoints in `unitedChatService.js` instead.
 *
 * Base path: /video
 */

import api from './api';

const BASE = '/video';

/**
 * Create a new video call session and generate RTC tokens for participants.
 *
 * @param {object} data
 * @param {'1to1'|'group'} [data.call_type='1to1']
 * @param {Array<{
 *   user_id: string,
 *   display_name?: string,
 *   profile_image_url?: string,
 *   preferred_lang_cd?: string,
 *   role?: 'publisher'|'subscriber'
 * }>} data.participants
 * @param {object} [data.settings]
 * @returns {Promise<{ session: object }>}
 */
export const createSession = (data) => api.post(`${BASE}/sessions`, data);

/**
 * Get full session details including all participant info and tokens.
 * @param {string} sessionId — UUID returned from createSession
 */
export const getSession = (sessionId) => api.get(`${BASE}/sessions/${sessionId}`);

/**
 * Join an existing video call session. Generates a new RTC token.
 *
 * @param {string} sessionId
 * @param {object} data
 * @param {string} data.user_id
 * @param {string} [data.display_name]
 * @param {string} [data.profile_image_url]
 * @param {string} [data.preferred_lang_cd]
 */
export const joinSession = (sessionId, data) =>
  api.post(`${BASE}/sessions/${sessionId}/join`, data);

/**
 * End an active video session. Records usage and calculates duration.
 *
 * ⚠️ Always call this when a session ends to prevent auto-expiry charges.
 * - `created` sessions auto-expire after 15 minutes
 * - `active` sessions auto-expire after 8 hours
 *
 * @param {string} sessionId
 */
export const endSession = (sessionId) =>
  api.post(`${BASE}/sessions/${sessionId}/end`);
