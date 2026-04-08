/**
 * HyperBabel API — Push Notification Service
 *
 * Register and manage FCM (Android) or APNs (iOS) push tokens.
 * Tokens are registered on login and unregistered on logout.
 *
 * Base path: /push
 */

import api from './api';

const BASE = '/push';

export type PushPlatform = 'ios' | 'android' | 'web';

/**
 * Register a push notification token for a user.
 * Call after login and whenever the FCM/APNs token refreshes.
 */
export const registerToken = (
  userId:   string,
  token:    string,
  platform: PushPlatform,
) =>
  api.post(`${BASE}/register`, { user_id: userId, token, platform });

/**
 * Unregister a push token (call on logout or when the token becomes stale).
 */
export const unregisterToken = (userId: string, token: string) =>
  api.delete(`${BASE}/unregister`, { user_id: userId, token });

/**
 * Get all registered push tokens for a user.
 */
export const getTokens = (userId: string) =>
  api.get<{ tokens: Array<{ token: string; platform: PushPlatform; created_at: string }> }>(
    `${BASE}/tokens?user_id=${userId}`,
  );
