/**
 * HyperBabel React Demo — Firebase Web Push Service
 *
 * Handles browser push notification registration and receipt.
 *
 * Registration flow (called once after login):
 *  1. Request Notification permission from the browser
 *  2. Register the service worker (firebase-messaging-sw.js)
 *  3. Initialise Firebase with config from env vars
 *  4. Get FCM registration token via VAPID key
 *  5. Register token with HyperBabel Push API (POST /push/register)
 *     → HyperBabel stores the token and delivers push messages to this device
 *
 * Receive flow (foreground — when app tab is open):
 *  → onMessage() fires → browser Notification API shows notification
 *  → Clicking notification navigates to the relevant page
 *
 * Receive flow (background — when app tab is closed):
 *  → firebase-messaging-sw.js service worker handles delivery
 *
 * Firebase env vars (all optional — push is silently disabled if absent):
 *  VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
 *  VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID,
 *  VITE_FIREBASE_APP_ID, VITE_FIREBASE_VAPID_KEY
 */

import * as pushService from './pushService';

// ── Module-level singletons ───────────────────────────────────────────────
let firebaseApp       = null;
let firebaseMessaging = null;
let onMessageUnsubscribe = null; // cleanup function for foreground listener

// ── Firebase initialisation ───────────────────────────────────────────────

/**
 * Initialise Firebase + register the service worker.
 * Returns the messaging instance and VAPID key, or false if not configured.
 */
const initFirebase = async () => {
  const {
    VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID,
    VITE_FIREBASE_VAPID_KEY,
  } = import.meta.env;

  // All keys are required — silently skip if any are missing
  if (
    !VITE_FIREBASE_API_KEY ||
    !VITE_FIREBASE_PROJECT_ID ||
    !VITE_FIREBASE_MESSAGING_SENDER_ID ||
    !VITE_FIREBASE_APP_ID ||
    !VITE_FIREBASE_VAPID_KEY
  ) {
    return false;
  }

  try {
    const { initializeApp, getApps } = await import('firebase/app');
    const { getMessaging }           = await import('firebase/messaging');

    // Re-use existing app instance if already initialised
    if (!firebaseApp) {
      firebaseApp = getApps()[0] || initializeApp({
        apiKey:            VITE_FIREBASE_API_KEY,
        authDomain:        VITE_FIREBASE_AUTH_DOMAIN,
        projectId:         VITE_FIREBASE_PROJECT_ID,
        storageBucket:     VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId:             VITE_FIREBASE_APP_ID,
      });
    }

    // Register service worker for background message handling.
    // The SW file must be at /firebase-messaging-sw.js (served from public/).
    if ('serviceWorker' in navigator) {
      try {
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.info('[HyperBabel Push] Service worker registered:', swReg.scope);
      } catch (swErr) {
        console.warn('[HyperBabel Push] Service worker registration failed:', swErr.message);
        // Non-fatal — foreground push still works without SW
      }
    }

    firebaseMessaging = getMessaging(firebaseApp);
    return { messaging: firebaseMessaging, vapidKey: VITE_FIREBASE_VAPID_KEY };
  } catch (err) {
    console.warn('[HyperBabel Push] Firebase initialisation failed:', err.message);
    return false;
  }
};

// ── Foreground message handler ────────────────────────────────────────────

/**
 * Build the URL a notification tap should navigate to, based on the
 * structured data fields included by HyperBabel's Push API.
 *
 * HyperBabel sends these data fields:
 *   type        — 'chat.message' | 'video.call' | 'CALL_INVITE' | 'stream.started' | ...
 *   room_id     — chat or video room ID
 *   session_id  — live stream session ID
 */
const buildClickUrl = (data = {}) => {
  if (data.type === 'video.call' || data.type === 'CALL_INVITE') {
    return data.room_id ? `/video-call/${data.room_id}` : '/dashboard';
  }
  if (data.type === 'stream.started') {
    return data.session_id ? `/live-stream/viewer/${data.session_id}` : '/dashboard';
  }
  if (data.room_id) return `/chat/${data.room_id}`;
  return '/dashboard';
};

/**
 * Subscribe to foreground FCM messages.
 * Shows a native browser Notification when a push arrives while the tab is active.
 * (Background messages are handled by firebase-messaging-sw.js)
 */
const startForegroundListener = async (messaging) => {
  // Remove any previous listener to avoid duplicates
  if (typeof onMessageUnsubscribe === 'function') onMessageUnsubscribe();

  const { onMessage } = await import('firebase/messaging');

  onMessageUnsubscribe = onMessage(messaging, (payload) => {
    const notification = payload.notification || {};
    const data         = payload.data         || {};

    const title   = notification.title || data.title || 'HyperBabel';
    const body    = notification.body  || data.body  || 'You have a new notification.';
    const icon    = notification.icon  || '/vite.svg';
    const clickUrl = buildClickUrl(data);

    // Show native OS notification using the Notifications API.
    // This works in foreground because Firebase intentionally skips
    // auto-display when the tab is active — we handle it ourselves.
    if (Notification.permission === 'granted') {
      const notif = new Notification(title, {
        body,
        icon,
        tag:  data.type || 'hb-notification', // collapses same-type notifications
        data: { clickUrl },
      });

      // Navigate to relevant page when user clicks the notification
      notif.addEventListener('click', () => {
        window.focus();
        window.location.href = clickUrl;
        notif.close();
      });
    }

    // Also emit a custom DOM event for in-app toast components.
    // Any component can listen with: window.addEventListener('hb:push', e => ...)
    window.dispatchEvent(new CustomEvent('hb:push', {
      detail: { title, body, data, clickUrl },
    }));

    console.info('[HyperBabel Push] Foreground notification received:', title);
  });
};

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Request browser notification permission, initialise Firebase, obtain an
 * FCM token, and register it with the HyperBabel Push API.
 *
 * Starts the foreground message listener on success.
 *
 * Call once after login (in DashboardPage or App root).
 *
 * @param {string} userId           — HyperBabel user ID
 * @param {string} [platform='web'] — Platform identifier stored by HyperBabel
 * @returns {Promise<string|null>}  FCM token on success, null on any failure
 */
export const registerForPushNotifications = async (userId, platform = 'web') => {
  // 1. Check browser support
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.info('[HyperBabel Push] Browser does not support push notifications');
    return null;
  }

  // 2. Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.info('[HyperBabel Push] Push notification permission denied');
    return null;
  }

  // 3. Initialise Firebase + register service worker
  const firebase = await initFirebase();
  if (!firebase) {
    console.info('[HyperBabel Push] Firebase not configured — push disabled');
    return null;
  }

  try {
    const { getToken } = await import('firebase/messaging');

    // 4. Obtain FCM registration token
    const fcmToken = await getToken(firebase.messaging, {
      vapidKey: firebase.vapidKey,
    });

    if (!fcmToken) {
      console.warn('[HyperBabel Push] Failed to retrieve FCM token');
      return null;
    }

    // 5. Register token with HyperBabel Push API
    await pushService.registerToken(userId, fcmToken, platform);

    console.info('[HyperBabel Push] Push notifications registered successfully');

    // 6. Start foreground message listener
    await startForegroundListener(firebase.messaging);

    return fcmToken;
  } catch (err) {
    console.warn('[HyperBabel Push] Token registration failed:', err.message);
    return null;
  }
};

/**
 * Unregister push notifications for the current user.
 * Call on logout to stop receiving push messages on this device.
 *
 * @param {string} userId
 * @param {string} token — FCM token to remove (returned by registerForPushNotifications)
 */
export const unregisterPushNotifications = async (userId, token) => {
  // Stop foreground listener
  if (typeof onMessageUnsubscribe === 'function') {
    onMessageUnsubscribe();
    onMessageUnsubscribe = null;
  }

  if (!token) return;
  try {
    await pushService.unregisterToken(userId, token);
  } catch (err) {
    console.warn('[HyperBabel Push] Unregister failed:', err.message);
  }
};

export default { registerForPushNotifications, unregisterPushNotifications };
