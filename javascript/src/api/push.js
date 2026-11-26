/**
 * HyperBabel API — push notification token management.
 *
 * HyperBabel delivers push through Firebase Cloud Messaging (FCM) only, so the
 * token you register must be an FCM registration token — on iOS too (the token
 * Firebase Messaging gives you, not a raw APNs device token). FCM rejects a
 * made-up token at the first send and HyperBabel then deletes it, so never
 * register a placeholder.
 *
 * This demo does not wire Firebase Messaging, so it registers no token. A real
 * web app registers one right after sign-in:
 *
 *   import { getMessaging, getToken } from 'firebase/messaging';
 *
 *   const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
 *   const token = await getToken(getMessaging(firebaseApp), {
 *     // Firebase Console → Project settings → Cloud Messaging → Web Push certificates
 *     vapidKey: '<your Web Push certificate key>',
 *     serviceWorkerRegistration: registration,
 *   });
 *   if (token) await registerDeviceToken(userId, token, 'web');
 *
 * and connects the same Firebase project in HyperBabel Console → Push Settings
 * so HyperBabel can send to it.
 *
 * `registerDeviceToken` remembers the token on this device so that signing out
 * can hand it to `POST /customer/logout`, which deletes this device's
 * registration — the next person to use the device does not get the previous
 * user's notifications.
 */

import { api } from './client.js';

const STORAGE_KEY_PUSH_TOKEN = 'hb_push_token';

export const registerToken = (userId, token, platform = 'web') =>
  api.post('/push/register', { user_id: userId, token, platform });

export const unregisterToken = (userId, token) =>
  api.del('/push/unregister', { user_id: userId, token });

export const getTokens = (userId) =>
  api.get('/push/tokens', { user_id: userId });

/**
 * Register this device's FCM registration token and remember it for sign-out.
 * `token` must come from Firebase Messaging `getToken()` — see the header.
 */
export async function registerDeviceToken(userId, token, platform = 'web') {
  const res = await registerToken(userId, token, platform);
  try { localStorage.setItem(STORAGE_KEY_PUSH_TOKEN, token); } catch { /* private mode */ }
  return res;
}

/** Push tokens this device registered — sent with POST /customer/logout. */
export function deviceTokens() {
  try {
    const token = localStorage.getItem(STORAGE_KEY_PUSH_TOKEN);
    return token ? [token] : [];
  } catch {
    return [];
  }
}

/** Forget this device's push tokens (after sign-out). */
export function forgetDeviceTokens() {
  try { localStorage.removeItem(STORAGE_KEY_PUSH_TOKEN); } catch { /* private mode */ }
}
