/**
 * HyperBabel JavaScript Demo — Firebase Auth → Customer JWT bridge
 *
 * Implements pattern B1 from https://hyperbabel.com/docs#customer-auth (Firebase Direct Exchange):
 *
 *   1. The user signs in (or signs up) with Firebase Auth in the browser.
 *   2. We pull the Firebase ID token from the resulting user.
 *   3. POST /api/v1/customer/auth/firebase-exchange exchanges the ID
 *      token for a HyperBabel customer JWT pair (access + refresh).
 *   4. The caller (pages/login.js, pages/signup.js) persists the JWT
 *      pair to localStorage; api/client.js attaches it to every
 *      subsequent request and refreshes transparently on 401.
 *      The Firebase ID token never leaves the device after exchange.
 *
 * The browser never sees the integrator's org API key — the HyperBabel
 * Worker resolves the org from the Firebase project ID claim after
 * verifying the signature against Google JWKS.
 *
 * Prerequisites:
 *   1. VITE_FIREBASE_* environment variables populated (see .env.example).
 *   2. Email/Password (and Anonymous if you want the kiosk button)
 *      enabled in Firebase Console → Authentication → Sign-in method.
 *   3. The dev origin allow-listed in Firebase Console → Authentication
 *      → Settings → Authorized domains (localhost is on by default).
 *   4. Your Firebase project ID allow-listed in HyperBabel Console
 *      → Customer Auth → Add Firebase project.
 */

const BASE_URL = (import.meta.env.VITE_HB_API_URL || 'https://api.hyperbabel.com/api/v1').replace(/\/$/, '');

let _authPromise = null;

/** Lazily import and initialise Firebase Auth. */
async function getAuthInstance() {
  if (_authPromise) return _authPromise;

  const {
    VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID,
  } = import.meta.env;

  if (
    !VITE_FIREBASE_API_KEY ||
    !VITE_FIREBASE_PROJECT_ID ||
    !VITE_FIREBASE_APP_ID
  ) {
    return null;
  }

  _authPromise = (async () => {
    const { initializeApp, getApps } = await import('firebase/app');
    const { getAuth }                = await import('firebase/auth');

    const app = getApps()[0] || initializeApp({
      apiKey:            VITE_FIREBASE_API_KEY,
      authDomain:        VITE_FIREBASE_AUTH_DOMAIN,
      projectId:         VITE_FIREBASE_PROJECT_ID,
      storageBucket:     VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId:             VITE_FIREBASE_APP_ID,
    });
    return getAuth(app);
  })();

  return _authPromise;
}

/** True iff VITE_FIREBASE_* env vars are populated. */
export function isFirebaseConfigured() {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID,
  );
}

async function exchangeIdTokenForCustomerJwt(idToken, preferredLangCd) {
  const res = await fetch(`${BASE_URL}/customer/auth/firebase-exchange`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${idToken}`,
    },
    body: JSON.stringify(preferredLangCd ? { preferred_lang_cd: preferredLangCd } : {}),
  });
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* ignore */ }
    const msg = data?.error?.message || data?.message || `Exchange failed: HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

export async function signInWithEmailAndExchange(email, password, preferredLangCd) {
  const auth = await getAuthInstance();
  if (!auth) throw new Error('Firebase is not configured. See README → Quickstart.');
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const idToken    = await credential.user.getIdToken(true);
  return exchangeIdTokenForCustomerJwt(idToken, preferredLangCd);
}

export async function signUpWithEmailAndExchange(email, password, preferredLangCd) {
  const auth = await getAuthInstance();
  if (!auth) throw new Error('Firebase is not configured. See README → Quickstart.');
  const { createUserWithEmailAndPassword } = await import('firebase/auth');
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const idToken    = await credential.user.getIdToken(true);
  return exchangeIdTokenForCustomerJwt(idToken, preferredLangCd);
}

export async function signInAnonymouslyAndExchange(preferredLangCd) {
  const auth = await getAuthInstance();
  if (!auth) throw new Error('Firebase is not configured. See README → Quickstart.');
  const { signInAnonymously } = await import('firebase/auth');
  const credential = await signInAnonymously(auth);
  const idToken    = await credential.user.getIdToken(true);
  return exchangeIdTokenForCustomerJwt(idToken, preferredLangCd);
}

export async function firebaseSignOut() {
  const auth = await getAuthInstance();
  if (!auth) return;
  try {
    const { signOut } = await import('firebase/auth');
    await signOut(auth);
  } catch { /* no user signed in */ }
}

// ── Session persistence helpers (shared by login + signup) ───────────────

import {
  STORAGE_KEY_ACCESS_TOKEN,
  STORAGE_KEY_REFRESH_TOKEN,
  STORAGE_KEY_EXPIRES_AT,
} from './client.js';

const STORAGE_KEY_USER = 'hb_user';

/** Persist the customer JWT pair + identity returned by exchange. */
export function persistSession(exchange, fallbackDisplayName, langCode) {
  const resolvedName = (fallbackDisplayName || '').trim()
    || exchange.external_user_id.slice(0, 8);
  const resolvedLang = exchange.preferred_lang_cd || langCode;

  localStorage.setItem(STORAGE_KEY_ACCESS_TOKEN,  exchange.access_token);
  localStorage.setItem(STORAGE_KEY_REFRESH_TOKEN, exchange.refresh_token);
  localStorage.setItem(STORAGE_KEY_EXPIRES_AT,    String(exchange.expires_at));
  localStorage.setItem(STORAGE_KEY_USER, JSON.stringify({
    user_id:           exchange.external_user_id,
    display_name:      resolvedName,
    preferred_lang_cd: resolvedLang,
  }));
}

export async function logoutAndClear() {
  localStorage.removeItem(STORAGE_KEY_ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEY_REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEY_EXPIRES_AT);
  localStorage.removeItem(STORAGE_KEY_USER);
  localStorage.removeItem('hb_api_key'); // legacy key, defensive cleanup
  await firebaseSignOut();
}
