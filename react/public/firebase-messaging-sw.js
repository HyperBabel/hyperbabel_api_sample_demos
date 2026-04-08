/**
 * HyperBabel React Demo — Firebase Messaging Service Worker
 *
 * This service worker handles push notifications received while the app is
 * in the BACKGROUND (tab closed, minimized, or in a different tab).
 *
 * ─────────────────────────────────────────────────────────────────
 * When the app tab is closed or in the background
 * ─────────────────────────────────────────────────────────────────
 *
 * HyperBabel Push API → FCM → firebase-messaging-sw.js (this file)
 *   ├─ Display OS push notification (title / body / icon)
 *   ├─ Incoming call push → includes "📞 Accept / ❌ Reject" action buttons
 *   └─ Notification click → routes to the relevant page by push type
 *        chat.message   → /chat/:room_id
 *        video.call     → /video-call/:room_id
 *        stream.started → /live-stream/viewer/:session_id
 *
 * ─────────────────────────────────────────────────────────────────
 * Foreground (when the app tab is active) is handled by the
 * onMessage() handler in firebaseService.js. This file is
 * exclusively for background delivery.
 * ─────────────────────────────────────────────────────────────────
 *
 * IMPORTANT: The Firebase config below must exactly match your .env values.
 * The service worker cannot access Vite's import.meta.env — values must be
 * hard-coded here (this file is served as plain JS from the public/ folder).
 *
 * How to configure:
 *  1. Copy each VITE_FIREBASE_* value from your .env file.
 *  2. Replace the REPLACE_WITH_* placeholder strings in firebaseConfig below.
 *  3. The service worker is registered automatically by firebaseService.js on login.
 */


importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// ── Firebase config (replace with your own values from .env) ─────────────
// These values are copied from your Firebase Console → Project Settings.
// They match the VITE_FIREBASE_* variables in .env — no secrets here,
// these are safe to include in a public service worker file.
const firebaseConfig = {
  apiKey:            self.__FIREBASE_CONFIG__?.apiKey            || 'REPLACE_WITH_VITE_FIREBASE_API_KEY',
  authDomain:        self.__FIREBASE_CONFIG__?.authDomain        || 'REPLACE_WITH_VITE_FIREBASE_AUTH_DOMAIN',
  projectId:         self.__FIREBASE_CONFIG__?.projectId         || 'REPLACE_WITH_VITE_FIREBASE_PROJECT_ID',
  storageBucket:     self.__FIREBASE_CONFIG__?.storageBucket     || 'REPLACE_WITH_VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: self.__FIREBASE_CONFIG__?.messagingSenderId || 'REPLACE_WITH_VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId:             self.__FIREBASE_CONFIG__?.appId             || 'REPLACE_WITH_VITE_FIREBASE_APP_ID',
};

// Initialise Firebase if config looks valid (not placeholder strings)
if (!firebaseConfig.apiKey.startsWith('REPLACE_')) {
  firebase.initializeApp(firebaseConfig);

  const messaging = firebase.messaging();

  /**
   * Background message handler.
   * Runs when a push arrives while the app tab is NOT active.
   *
   * payload.notification  → { title, body, image }  (from FCM)
   * payload.data          → custom key/value pairs from HyperBabel
   *
   * HyperBabel Push API sends structured data payloads such as:
   *   { type: 'chat.message', room_id: '...', sender_name: '...' }
   *   { type: 'video.call', room_id: '...', caller_name: '...' }
   */
  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {};
    const data         = payload.data         || {};

    // Build notification options
    const title = notification.title || data.title || 'HyperBabel';
    const body  = notification.body  || data.body  || 'You have a new notification.';
    const icon  = notification.icon  || '/vite.svg';

    // Badge for type-specific context
    const badge = '/vite.svg';

    // Actions differ by push type (chat message vs. call invite)
    const actions = [];
    if (data.type === 'video.call' || data.type === 'CALL_INVITE') {
      actions.push({ action: 'accept', title: '📞 Accept' });
      actions.push({ action: 'reject', title: '❌ Reject' });
    }

    // Build click URL — clicking the notification opens the relevant page
    let clickUrl = '/dashboard';
    if (data.room_id)     clickUrl = `/chat/${data.room_id}`;
    if (data.session_id)  clickUrl = `/live-stream/viewer/${data.session_id}`;
    if (data.type === 'video.call' || data.type === 'CALL_INVITE') {
      clickUrl = data.room_id ? `/video-call/${data.room_id}` : '/dashboard';
    }

    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag:           data.type || 'hb-notification', // replaces previous same-type notification
      renotify:      true,
      data:          { clickUrl, ...data },
      ...(actions.length > 0 && { actions }),
    });
  });

  // ── Notification click handler ──────────────────────────────────────────
  self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const clickUrl = event.notification.data?.clickUrl || '/dashboard';

    event.waitUntil(
      clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((windowClients) => {
          // If a tab with the app is already open, focus it and navigate
          const existingTab = windowClients.find((client) =>
            client.url.includes(self.location.origin)
          );
          if (existingTab) {
            existingTab.focus();
            return existingTab.navigate(clickUrl);
          }
          // Otherwise open a new tab
          return clients.openWindow(clickUrl);
        })
    );
  });
}
