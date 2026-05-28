/**
 * HyperBabel Demo — Firebase Auth → Customer JWT bridge
 *
 * Implements pattern B1 from https://hyperbabel.com/docs#customer-auth (Firebase Direct Exchange):
 *
 *   1. The user signs in (or signs up) with Firebase Auth on device.
 *   2. We pull the Firebase ID token from the Firebase user object.
 *   3. POST /api/v1/customer/auth/firebase-exchange exchanges the ID token
 *      for a HyperBabel customer JWT pair (access + refresh).
 *   4. The customer JWT is stored in SecureStore and attached to every API
 *      call. The Firebase ID token never leaves the device after exchange.
 *
 * The mobile app never sees the integrator's org API key — the HyperBabel
 * Worker resolves the org from the Firebase project ID claim after
 * verifying the signature against Google JWKS.
 *
 * Prerequisites:
 *   1. firebase/google-services.json (Android) + firebase/GoogleService-Info.plist (iOS)
 *      present — app.config.ts wires the native plugin automatically.
 *   2. The chosen sign-in providers (Email/Password, Anonymous, …) enabled
 *      in Firebase Console → Authentication → Sign-in method.
 *   3. The Firebase project ID allow-listed in HyperBabel Console
 *      → Customer Auth → Add Firebase project.
 */

import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEY_BASE_URL } from '@/services/api';

const DEFAULT_BASE_URL = 'https://api.hyperbabel.com/api/v1';

// ── Availability probe ────────────────────────────────────────────────────

/**
 * True iff at least one Firebase app is initialized natively. Returns false
 * when the integrator has not provided google-services.json /
 * GoogleService-Info.plist, so the UI can render a "config missing" notice
 * instead of crashing on the first auth call.
 *
 * The probe is wrapped in try/catch because some platforms throw rather
 * than returning an empty apps list when no config is present.
 */
export const isFirebaseReady = (): boolean => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { firebase } = require('@react-native-firebase/app');
    return Array.isArray(firebase?.apps) && firebase.apps.length > 0;
  } catch {
    return false;
  }
};

// ── Types ─────────────────────────────────────────────────────────────────

export interface FirebaseExchangeResult {
  access_token:       string;
  refresh_token:      string;
  expires_at:         number;
  refresh_expires_at: number;
  user_id:            string;
  external_user_id:   string;
  org_id:             string;
  session_id:         string;
  preferred_lang_cd?: string;
  token_type:         'Bearer';
}

// ── Internals ─────────────────────────────────────────────────────────────

const resolveBaseUrl = async (): Promise<string> => {
  const stored = await SecureStore.getItemAsync(STORAGE_KEY_BASE_URL);
  return stored ?? process.env.EXPO_PUBLIC_HB_API_URL ?? DEFAULT_BASE_URL;
};

const exchangeIdTokenForCustomerJwt = async (
  idToken:          string,
  preferredLangCd?: string,
): Promise<FirebaseExchangeResult> => {
  const baseUrl = await resolveBaseUrl();
  const res = await fetch(`${baseUrl}/customer/auth/firebase-exchange`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${idToken}`,
    },
    body: JSON.stringify(preferredLangCd ? { preferred_lang_cd: preferredLangCd } : {}),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null) as any;
    const msg  = data?.error?.message ?? data?.message ?? `Exchange failed: HTTP ${res.status}`;
    throw new Error(msg);
  }

  return res.json() as Promise<FirebaseExchangeResult>;
};

const exchangeFirebaseCredential = async (
  credential:       FirebaseAuthTypes.UserCredential,
  preferredLangCd?: string,
): Promise<FirebaseExchangeResult> => {
  const idToken = await credential.user.getIdToken(true);
  return exchangeIdTokenForCustomerJwt(idToken, preferredLangCd);
};

// ── Public flows ──────────────────────────────────────────────────────────

/**
 * Sign in with email + password, then exchange for a customer JWT pair.
 * The Firebase user must already exist; for new users call
 * `signUpWithEmailAndExchange` instead.
 */
export const signInWithEmailAndExchange = async (
  email:            string,
  password:         string,
  preferredLangCd?: string,
): Promise<FirebaseExchangeResult> => {
  const credential = await auth().signInWithEmailAndPassword(email, password);
  return exchangeFirebaseCredential(credential, preferredLangCd);
};

/**
 * Create a brand-new Firebase user with email + password, then exchange.
 * HyperBabel auto-creates the matching `com_users` row on first exchange,
 * so no extra "create user" call is needed.
 */
export const signUpWithEmailAndExchange = async (
  email:            string,
  password:         string,
  preferredLangCd?: string,
): Promise<FirebaseExchangeResult> => {
  const credential = await auth().createUserWithEmailAndPassword(email, password);
  return exchangeFirebaseCredential(credential, preferredLangCd);
};

/**
 * Sign in anonymously and exchange. Useful for kiosk-style demos where a
 * stable account isn't needed. Production apps usually wire Google / Apple
 * / Email providers instead.
 */
export const signInAnonymouslyAndExchange = async (
  preferredLangCd?: string,
): Promise<FirebaseExchangeResult> => {
  const credential = await auth().signInAnonymously();
  return exchangeFirebaseCredential(credential, preferredLangCd);
};

/**
 * Exchange the currently-signed-in Firebase user's ID token for a customer
 * JWT. Use this after wiring your own provider flow (Google Sign-In, Apple,
 * etc.) once the Firebase user is already authenticated.
 */
export const exchangeCurrentFirebaseUserForJwt = async (
  preferredLangCd?: string,
): Promise<FirebaseExchangeResult> => {
  const user = auth().currentUser;
  if (!user) throw new Error('No Firebase user is currently signed in');
  const idToken = await user.getIdToken(true);
  return exchangeIdTokenForCustomerJwt(idToken, preferredLangCd);
};

/**
 * Sign the Firebase user out. Safe to call even when no user is signed in.
 * Does NOT revoke the HyperBabel customer JWT — call AuthContext.logout()
 * separately (or POST /customer/revoke from your backend) if you need to
 * invalidate every device.
 */
export const firebaseSignOut = async (): Promise<void> => {
  try {
    await auth().signOut();
  } catch {
    // ignore — no user signed in
  }
};
