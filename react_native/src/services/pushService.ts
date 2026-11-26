/**
 * HyperBabel API — Push Notification Service
 *
 * Register and manage push tokens. HyperBabel delivers push to FCM
 * registration tokens only — on iOS too: register the token from Firebase
 * Messaging (`messaging().getToken()`), never a raw APNs device token or a
 * placeholder. Tokens FCM rejects are pruned by the server.
 *
 * Tokens are registered after sign-in (usePushNotifications) and removed at
 * sign-out: AuthContext.logout() passes this device's token to
 * POST /customer/logout, which deletes it together with the session.
 *
 * Base path: /push
 */

import api from './api';

const BASE = '/push';

export type PushPlatform = 'ios' | 'android' | 'web';

/**
 * SecureStore key of the FCM token this device registered last. Read by
 * AuthContext.logout() to release it, and cleared there so the next account
 * signing in on this device registers it again.
 */
export const PUSH_TOKEN_CACHE_KEY = 'hb_push_token_cache';

/**
 * Register an FCM registration token for a user (with a customer JWT,
 * `userId` must be your own). Call after sign-in and whenever the FCM token
 * refreshes. `token_type` defaults to 'fcm' on the server.
 */
export const registerToken = (
  userId:   string,
  token:    string,
  platform: PushPlatform,
) =>
  api.post(`${BASE}/register`, { user_id: userId, token, platform });

/**
 * Unregister a push token (e.g. when the user turns notifications off).
 * Sign-out does not need it — POST /customer/logout removes the token.
 */
export const unregisterToken = (userId: string, token: string) =>
  api.delete(`${BASE}/unregister`, { user_id: userId, token });

/**
 * Get all registered push tokens for a user (your own, with a customer JWT).
 */
export const getTokens = (userId: string) =>
  api.get<{ user_id: string; tokens: Array<{ token: string; platform: PushPlatform; updated_at: string }> }>(
    `${BASE}/tokens?user_id=${encodeURIComponent(userId)}`,
  );
