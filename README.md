# HyperBabel Demo Applications

Welcome to the HyperBabel Demo Applications! This repository contains fully functional, production-ready sample applications built on top of the **HyperBabel API Platform**. The codebase is designed to serve as a comprehensive reference for integrating HyperBabel's real-time capabilities into your own products.

There are currently six reference implementations provided:

1. **[React (Web)](./react/README.md)** — Vite + React 19 single-page app
2. **[React Native (iOS / Android)](./react_native/README.md)** — Expo SDK 55, file-based routing, native development build
3. **[Flutter (iOS / Android)](./flutter/README.md)** — Flutter 3.3+, Riverpod, GoRouter
4. **[JavaScript (Vanilla Web)](./javascript/README.md)** — Framework-free vanilla JS + Vite
5. **[Swift (iOS)](./swift/README.md)** — SwiftUI, Swift Package Manager, iOS 16+
6. **[Kotlin (Android)](./kotlin/README.md)** — Jetpack Compose, Retrofit, Android SDK 34+

Every demo speaks the same HTTP endpoints, request bodies, response envelopes, and real-time event shapes, so the implementation closest to your target runtime is the one to start from.

---

## Supported Features

* **Real-time Chat (1:1, Group, Open)** — Room creation, joining, leaving, and live message broadcasting via the United Chat API.
* **Auto-Translation** — Cross-lingual messaging where each participant reads in their primary language.
* **Rich Messaging** — Full-text search, read receipts, typing indicators, pinned messages, reactions, and threaded replies.
* **1:1 and Group Video Calls** — Robust signaling for starting, accepting, rejecting, and ending calls. Includes incoming-call overlays, busy guards, rejoin banners, and 30-second auto-reject.
* **Live Streaming** — Broadcaster + Viewer roles via HyperBabel Video, with a live chat overlay.
* **File Upload** — Three-step pipeline (`presign` → signed `PUT` → `confirm`) backed by HyperBabel Storage.
* **Presence** — Online / Offline / Away with periodic heartbeat pings.
* **Push Notifications** — FCM / APNs token registration through HyperBabel Push.
* **Moderation** — Sub-admin promotion, ban / unban, freeze / unfreeze, mute / unmute.
* **Block List** — Per-user block / unblock + listing.
* **API Usage Monitoring** — `GET /auth/usage` for live consumption metrics.

---

## How to Test the Demos

You can clone this repository and run any of the demos using your own HyperBabel Workspace API Keys.

### Step 1: Obtain your API Key

1. Navigate to the **HyperBabel Console Dashboard** at [console.hyperbabel.com](https://console.hyperbabel.com).
2. Sign in or register for a Workspace.
3. Generate a new API Key in **Developer Settings** — you will receive an `hb_live_…` token.

### Step 2: Pick a demo and configure it

Web demos (React, JavaScript) read the API key from a `.env` file. Native-mobile demos (React Native, Flutter, Swift, Kotlin) accept the key on a launch screen — no `.env` editing required for them.

#### React (Web)

```bash
cd react
cp .env.example .env
# edit .env: VITE_HB_API_KEY=hb_live_...
npm install
npm run dev
# open http://localhost:5173
```

#### JavaScript (Vanilla Web)

```bash
cd javascript
cp .env.example .env
# edit .env: VITE_HB_API_KEY=hb_live_...
npm install
npm run dev
# open http://localhost:5175
```

#### React Native (iOS / Android)

> Because native SDKs are used (camera, audio, vibration, push), Expo Go is **not** supported. You must compile a development build directly onto a connected device or simulator.

```bash
cd react_native
cp .env.example .env
# edit .env: EXPO_PUBLIC_HB_API_KEY=hb_live_...
npm install
npx expo run:android   # Android device / emulator
npx expo run:ios       # iOS simulator / device (macOS only)
```

#### Flutter (iOS / Android)

```bash
cd flutter
flutter pub get
flutter run
# paste your hb_live_... API key on the launch screen
```

#### Swift (iOS)

```bash
cd swift
open Package.swift
```

In Xcode, create a new iOS App project, drag the `HyperBabelDemo/` folder into it, add the SDK package dependencies, and build to your simulator or device. The full step-by-step is in [`swift/README.md`](./swift/README.md). Paste your `hb_live_…` API key on the launch screen.

#### Kotlin (Android)

```bash
cd kotlin
cp local.properties.example local.properties
# edit local.properties: sdk.dir, optionally HB_API_KEY / HB_API_URL
./gradlew :app:installDebug
# or open the project in Android Studio and press Run
```

Paste your `hb_live_…` API key on the launch screen, or pre-fill it via `HB_API_KEY` in `local.properties`.

### Step 3: Origin / CORS Security (Web only)

HyperBabel enforces a Zero Trust security model. For web demos (React, JavaScript), requests are blocked with a `403 Forbidden` unless the origin is allow-listed.

* Open your API Key in the **Console Dashboard** and add the local development URL to **Allowed Origins**:
  * React → `http://localhost:5173`
  * JavaScript → `http://localhost:5175`
* Native demos (React Native, Flutter, Swift, Kotlin) do not send a browser-style `Origin` header and are accepted by default.

### Step 4: Try it across platforms

Once at least one demo is running, sign in with a different user ID on a second stack — for example `TestWeb` on the React demo and `TestPhone` on the Flutter demo — and place them side-by-side. You will see real-time multilingual chat, threaded reactions, video call signaling, live broadcasts, and in-call chat synchronizing across runtimes in real time.

---

## Architecture & Code Quality

All six demos have been audited and hardened to handle edge cases common in real-time engineering:

* **Event Guarding** — Real-time listeners strictly validate payloads, so heartbeat / typing traffic cannot leak into the message timeline as blank bubbles.
* **System Messages** — Backend-generated system alerts are intercepted at the rendering layer and shown centrally rather than as empty user bubbles.
* **Resource Cleanup** — Lists use bounded fallback rendering, and screens automatically tear down real-time connections, ringtones, vibration loops, and timers on unmount.
* **Identical Wire Shapes** — Endpoints, request bodies, response envelopes, and error codes are 1:1 across every demo, so swapping the client stack never requires backend changes.
