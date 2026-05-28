/**
 * HyperBabel Demo — Expo Config (dynamic)
 *
 * Stack: Expo SDK 56 + React Native 0.85 + react-native-firebase v24 +
 * useFrameworks: 'static' + buildReactNativeFromSource (see app.json plugins).
 *
 * Loads the static base from `app.json` (via ConfigContext) and then layers on
 * Firebase + Auth + Messaging modules only when the native config files are
 * present at:
 *
 *   firebase/google-services.json     (Android)
 *   firebase/GoogleService-Info.plist (iOS)
 *
 * Without those files the Firebase plugins are skipped entirely, so prebuild
 * succeeds and `npm run android/ios` works on first download — the developer
 * sees a printed notice instead of a cryptic build failure. Sign-in screens
 * surface the same notice in-app.
 *
 * To enable Customer Auth (pattern B1: Firebase direct exchange), drop the
 * two files into the `firebase/` folder and rebuild. The plugin set is
 * recomputed on every Metro start — no code changes required.
 *
 * See firebase/README.md for the full setup path and how it maps to the
 * Console → Customer Auth → Add Firebase project flow.
 */

import fs from 'fs';
import path from 'path';
import type { ExpoConfig, ConfigContext } from 'expo/config';

const ROOT             = __dirname;
const FIREBASE_DIR     = path.join(ROOT, 'firebase');
const ANDROID_FB_FILE  = path.join(FIREBASE_DIR, 'google-services.json');
const IOS_FB_FILE      = path.join(FIREBASE_DIR, 'GoogleService-Info.plist');

const hasAndroidFirebase = fs.existsSync(ANDROID_FB_FILE);
const hasIosFirebase     = fs.existsSync(IOS_FB_FILE);
const firebaseEnabled    = hasAndroidFirebase || hasIosFirebase;

export default ({ config }: ConfigContext): ExpoConfig => {
  const base       = config as ExpoConfig;
  const basePlugins = (base.plugins ?? []) as NonNullable<ExpoConfig['plugins']>;
  const plugins: NonNullable<ExpoConfig['plugins']> = [...basePlugins];
  const android = { ...(base.android ?? {}) } as Record<string, unknown>;
  const ios     = { ...(base.ios     ?? {}) } as Record<string, unknown>;

  if (firebaseEnabled) {
    plugins.push('@react-native-firebase/app');
    plugins.push('@react-native-firebase/auth');
    plugins.push('@react-native-firebase/messaging');
    plugins.push('./plugins/withFirebaseModularHeaders');
    if (hasAndroidFirebase) android.googleServicesFile = './firebase/google-services.json';
    if (hasIosFirebase)     ios.googleServicesFile     = './firebase/GoogleService-Info.plist';
  } else {
    // Loud, idempotent notice — easier than digging through prebuild logs.
    // eslint-disable-next-line no-console
    console.log(
      '\n[HyperBabel Demo] Firebase config files not found — sign-in disabled.\n' +
      '  Drop google-services.json (Android) and GoogleService-Info.plist (iOS) into\n' +
      '  the firebase/ folder, then restart Metro. See firebase/README.md for steps.\n',
    );
  }

  return {
    ...base,
    name:    base.name    ?? 'HyperBabel Demo',
    slug:    base.slug    ?? 'hyperbabel-demo',
    plugins,
    android: android as ExpoConfig['android'],
    ios:     ios     as ExpoConfig['ios'],
  };
};
