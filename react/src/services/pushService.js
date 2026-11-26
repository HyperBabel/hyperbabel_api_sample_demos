/**
 * HyperBabel API — Push Notification Service
 *
 * Register and manage push tokens. HyperBabel delivers B2B push through
 * Firebase Cloud Messaging only, so every token is an FCM registration token
 * — on iOS too (get it from Firebase Messaging; a raw APNs device token does
 * not work). Tokens FCM rejects are pruned server-side, so never register a
 * placeholder.
 *
 * Signing out: POST /customer/logout with this device's tokens removes them
 * (see AuthContext.logout) — no separate unregister call is needed.
 *
 * Base path: /push
 */

import api from './api';

const BASE = '/push';

/**
 * Register a push notification token for a user.
 *
 * @param {string} userId   — Must be the signed-in user
 * @param {string} token    — FCM registration token (all platforms)
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
