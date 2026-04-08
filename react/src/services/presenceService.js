/**
 * HyperBabel API — Presence Service
 *
 * DB-heartbeat-based online/offline presence system.
 * Call heartbeat every 30 seconds to stay online.
 * Users are auto-marked offline after 90 seconds of silence.
 *
 * Base path: /presence
 */

import api from './api';

const BASE = '/presence';

/**
 * Send a heartbeat to maintain online status.
 * Recommended interval: every 30 seconds.
 *
 * @param {string} userId
 * @param {string} [device] — e.g. 'web', 'mobile'
 */
export const heartbeat = (userId, device) =>
  api.post(`${BASE}/heartbeat`, { user_id: userId, ...(device && { device }) });

/**
 * Explicitly set user status (online, away, dnd, offline).
 *
 * @param {string} userId
 * @param {'online'|'away'|'dnd'|'offline'} status
 */
export const updateStatus = (userId, status) =>
  api.post(`${BASE}/status`, { user_id: userId, status });

/**
 * Get presence status for multiple users at once.
 *
 * @param {string[]} userIds — Max 100 users
 * @returns {Promise<{ presence: Array<{ user_id, status, last_seen, device }>, offline_threshold_seconds: number }>}
 */
export const getPresence = (userIds) =>
  api.get(BASE, { user_ids: userIds.join(',') });
