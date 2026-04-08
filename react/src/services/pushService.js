/**
 * HyperBabel API — Push Notification Service
 *
 * Register and manage FCM (Android/Web) or APNs (iOS) push tokens.
 *
 * Base path: /push
 */

import api from './api';

const BASE = '/push';

/**
 * Register a push notification token for a user.
 *
 * @param {string} userId
 * @param {string} token    — FCM or APNs device token
 * @param {'ios'|'android'|'web'} platform
 */
export const registerToken = (userId, token, platform) =>
  api.post(`${BASE}/register`, { user_id: userId, token, platform });

/**
 * Unregister a push token (call on logout or token refresh).
 *
 * @param {string} userId
 * @param {string} token
 */
export const unregisterToken = (userId, token) =>
  api.delete(`${BASE}/unregister`, { user_id: userId, token });

/**
 * Get all registered push tokens for a user.
 * @param {string} userId
 */
export const getTokens = (userId) =>
  api.get(`${BASE}/tokens`, { user_id: userId });
