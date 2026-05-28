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

| Feature | APIs Used |
|---|---|
| **1:1 Chat** | United Chat — Rooms, Messages, Batch-Translate |
| **Group Chat** | United Chat — Rooms, Messages, Members |
| **Open Chat** | United Chat — Rooms, Join, Leave |
| **1:1 Video Call** | United Chat — Video Call (start, accept, reject, end) via HyperBabel Video |
| **Live Stream** | Stream — Broadcast & Spectate |
| **Auto-Translation** | Translation — Text, Batch, Detect, Languages |
| **Real-time Engine** | HyperBabel Real-Time — Signaling and live presence |

## Stack

- **Flutter** 3.27+ / Dart 3.5+
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

1. **Sign up at the HyperBabel Console** —
   <https://console.hyperbabel.com>. Once your organization exists,
   open **Customer Auth → Add Firebase project**.

2. **Allow-list your Firebase project**. In the console wizard:
   - Paste your Firebase project ID (e.g. `your-app-prod`).
   - Paste a Firebase ID token to prove ownership.
   - Click *Verify and add*. This step tells HyperBabel "trust ID
     tokens from this Firebase project."

3. **Enable sign-in methods in Firebase Console**:
   - Authentication → Sign-in method → enable **Email/Password** (and
     **Anonymous** if you want the kiosk-mode button on the login
     screen).

4. **Register your Flutter apps in Firebase**:
   - Android — application ID must match
     `android/app/build.gradle`'s `applicationId`.
   - iOS — bundle ID must match the value in `ios/Runner.xcodeproj`.

5. **Download the Firebase config files** from Firebase Console →
   Project Settings:
   - Android — `google-services.json`
   - iOS — `GoogleService-Info.plist`

6. **Drop both files into [`firebase/`](./firebase/)**. See
   [`firebase/README.md`](./firebase/README.md) for the build-step copy
   scripts that move them into `android/app/` and `ios/Runner/` on
   every build.

7. **Install and run**:
   ```bash
   cd sample_demos/flutter
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

### What if I skip step 6?

The app still builds and runs — `Firebase.initializeApp()` in
`main.dart` is wrapped in `try/catch`, and the sign-in screen renders
a "Firebase config missing" hint instead of the form. Useful for
browsing the source first.

### Token storage

The customer JWT pair lives in `flutter_secure_storage` (iOS Keychain
/ Android KeyStore — encrypted at rest). Identity preferences
(`user_id`, `display_name`, `lang`) live in `shared_preferences`.

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
│   │   │   ├── auth_repository.dart
│   │   │   ├── chat_repository.dart
│   │   │   ├── united_chat_repository.dart
│   │   │   ├── translate_repository.dart
│   │   │   ├── storage_repository.dart
│   │   │   ├── push_repository.dart
│   │   │   ├── stream_repository.dart
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
│   │   ├── chat/                             # Threaded messaging & translation
│   │   ├── video_call/                       # Interactive video components
│   │   ├── live_stream/                      # Broadcaster + viewer
│   │   ├── call/                             # Incoming call overlay
│   │   ├── blocks/                           # Block management
│   │   ├── settings/                         # Usage / push / language
│   │   └── home/                             # Central hub
│   │
│   ├── shared/widgets/                       # Glassmorphism reusable widgets
│   └── main.dart                             # dotenv + Firebase init + GoRouter
│
├── assets/images/                            # App icons
│
├── firebase/                                 # Drop Firebase native config here
│   └── README.md
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
final res = await dio.get('/unitedchat/rooms');
```

### 2. State management & real-time

WebSocket subscriptions for presence and typing live in
`hyperbabel_realtime_client.dart`. Subscribe to dedicated room channels
when navigating to `ChatScreen`.

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
