# HyperBabel Flutter Demo Sample

A cross-platform Flutter demo that showcases the HyperBabel API Platform
on iOS and Android. Use it as a reference for integrating HyperBabel
real-time chat, video, and AI translation into your own Flutter apps.

Authentication uses **Customer Auth pattern B1 — Firebase Direct
Exchange**. The app signs in with Firebase on device, exchanges the
resulting ID token at HyperBabel for a short-lived customer JWT, and
uses that JWT for every subsequent API call. **The integrator's
organization API key (`hb_live_…` / `hb_test_…`) never ships in this
binary.** `api_client.dart` throws at startup if it ever sees one.

For the full architecture, see the
[Customer Auth section on the docs site](https://hyperbabel.com/docs#customer-auth).
The per-org Firebase project allow-list is configured in the
[HyperBabel Console](https://console.hyperbabel.com) under **Customer Auth**.

## Features

What the app actually does, screen by screen:

| Feature | APIs used |
|---|---|
| **Sign in / sign up** — email + password, or anonymous | Firebase Auth → `POST /customer/auth/firebase-exchange` |
| **Display name** — a name typed on the sign-in / sign-up form is saved right after the exchange, so other members never see your email address | `PATCH /customer/users/me { display_name }` |
| **Session refresh** — before expiry and on a 401; if the server rejects the refresh token, the app returns to the sign-in screen | `POST /customer/refresh` |
| **Logout** — revokes the session and deletes this device's push token **before** local state is cleared; a failed call never blocks the logout | `POST /customer/logout { refresh_token, push_tokens }` (no Authorization header) |
| **Rooms** — list the rooms you belong to, create a group room, long-press to leave | `GET /unitedchat/rooms`, `POST /unitedchat/rooms`, `POST …/leave` |
| **Chat** — history, text, replies, edit / delete your own messages, image and file upload, reactions, typing indicator (at most one ping every 3 s), read marker, live updates | `/unitedchat/rooms/:roomId/messages*`, `…/reactions`, `…/typing`, `…/read`, `/storage/presign` → PUT → `/storage/confirm`, HyperBabel Real-Time |
| **Members & moderation** — member list with roles; the owner promotes / demotes sub_admins; owner and sub_admin ban (a sub_admin bans plain members only) and freeze / unfreeze; anyone mutes the room for themselves | `GET …/members`, `POST` / `DELETE …/sub-admins`, `POST …/ban`, `POST` / `DELETE …/freeze`, `POST` / `DELETE …/mute`, `GET …/mute/:userId` |
| **Video call** — 1:1, or a group call of up to 3 people when your plan includes group video (otherwise 400 `plan_upgrade_required`) | `POST …/video-call`, `…/accept`, `…/reject`, `…/joined-rtc`, `…/heartbeat` (every 60 s), `…/renew-token`, `…/leave`, `GET …/video-call/active`, `POST /rtm/rtc/token` + `CALL_INVITE` on the user's private Real-Time channel + call events on the room channel, via HyperBabel Video |
| **Blocked users** — list and unblock | `GET /users/:userId/blocks`, `DELETE /users/block` |
| **Presence** — heartbeat every 30 s while the app is in the foreground | `POST /presence/heartbeat` |
| **Push** — registers this device's real FCM token (on iOS too) and lists your tokens in Settings | `POST /push/register`, `GET /push/tokens` — see [Push notifications](#push-notifications) |
| **Errors** — every failed call keeps the server's own message, for both error shapes `{ "error": { "code", "message" } }` and `{ "error": "…" }` | `lib/core/network/api_error.dart` |
| **Live stream** ⚠️ — host and viewer | `GET` / `POST /stream/sessions`, `…/start`, `…/heartbeat`, `…/end`, `…/viewer-token` — **needs your backend**, see below |

Not covered by any screen:

- **1:1 and open rooms.** The app creates group rooms only, and the group
  starts with just you — there is no screen for adding members
  (`POST /unitedchat/rooms/:roomId/members`) or for joining an open room.
  1:1 and open rooms you already belong to (created by your backend or
  another app) appear in the list and work in chat.
- **In the repositories for your own UI, but not called:** message
  translation (`UnitedChatRepository.batchTranslateMessages` →
  `POST /unitedchat/rooms/:roomId/messages/batch-translate`), unban
  (`unbanUser`), block (`UsersRepository.blockUser`), the bulk presence read
  (`PresenceRepository.getPresence` → `GET /presence?user_ids=a,b`), and
  `PushRepository.unregisterToken`.
- **Standalone translation** (`translate_repository.dart`) — needs your
  backend, see below. Organization usage and plan data are business data for
  your backend too, so the demo does not show them.

### ⚠️ Live streaming and text translation need your backend

The live-stream screen and `translate_repository.dart` do **not** work from
this demo, and that is by design rather than a gap.

Every `/stream/*` and `/translate/*` endpoint authenticates with your
**organization API key** (`Authorization: Bearer hb_live_…`). A request
carrying anything else is rejected before it reaches the handler:

```
POST /api/v1/stream/sessions
→ 401 { "error": { "code": "invalid_api_key_format", "message": "Invalid API key format" } }
```

Creating a broadcast allocates paid capacity and translation is metered
against your organization, so the caller has to be **you**, not a signed-in
end user. This demo holds only a customer JWT — `api_client.dart` refuses to
carry an org key on a device — so the live-stream screen's calls fail here on
purpose, and the app does not call `/translate/*` at all.

Run them as:

```
app  →  your backend (holds hb_live_…)  →  HyperBabel /stream/* and /translate/*
```

`lib/core/network/stream_repository.dart` and `translate_repository.dart`
document the exact paths and payloads; implement them on your server and
expose a thin endpoint the app can call. To translate chat messages from the
app itself, use the end-user endpoint
`POST /unitedchat/rooms/:roomId/messages/batch-translate`
(`UnitedChatRepository.batchTranslateMessages`). Everything else in this
demo — chat, video calls, storage uploads, presence, push, blocking — calls
end-user endpoints that accept the customer JWT.

Two more API families are backend-only, though this app does not call them:
`/video/*` (standalone video sessions, organization API key — in-app calls
use the room-scoped `/unitedchat/rooms/:roomId/video-call*` endpoints
instead) and `/chat/*` (answers 403 to a customer JWT — use `/unitedchat/*`).

## Stack

- **Flutter** 3.38.4+ / Dart 3.10.3+ (what the committed `pubspec.lock` requires)
- `firebase_core` / `firebase_auth` / `firebase_messaging` — sign-in &
  push
- `flutter_secure_storage` — JWT pair lives in iOS Keychain / Android
  KeyStore
- `flutter_dotenv` — `.env` runtime config
- `dio` — HTTP client with customer JWT + proactive refresh
- `flutter_riverpod` — state management
- `go_router` — declarative routing with auth-aware redirects
- HyperBabel Real-Time client + HyperBabel Video / Live Stream engine
  — bundled SDKs are imported by package name and aliased to
  HyperBabel-named symbols in `lib/core/realtime/` and
  `lib/core/video/`. See those files for the alias pattern.

---

## Quickstart — from zero to running app

This repository ships only the Dart code (`lib/`), `pubspec.yaml` and
assets. The native `android/` and `ios/` projects are **not** in it — you
generate them in step 4 and then apply the platform setup below.

1. **Sign up at the HyperBabel Console** —
   <https://console.hyperbabel.com>. Once your organization exists,
   open **Customer Auth → Add Firebase project**.

2. **Allow-list your Firebase project**. In the console wizard:
   - Paste your Firebase project ID (e.g. `your-app-prod`).
   - Paste a Firebase ID token to prove ownership.
   - Click *Verify and add*. This step tells HyperBabel "trust ID
     tokens from this Firebase project." Without it every sign-in fails
     with 401 `Firebase project "<id>" is not registered with HyperBabel`.

3. **Enable sign-in methods in Firebase Console**:
   - Authentication → Sign-in method → enable **Email/Password** (and
     **Anonymous** if you want the kiosk-mode button on the login
     screen).

4. **Generate the native projects** (run inside `sample_demos/flutter`):
   ```bash
   cd sample_demos/flutter
   flutter create --platforms=android,ios --org com.yourcompany .
   rm -f test/widget_test.dart   # template test for a counter app that isn't here
   ```
   `flutter create .` only adds files that are missing — it does not
   touch `lib/`, `pubspec.yaml` or this README. Replace `com.yourcompany`
   with your own reverse domain. The generated IDs are:
   - Android `applicationId` — `com.yourcompany.hyperbabel_demo`, in
     `android/app/build.gradle.kts` (`android/app/build.gradle` on
     Flutter versions that still generate Groovy).
   - iOS bundle ID — `com.yourcompany.hyperbabelDemo`
     (`PRODUCT_BUNDLE_IDENTIFIER` in `ios/Runner.xcodeproj`; Xcode →
     Runner target → Signing & Capabilities).

5. **Register both apps in Firebase** with exactly those IDs (Firebase
   Console → Project settings → Your apps), then **download the config
   files** — `google-services.json` (Android) and
   `GoogleService-Info.plist` (iOS) — into [`firebase/`](./firebase/).
   [`firebase/README.md`](./firebase/README.md) shows how to install them
   into `android/app/` and the Xcode project.

6. **Apply the platform setup** — [Android](#android-setup) and
   [iOS](#ios-setup) below: the Google Services Gradle plugin, `minSdk`,
   core library desugaring, permissions, the iOS Podfile and `Info.plist`.

7. **Install and run**:
   ```bash
   flutter pub get
   flutter run               # or: flutter run -d ios / -d android
   ```

   No `.env` is needed for the default setup — the demo targets the
   public HyperBabel production API. `.env` is only required if you
   run against a private HyperBabel deployment (`HB_API_URL=…`) — see
   [.env.example](./.env.example) for the override surface.

That's the whole setup. Sign in (or sign up), and the demo exchanges
the Firebase ID token for a customer JWT, stores the pair in secure
storage, and routes you into the main app.

### What if I skip the Firebase config files?

The app still builds and runs — `Firebase.initializeApp()` in
`main.dart` is wrapped in `try/catch`, and the sign-in screen renders
a "Firebase config missing" hint instead of the form. Useful for
browsing the source first. (On Android the Google Services Gradle plugin
fails the build when `android/app/google-services.json` is missing — add
the plugin only once you have the file.)

---

## Platform setup

The plugins in `pubspec.yaml` need a few native settings that
`flutter create` does not add.

### Android setup

**1. Google Services Gradle plugin** — reads
`android/app/google-services.json`, which `Firebase.initializeApp()`
depends on. In `android/settings.gradle.kts`, add to the `plugins { }`
block:

```kotlin
id("com.google.gms.google-services") version "4.4.2" apply false
```

and in `android/app/build.gradle.kts`, add to its `plugins { }` block:

```kotlin
id("com.google.gms.google-services")
```

(Groovy projects: `id "com.google.gms.google-services" version "4.4.2" apply false`
in `android/settings.gradle`, and `id "com.google.gms.google-services"` in
`android/app/build.gradle`.)

**2. `minSdk` and core library desugaring** — in
`android/app/build.gradle.kts`:

```kotlin
android {
    compileOptions {
        // Required by flutter_local_notifications (in pubspec.yaml) — the
        // build fails without it.
        isCoreLibraryDesugaringEnabled = true
        // keep the sourceCompatibility / targetCompatibility lines
    }
    defaultConfig {
        // API 23 or higher: newer Firebase Android SDKs require it. Recent
        // Flutter versions already default to 24; older ones default to 21.
        minSdk = maxOf(flutter.minSdkVersion, 23)
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
```

(Groovy: `coreLibraryDesugaringEnabled true`,
`minSdk = Math.max(flutter.minSdkVersion, 23)` and
`coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.4'`.)

**3. Permissions** — the video SDK and `firebase_messaging` already
declare these in their own manifests, and Android merges them into your
app. Declaring them in `android/app/src/main/AndroidManifest.xml` (above
`<application>`) keeps them visible:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<!-- Video calls and live streams -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<!-- Push notifications on Android 13+ -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

Camera and microphone are requested at runtime before a call or broadcast
(`permission_handler`); the notification prompt appears when the push
token is registered. Picking photos and files uses the system pickers and
needs no storage permission.

### iOS setup

**1. `ios/Podfile`** — Firebase needs iOS 13, and `permission_handler`
only asks for the permissions you enable with build flags (without them,
camera / microphone requests are denied without a prompt):

```ruby
platform :ios, '13.0'

# …

post_install do |installer|
  installer.pods_project.targets.each do |target|
    flutter_additional_ios_build_settings(target)
    target.build_configurations.each do |config|
      config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= [
        '$(inherited)',
        'PERMISSION_CAMERA=1',
        'PERMISSION_MICROPHONE=1',
      ]
    end
  end
end
```

**2. `ios/Runner/Info.plist`** — usage descriptions for everything the app
touches, plus remote notifications for push:

```xml
<key>NSCameraUsageDescription</key>
<string>Video calls and live streams use the camera.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Video calls and live streams use the microphone.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Choose a photo to send in a chat.</string>
<key>UIBackgroundModes</key>
<array>
  <string>remote-notification</string>
</array>
```

**3. `GoogleService-Info.plist`** — must be part of the Runner target, not
just present in the folder: see [`firebase/README.md`](./firebase/README.md).

**4. Push** — in Xcode → Runner target → Signing & Capabilities, add
**Push Notifications** (and select your development team). Then upload an
APNs authentication key (`.p8`) in Firebase Console → Project settings →
Cloud Messaging → Apple app configuration. Without these, Firebase
Messaging cannot produce an FCM token on iOS: the demo registers nothing
and Settings → Push Tokens says why. Test push on a real device.

Run `cd ios && pod install` (or just `flutter run`) after changing the
Podfile.

---

## Push notifications

HyperBabel delivers push notifications only to **FCM registration tokens**
— on iOS too, where the token comes from Firebase Messaging, not the raw
APNs device token. Tokens FCM rejects are pruned on the server, so never
register a placeholder value.

- **Where the token is registered:** `PushRegistration.registerThisDevice()`
  in `lib/core/network/push_repository.dart`, called from the home screen
  once per app run while someone is signed in. It asks for notification
  permission, reads `FirebaseMessaging.instance.getToken()`, and sends
  `POST /push/register { user_id, token, platform, token_type: "fcm" }`.
  It registers again when Firebase rotates the token (`onTokenRefresh`).
- **Sending:** HyperBabel sends through your own Firebase project — upload
  its service account JSON in the HyperBabel Console → **Push Settings**.
- **On logout** the registered token goes to `POST /customer/logout` in
  `push_tokens`, which deletes it, so the next person on the device does not
  receive the previous user's notifications.
- **Before you ship:** this demo registers the token but does not render
  notifications itself — handle `FirebaseMessaging.onMessage` (foreground)
  and the notification tap in your app.

## Token storage

The customer JWT pair lives in `flutter_secure_storage` (iOS Keychain
/ Android KeyStore — encrypted at rest). Identity preferences
(`user_id`, `display_name`, `lang`) and the registered FCM token live in
`shared_preferences`; logout clears all of them.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `HB_API_URL` | no | API base URL. Defaults to `https://api.hyperbabel.com/api/v1`. |

Flutter mobile apps don't read Firebase Web SDK config from env vars
— the native SDK reads everything from `google-services.json` /
`GoogleService-Info.plist` directly. There are no `FIREBASE_*` env
vars in this template.

There is also no API-key env var — the demo only accepts customer
JWTs minted via Firebase Direct Exchange. Setting `HB_API_KEY` to an
`hb_live_…` / `hb_test_…` value in `.env` makes `api_client.dart`
throw at startup.

If you create a `.env`, you also need to add `- .env` under
`flutter.assets:` in `pubspec.yaml` so `flutter_dotenv` can find it
at runtime. **Never commit `.env`** — `.gitignore` blocks it and lets
only `.env.example` through.

---

## Architecture & Project Structure

```
flutter/
├── lib/
│   ├── core/
│   │   ├── auth/
│   │   │   ├── firebase_auth_service.dart   # Firebase → /customer/auth/firebase-exchange
│   │   │   └── auth_controller.dart         # Riverpod, secure storage
│   │   │
│   │   ├── network/
│   │   │   ├── api_client.dart              # Customer JWT HTTP client (B1, dio)
│   │   │   ├── api_error.dart               # Server error message, both error shapes
│   │   │   ├── chat_repository.dart         # Reactions (room-scoped)
│   │   │   ├── united_chat_repository.dart
│   │   │   ├── translate_repository.dart     # ⚠️ needs your backend — not called by the app
│   │   │   ├── storage_repository.dart
│   │   │   ├── push_repository.dart         # FCM token registration
│   │   │   ├── stream_repository.dart        # ⚠️ needs your backend
│   │   │   ├── presence_repository.dart
│   │   │   ├── users_repository.dart
│   │   │   └── rtm_repository.dart
│   │   │
│   │   ├── realtime/                         # HyperBabel Real-Time client
│   │   ├── video/                            # HyperBabel Video client
│   │   ├── utils/
│   │   └── theme/                            # AppTheme — Deep Dark + Accents
│   │
│   ├── features/                             # Domain-driven feature sets
│   │   ├── auth/                             # Firebase sign-in + sign-up
│   │   ├── chat/                             # Messages, replies, reactions, uploads, members sheet
│   │   ├── video_call/                       # Interactive video components
│   │   ├── live_stream/                      # Broadcaster + viewer (⚠️ needs your backend)
│   │   ├── call/                             # Incoming call overlay
│   │   ├── blocks/                           # Block management
│   │   ├── settings/                         # Profile / push tokens / language / logout
│   │   └── home/                             # Room list, presence heartbeat, push registration
│   │
│   ├── shared/widgets/                       # Glassmorphism reusable widgets
│   └── main.dart                             # dotenv + Firebase init + GoRouter
│
├── assets/images/                            # App icons
│
├── firebase/                                 # Drop Firebase native config here
│   └── README.md
│
├── android/, ios/                            # NOT in the repo — `flutter create` (Quickstart step 4)
│
├── .env.example                              # Environment variables template
├── pubspec.yaml                              # Dart package dependencies
└── README.md                                 # This file
```

## Integrating into your own app

### 1. HTTP layer (`api_client.dart`)

`dio` interceptors attach the customer JWT to every request and refresh
transparently on 401:

```dart
final dio = ApiClient().client;
final res = await dio.get('/unitedchat/rooms', queryParameters: {'user_id': myUserId});
```

When `POST /customer/refresh` itself is rejected (the refresh token was
revoked or expired), `ApiClient.onSessionExpired` fires; `main.dart` signs
the user out locally, which routes back to the sign-in screen. Turn a failed
call into a readable message with `apiErrorMessage(e)` from `api_error.dart`.

### 2. State management & real-time

`hyperbabel_realtime_client.dart` fetches its token from `POST /rtm/token`
through the same `ApiClient` — customer JWT, `HB_API_URL`, transparent
refresh — so no organization API key is involved. Room events (messages,
edits, deletions, reactions, typing) arrive on the room's
`realtime_channel`, passed through verbatim from the REST API. Incoming
calls arrive on the user's private channel `user:{orgId}:{userId}` as the
real-time message `signal` with `data.type == 'CALL_INVITE'` — see
`features/call/presentation/incoming_call_listener.dart`. Call state changes
(`call_started`, `call_ended`, `call_rejected`, …) arrive on the room channel
as `video_call` system messages; the call screen and the ringing overlay
follow them, and `video_call_screen.dart` shows the upkeep every call needs
(`joined-rtc`, a 60 s `heartbeat`, `renew-token` before the 1-hour RTC token
expires).

### 3. Avoiding layout overflows

Flutter enforces strict bounding boxes. Translated text can be
unexpectedly long, so for chat bubbles use:

- `BoxConstraints(maxWidth: ...)` for bubble width.
- `softWrap: true` on `Text` widgets.

See `chat_screen.dart` for the pattern.

---

## Customization

- **Styling**: `lib/core/theme/app_theme.dart` governs the color
  profile. The app ships in an immersive Dark Mode layout.
- **Glass effects**: `lib/shared/widgets/glass_container.dart` —
  tweak `blurStrength`.
- **API URL**: change `HB_API_URL` in `.env` to point at a private
  HyperBabel deployment.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE)
file for details.

> **Disclaimer.** This code is provided for demonstration purposes only.
> Thoroughly sanitize user state and handle connection exceptions before
> shipping to production.

---

## Video Resolution & Billing Tier

Video and live streaming are metered by **resolution tier**, decided by the
total resolution each participant *receives*. This demo keeps every call
inside the HD budget (921,600 px per participant) and declares the matching
tier on every session-creation call:

- `lib/core/video/video_quality.dart` — the presets and the `quality` value are both defined here.
- 1280 × 720 when a participant receives at most one remote stream
  (live-stream host, 1:1 call); 640 × 480 from three participants up, so a
  four-way call still totals 3 × 307,200 = 921,600 px.
- `quality` is sent as `"hd"`. If you publish above these presets, change the
  preset **and** the declared tier together in that one file — the declared
  value is what your invoice is calculated from (Terms §5.1 / §5.2).
- The roster is re-evaluated on every join **and** every leave, so a call
  that drops from four participants to two moves back up to 1280 × 720 and a
  participant who rejoins pulls everyone back down before publishing a frame.

### Always send `publish_resolution`

Every session-creation call in this demo sends `publish_resolution` alongside
`quality`, and **your app should too**. The API accepts a request without it,
but leaving it out is how the most common billing surprise happens.

```
POST /api/v1/video/sessions
{
  "call_type": "group",
  "participants": [ ... ],
  "quality": "hd",
  "publish_resolution": { "width": 640, "height": 480 }
}
```

- **What the value means.** The resolution this session will actually publish
  **at this participant count** — not your camera's maximum, and not a
  constant. Build it with `VideoQuality.publishResolutionFor(participantCount)` in
  `lib/core/video/video_quality.dart`, which derives it from the same presets the
  encoder uses, so the number you send and the pixels you emit cannot drift
  apart.
- **What HyperBabel does with it.** It multiplies the value by the number of
  streams one participant receives — participants − 1 for a call, 1 for a
  broadcast, since a viewer subscribes to the host only — and compares the
  total against `quality`. If the total lands in a higher tier, the creation
  response carries a `quality_warning` string. The session is still created and
  nothing is blocked.
- **It never changes your bill.** Billing follows `quality`, always. This field
  exists so you can catch a wrong `quality` before the invoice does.
- **Why it matters.** The mistake it catches is not dishonesty, it is a unit
  mismatch: 720p is genuinely HD in a 1:1 call and genuinely *above* HD in a
  four-way one, because tiers are computed on the total each participant
  receives. Declaring `"hd"` while publishing 720p to three other people is an
  honest answer to the wrong question — and without this field nothing tells
  you so.
- **Read `quality_warning` and act on it.** Log it at minimum. If it appears,
  either lower the publishing resolution or declare the tier it names. Do not
  ignore it: your invoice is calculated from `quality`, and the difference is
  recoverable under Terms §5.2.

See the [root README](../README.md#video-resolution--billing-tier) for the
full table and the reasoning.
