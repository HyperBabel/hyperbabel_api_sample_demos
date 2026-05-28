# HyperBabel Demo — React Native

A production-grade React Native sample that demonstrates the HyperBabel API
suite on Android and iOS. Built on **Expo SDK 56 + React Native 0.85 +
`@react-native-firebase` v24 + `useFrameworks: 'static'`** with the React
Native source build enabled (matches the pinning used by the Arirang
shipping app, so the integration path is identical).

Authentication uses **Customer Auth pattern B1 — Firebase Direct
Exchange**. The mobile app signs in with Firebase, exchanges the resulting
ID token for a short-lived HyperBabel customer JWT, and uses that JWT for
every subsequent API call. **The integrator's organization API key
(`hb_live_…` / `hb_test_…`) never ships in this binary.** The HTTP client
throws at startup if it ever sees one.

For the full architecture and threat model, see the
[Customer Auth section on the docs site](https://hyperbabel.com/docs#customer-auth).
The per-org Firebase project allow-list is configured in the
[HyperBabel Console](https://console.hyperbabel.com) under **Customer Auth**.

---

## Quickstart — from zero to running app

1. **Sign up at the HyperBabel Console** —
   <https://console.hyperbabel.com>. Once your organization exists,
   go to **Customer Auth → Add Firebase project**.

2. **Allow-list your Firebase project**. In the console wizard:
   - Paste your Firebase project ID (e.g. `your-app-prod`).
   - Paste a Firebase ID token to prove ownership (the wizard shows two
     ways to generate one — pick whichever fits your setup).
   - Click *Verify and add*. This single step is what tells HyperBabel
     "trust ID tokens from this Firebase project."

3. **Download the Firebase native config files** from Firebase Console
   → Project Settings:
   - Android — `google-services.json`
   - iOS — `GoogleService-Info.plist`

4. **Drop both files into [`firebase/`](./firebase/)**. See
   [`firebase/README.md`](./firebase/README.md) for the per-platform
   instructions and `.gitignore` notes.

5. **Install dependencies and start**:
   ```sh
   cp .env.example .env.local        # optional: only edit if you self-host
   npm install
   npm run ios                       # or: npm run android
   ```

   Sign in or sign up on the login screen. The demo will exchange the
   Firebase ID token for a customer JWT, store the pair in SecureStore,
   and route you into the main app.

That's the whole setup. If `firebase/` is empty the app still builds — the
login screen renders a "Firebase config missing" hint instead of the
sign-in form, and `app.config.ts` prints the same notice during Metro
start so you don't have to dig through build logs.

---

## Key Implemented Features

### 1. Unified Chat
- **Real-time pipeline**: `RealtimeContext` subscribes to messages,
  typing indicators, and deleted-message events.
- **Rich messaging**: media upload via `expo-image-picker` with presigned
  URLs, emoji reactions (`ReactionPicker`), threaded replies (`ThreadPanel`).
- **Room moderation**: sticky announcements (`PinBanner`), role-based
  moderation — freeze room, ban/unban, promote/demote (`MembersSheet`).
- **Auto-translation**: `useTranslation` hook with in-memory batch caching
  renders global chats consistently across languages.
- **Rich attachments**: the plus menu sends image / video / file / voice
  message / location / contact — `expo-image-picker`, `expo-document-picker`,
  `expo-audio` (record + play), `expo-video` (inline playback), and
  `expo-location` (Use my location autofill).

### 2. Live Broadcasts
- **Stream discovery**: `streams.tsx` map fetches live rooms dynamically.
- **Chat overlay**: `StreamChat` floats over the host's video feed.
- **Role isolation**: hosts publish (`publisher`); viewers join muted
  (`subscriber`). Auto-leave when the host ends the broadcast.

### 3. Video Calls
- **In-call chat**: `InCallChat` keeps side-channel messaging visible
  without leaving the call.
- **Rejoin & auto-reject**: a "Rejoin Call" banner reattaches to an active
  call; a 30 s `autoRejectTimer` clears unanswered invitations.
- **Background incoming call**: `IncomingCallListener` detects invites on
  both platforms, rings via `expo-audio`, and vibrates with native
  `Vibration` loops.

### 4. Push Notifications & Presence
- **Presence**: `usePresence` pulses a heartbeat every 30 s while the app
  is foregrounded; pauses on background (`AppState` listener).
- **Push services**: `usePushNotifications` exchanges Firebase FCM tokens
  with HyperBabel's push APIs and persists them in `SecureStore`.

---

## How to Build & Run

This project uses native modules extensively (Camera, Audio, Vibration,
Firebase, …) so **Expo Go will not work**. You need a Development Build.

### Option A — Cloud build with EAS (recommended)

EAS Build compiles in Expo's macOS / Linux farms — no local Xcode required.

```sh
npm install
npx eas-cli login

# iOS simulator build
npx eas-cli build --profile development --platform ios

# iOS physical device (register the device once, then build)
npx eas-cli device:create
npx eas-cli build --profile development-device --platform ios

# Android device / emulator
npx eas-cli build --profile development --platform android
```

When the build finishes, EAS prints a QR / URL. Open it on the device
(Safari on iOS, Chrome on Android) to install, then run `npx expo start
--dev-client` on your laptop — the dev client discovers Metro over Wi-Fi.

### Option B — Local build with Xcode / Android Studio

```sh
npm install
npm run ios          # requires the Xcode version that ships with Expo SDK 56
npm run android      # requires Android Studio + a connected device or emulator
```

> **iOS first build is slow.** With `buildReactNativeFromSource: true`
> the first `npm run ios` compiles React Native from source (5–10 minutes
> on a modern Mac). Subsequent builds reuse the cache. This is required
> for `@react-native-firebase` v24 + RN 0.85 to link cleanly under
> `useFrameworks: 'static'` — leaving it off causes `RCT_EXTERN_METHOD`
> and `RCTPromiseRejectBlock` symbols to disappear from the RNFB pods at
> Pod install time.

> 💡 **Multi-platform testing tip.** Sign in to the React web demo with
> one account and to this React Native demo with a different account, then
> place them side-by-side to see real-time multilingual chat, threaded
> reactions, video calls, live broadcasting, and in-call chat
> synchronizing across platforms.

---

## iOS build notes

This stack — Expo SDK 56 + RN 0.85 + `@react-native-firebase` v24 +
`useFrameworks: 'static'` — needs several non-default pins. They are
already applied here; this section documents *why* so you don't undo
them by accident.

1. **`buildReactNativeFromSource: true`** in `app.json` under
   `expo-build-properties`. RN 0.85's pre-compiled distribution doesn't
   expose the ObjC headers RNFB v24 needs (`RCT_EXTERN_METHOD`,
   `RCTPromiseRejectBlock`). Building RN from source restores the v23-era
   resolution path. Cost: ~5–10 min added to the first iOS build.

2. **`deploymentTarget: '16.4'`** — minimum target RNFB v24 supports for
   the static-frameworks integration.

3. **`newArchEnabled: false`** in `app.json` and `expo-build-properties`.
   RNFB v24 still defaults to the Legacy Architecture under
   `useFrameworks: 'static'`. The "Legacy Architecture deprecated" warning
   from RNFB at `pod install` is expected and harmless.

4. **Custom Podfile patcher** at `plugins/withFirebaseModularHeaders.js`.
   At prebuild time it injects:
   - `$RNFirebaseAsStaticFramework = true` — RNFB pods build as static
     frameworks consistent with the workspace.
   - `use_modular_headers!` inside the target — React-Core exposes its
     macros (`RCT_EXTERN`, `RCTPromiseRejectBlock`, `RCTConvert`) across
     module boundaries.
   - `CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES` in
     `post_install` — defensive fallback for any remaining non-modular
     include.

5. **`overrides`** in `package.json` pinning `react` / `react-dom` to
   `19.2.3`. RN 0.85's transitive peer graph would otherwise let two
   incompatible React versions resolve.

### Bumping dependencies

`npx expo install --check` proposes upgrades — read them carefully. In
particular, do **not** flip `newArchEnabled` to `true` or drop
`buildReactNativeFromSource: true` while keeping RNFB v24 — both pins are
load-bearing for the iOS build. The audio / video stack is `expo-audio` +
`expo-video`; **do not** add `expo-av` back — it is deprecated since SDK
54 and Apple now rejects new submissions that link its native targets on
iOS 18+.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_HB_API_URL` | no | API base URL. Defaults to `https://api.hyperbabel.com/api/v1` — the only supported value for shipping builds. Override only if you operate HyperBabel on a private domain. |

There are no Firebase env vars — the native SDK reads everything from the
config files in [`firebase/`](./firebase/). There is no API-key env var —
the demo only accepts customer JWTs minted via Firebase Direct Exchange.
Setting `EXPO_PUBLIC_HB_API_KEY` to an `hb_live_…` / `hb_test_…` value
makes the HTTP client throw at startup.

All variables must be prefixed with `EXPO_PUBLIC_` to be inlined into the
React Native bundle.

---

## Permissions

Both platforms request platform permissions at runtime, only when the
relevant feature is first used. The matrix below maps each feature to the
underlying OS permission, where the declaration lives, and which hook or
service drives the runtime prompt.

| Feature | iOS prompt key | Android permission | Runtime trigger |
|---|---|---|---|
| Video call (caller + callee) | `NSCameraUsageDescription`, `NSMicrophoneUsageDescription` | `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `BLUETOOTH`, `BLUETOOTH_CONNECT` | `usePermissions` hook — proactive request with Settings fallback on denial |
| Live stream — host | (same as video call) | (same as video call) | Same `usePermissions` hook |
| Live stream — viewer | none | none | n/a (subscriber role, no capture) |
| Chat → image attach | `NSPhotoLibraryUsageDescription` | `READ_MEDIA_IMAGES` (A13+), `READ_EXTERNAL_STORAGE` (≤A12 fallback) | `ImagePicker.requestMediaLibraryPermissionsAsync()` inside `handleAttach` |
| Chat → video attach | `NSPhotoLibraryUsageDescription` | `READ_MEDIA_VIDEO` (A13+), `READ_EXTERNAL_STORAGE` (≤A12) | Same picker, with `MediaTypeOptions.Videos` |
| Chat → file attach | none (system picker; sandboxed file URI) | none — `DocumentPicker` uses the Storage Access Framework, no manifest permission required | `DocumentPicker.getDocumentAsync()` |
| Chat → audio (voice message) | `NSMicrophoneUsageDescription` (shared with video call) | `RECORD_AUDIO`, `READ_MEDIA_AUDIO` (A13+) | `AudioModule.requestRecordingPermissionsAsync()` (expo-audio) inside the voice modal |
| Chat → location share (GPS) | `NSLocationWhenInUseUsageDescription` | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | `Location.requestForegroundPermissionsAsync()` (expo-location) when the user taps **Use my location**; manual lat/lng entry still works without GPS |
| Chat → contact share | n/a (manual name/phone/email input) | n/a | n/a — keypad input only |
| Push notifications (FCM) | none (system prompt via Firebase plugin) | `POST_NOTIFICATIONS` (A13+) | `messaging().requestPermission()` in `usePushNotifications` |
| Background video call (A14+) | `UIBackgroundModes` includes `audio` | `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CAMERA`, `FOREGROUND_SERVICE_MICROPHONE` | Declared only — Android 14 requires the typed FOREGROUND_SERVICE permissions for any ongoing capture session; the demo currently keeps calls in the foreground |
| Ringtone audio (incoming call) | `UIBackgroundModes` includes `audio` (plays while iOS is on silent) | n/a (bundled asset) | Configured by `src/utils/ringtone.ts` (expo-audio) |
| Incoming-call vibration | n/a | `VIBRATE` | Declared only; `Vibration.vibrate(pattern, true)` |
| Boot persistence of FCM token | n/a | `RECEIVE_BOOT_COMPLETED` | Declared only; Firebase handles |
| Internet + connectivity probe | n/a (system) | `INTERNET`, `ACCESS_NETWORK_STATE` | Declared only |

The bundled `ImagePicker` request follows the **proactive + Settings
escape** pattern the rest of the demo uses: ask once, and if the user
denies, surface an `Alert` that opens the Settings app via
`Linking.openSettings()`. Mirror this pattern for any permission you add.

### Adding a permission

1. Declare it in `app.json`:
   - iOS — add a `<key>USAGE_DESCRIPTION_KEY</key>` entry under
     `expo.ios.infoPlist`. App Store rejects builds whose features touch
     a protected API without an accompanying description, even when the
     call is gated behind a user toggle.
   - Android — append the bare permission string to
     `expo.android.permissions`.
2. Write the runtime request in a hook or handler following the
   `usePermissions` pattern.
3. Run `npx expo prebuild --clean` if you maintain a checked-in
   `ios/`/`android/`; otherwise EAS regenerates them on every build.

### Removing a permission

Remove the declaration from `app.json` **and** delete every call site
that would touch the corresponding API — leaving stale calls behind will
fail at runtime on devices that have never granted the permission.

---

## Project Structure

```
sample_demos/react_native/
├── app/                        # Expo Router screens (file-based routing)
│   ├── _layout.tsx             # Root layout (providers + overlays)
│   ├── index.tsx               # Auth redirect
│   ├── (auth)/                 # Login + Signup (Firebase Direct Exchange)
│   ├── (main)/                 # Authenticated tabs
│   │   ├── dashboard.tsx       # Sandbox Hub
│   │   ├── chat/               # Chat Hub + Room Detail
│   │   ├── streams.tsx         # Live stream discovery
│   │   └── settings.tsx        # Settings + API usage
│   ├── video-call/             # Video call room
│   └── live-stream/            # Host + Viewer screens
│
├── src/
│   ├── components/             # Design system + always-on overlays
│   ├── context/                # AuthContext / CallContext / RealtimeContext
│   ├── services/
│   │   ├── api.ts                    # Customer JWT HTTP client (B1)
│   │   ├── firebaseAuthService.ts    # Firebase → /customer/auth/firebase-exchange
│   │   ├── unitedChatService.ts
│   │   ├── realtimeService.ts
│   │   ├── translateService.ts
│   │   ├── storageService.ts
│   │   ├── presenceService.ts
│   │   ├── pushService.ts
│   │   ├── streamService.ts
│   │   └── authService.ts
│   ├── theme/                  # Design tokens (colors, typography, spacing)
│   └── utils/
│       └── ringtone.ts         # expo-audio + Vibration ringtone controller
│
├── assets/
│   └── sounds/
│       └── ringtone.mp3        # Replace with your incoming call audio file
│
├── firebase/                   # Drop google-services.json + GoogleService-Info.plist here
│   └── README.md
│
├── plugins/
│   └── withFirebaseModularHeaders.js   # Podfile patcher for RNFB v24 + static frameworks
│
├── .env.example                # Environment variable template
├── app.json                    # Expo static config (bundle IDs, permissions, plugins)
├── app.config.ts               # Dynamic config — adds Firebase plugins iff config files present
└── eas.json                    # EAS Build profiles
```

---

## Ringtone

The default ringtone lives at:

```
assets/sounds/ringtone.mp3
```

It is played via `expo-audio` with looping enabled and **plays even when
the iOS device is on silent** (`playsInSilentMode: true` in
`setAudioModeAsync`). Device vibration is triggered simultaneously via
React Native's `Vibration` API. `expo-av` is deprecated since Expo SDK
54 — this project does not depend on it.

Replace the file with your own audio if you want a different tone.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE)
file for details.

> **Disclaimer.** This code is provided for demonstration purposes only.
> It is not intended for production environments without proper security
> and performance reviews.
