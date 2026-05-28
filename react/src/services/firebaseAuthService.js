/**
 * HyperBabel React Demo — Firebase Auth → Customer JWT bridge
 *
 * Implements pattern B1 from https://hyperbabel.com/docs#customer-auth (Firebase Direct Exchange):
 *
 *   1. The user signs in (or signs up) with Firebase Auth in the browser.
 *   2. We pull the Firebase ID token from the resulting user object.
 *   3. POST /api/v1/customer/auth/firebase-exchange exchanges the ID token
 *      for a HyperBabel customer JWT pair (access + refresh).
 *   4. AuthContext persists the JWT pair to localStorage; api.js attaches
 *      it to every subsequent request and refreshes transparently on 401.
 *      The Firebase ID token never leaves the device after exchange.
 *
 * The browser never sees the integrator's org API key — the HyperBabel
 * Worker resolves the org from the Firebase project ID claim after
 * verifying the signature against Google JWKS.
 *
 * Prerequisites:
 *   1. VITE_FIREBASE_* environment variables populated (see .env.example).
 *      The same config powers Auth and FCM (web push).
 *   2. The chosen sign-in providers (Email/Password, Anonymous, …) enabled
 *      in Firebase Console → Authentication → Sign-in method.
 *   3. The Firebase project ID allow-listed in HyperBabel Console
 *      → Customer Auth → Add Firebase project.
 *   4. The current origin added to Firebase Console → Authentication
 *      → Settings → Authorized domains.
 */

const BASE_URL = import.meta.env.VITE_HB_API_URL || 'https://api.hyperbabel.com/api/v1';

// ── Module-level Firebase Auth singleton ──────────────────────────────────

let _authPromise = null;

/**
 * Lazy-load Firebase Auth. Returns null if the developer hasn't populated
 * VITE_FIREBASE_* in .env — the sign-in UI uses this to render a setup
 * notice instead of crashing.
 */
const getAuthInstance = async () => {
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
};

/** True iff VITE_FIREBASE_* env vars are populated. */
export const isFirebaseConfigured = () => Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID &&
  import.meta.env.VITE_FIREBASE_APP_ID,
);

// ── Exchange ──────────────────────────────────────────────────────────────

const exchangeIdTokenForCustomerJwt = async (idToken, preferredLangCd) => {
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
};

// ── Public flows ──────────────────────────────────────────────────────────

/**
 * Sign in with email + password, then exchange for a HyperBabel customer
 * JWT pair. The Firebase user must already exist; use signUp for new users.
 */
export const signInWithEmailAndExchange = async (email, password, preferredLangCd) => {
  const auth = await getAuthInstance();
  if (!auth) throw new Error('Firebase is not configured. See README → Quickstart.');

  const { signInWithEmailAndPassword } = await import('firebase/auth');
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const idToken    = await credential.user.getIdToken(true);
  return exchangeIdTokenForCustomerJwt(idToken, preferredLangCd);
};

/**
 * Create a brand-new Firebase user with email + password, then exchange.
 * HyperBabel auto-creates the matching `com_users` row on first exchange,
 * so no extra "create user" call is needed.
 */
export const signUpWithEmailAndExchange = async (email, password, preferredLangCd) => {
  const auth = await getAuthInstance();
  if (!auth) throw new Error('Firebase is not configured. See README → Quickstart.');

  const { createUserWithEmailAndPassword } = await import('firebase/auth');
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const idToken    = await credential.user.getIdToken(true);
  return exchangeIdTokenForCustomerJwt(idToken, preferredLangCd);
};

/**
 * Sign in anonymously and exchange. Useful for kiosk-style demos. Production
 * apps usually wire Google / Apple / Email providers instead.
 */
export const signInAnonymouslyAndExchange = async (preferredLangCd) => {
  const auth = await getAuthInstance();
  if (!auth) throw new Error('Firebase is not configured. See README → Quickstart.');

  const { signInAnonymously } = await import('firebase/auth');
  const credential = await signInAnonymously(auth);
  const idToken    = await credential.user.getIdToken(true);
  return exchangeIdTokenForCustomerJwt(idToken, preferredLangCd);
};

/**
 * Sign the Firebase user out. Safe to call even when no user is signed in.
 * Does NOT revoke the HyperBabel customer JWT — call AuthContext.logout()
 * separately (or POST /customer/revoke from your backend) if you need to
 * invalidate every device.
 */
export const firebaseSignOut = async () => {
  const auth = await getAuthInstance();
  if (!auth) return;
  try {
    const { signOut } = await import('firebase/auth');
    await signOut(auth);
  } catch { /* no user signed in */ }
};
