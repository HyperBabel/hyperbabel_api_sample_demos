# HyperBabel Swift iOS Demo

A SwiftUI reference implementation for the **HyperBabel API Platform**.
Drop-in code that shows how to call the public HTTP endpoints, hold a
live channel subscription, and join a 1:1 video call — all using
modern Swift concurrency.

Authentication uses **Customer Auth pattern B1 — Firebase Direct
Exchange**. The app signs in with Firebase on device, exchanges the
resulting ID token at HyperBabel for a short-lived customer JWT, and
uses that JWT for every subsequent API call. **The integrator's
organization API key (`hb_live_…` / `hb_test_…`) never ships in this
binary.** `ApiClient` throws on any request that would carry one.

For the full architecture, see the
[Customer Auth section on the docs site](https://hyperbabel.com/docs#customer-auth).
The per-org Firebase project allow-list is configured in the
[HyperBabel Console](https://console.hyperbabel.com) under **Customer Auth**.

If you are using React, React Native, JavaScript, Flutter, or Kotlin,
the same endpoints, request bodies, and response shapes apply — see
the sibling `sample_demos/*` projects.

## Features

| Feature              | APIs Used                                                  |
| -------------------- | ---------------------------------------------------------- |
| Sign in / Sign up    | Firebase Auth → `POST /customer/auth/firebase-exchange`    |
| Room list & creation | `GET /unitedchat/rooms`, `POST /unitedchat/rooms`          |
| Chat (send / receive / edit / delete / typing / reactions / reply) | `/unitedchat/rooms/:id/messages*` + `/chat/messages/:id/reactions` + Real-Time push |
| Image / file upload  | `POST /storage/presign` → PUT signed URL → `POST /storage/confirm` |
| Read receipts        | `POST /unitedchat/rooms/:roomId/read`                      |
| Members & moderation | `GET /unitedchat/rooms/:id/members`, ban / sub-admin / freeze / mute |
| Block list           | `GET /users/:id/blocks`, `POST /users/block`, `DELETE /users/block` |
| Presence heartbeat   | `POST /presence/heartbeat`, `GET /presence?user_ids=…`     |
| Incoming-call overlay | Subscribes the user's private channel and POSTs `/video-call/accept` or `/reject` |
| 1:1 Video call       | `POST /unitedchat/rooms/:roomId/video-call`, `…/active`, `…/leave` + HyperBabel Video |
| Live stream (host)   | `POST /stream/sessions`, `…/start`, `…/end` + HyperBabel Video (broadcaster) |
| Live stream (viewer) | `POST /stream/sessions/:id/viewer-token` + HyperBabel Video (audience) |
| Push tokens          | `POST /push/register`, `GET /push/tokens`                  |
| Usage stats          | `GET /auth/usage`                                          |
| Language detection   | `POST /translate/detect`                                   |
| Token issuance       | `POST /rtm/token`, `POST /rtm/rtc/token`                   |

## Prerequisites

- macOS 14 (Sonoma) or newer
- Xcode 15.4 or newer (Swift 5.10+, iOS 16.0+ deployment target)
- A free Firebase project (free tier is enough)
- A HyperBabel organization — sign up at <https://console.hyperbabel.com>

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

4. **Register an iOS app in Firebase** (Console → Project Settings →
   Add app → iOS). The bundle ID must match your Xcode target's
   `PRODUCT_BUNDLE_IDENTIFIER`. Download `GoogleService-Info.plist`
   and drop it into [`firebase/`](./firebase/) — see
   [`firebase/README.md`](./firebase/README.md) for the Xcode
   integration steps.

5. **Set up the Xcode project**:
   ```bash
   cd sample_demos/swift
   open Package.swift   # Xcode opens the package; SDK deps fetch automatically
   ```

   To turn the sources into a runnable iOS app:

   1. **Create a new iOS App project** in Xcode (File → New → Project
      → iOS App, "SwiftUI", Swift, deployment target iOS 16).
   2. **Drag the `HyperBabelDemo/` folder** into the project navigator
      (choose "Create groups", do not copy files; tick the app target).
   3. **Delete the auto-generated `*App.swift` and `ContentView.swift`**
      the template added — `HyperBabelDemoApp.swift` from this repo
      replaces them.
   4. **Add the SDK dependencies** via File → Add Package Dependencies:
      - `https://github.com/ably/ably-cocoa.git` — pin to 1.2.0+
      - `https://github.com/AgoraIO/AgoraRtcEngine_iOS.git` — pin to 4.4.0+
      - `https://github.com/firebase/firebase-ios-sdk.git` — pin to 11.4.0+
        (products: **FirebaseAuth** + **FirebaseMessaging**)
   5. **Drag `firebase/GoogleService-Info.plist`** into Xcode (uncheck
      "Copy items if needed" so the file stays in `firebase/`; tick the
      app target so it's bundled). See `firebase/README.md`.
   6. **Set Info.plist usage descriptions** for camera + microphone:
      - `NSCameraUsageDescription` — "Used for video calls."
      - `NSMicrophoneUsageDescription` — "Used for voice and video calls."
   7. **Build and run** on a simulator or device. Sign in (or sign up)
      with Firebase, and the demo will exchange the ID token for a
      customer JWT and route you into the room list.

That's the whole setup. If `GoogleService-Info.plist` isn't bundled
the app still builds — the sign-in screen renders a "Firebase config
missing" hint instead of the form.

### Token storage

The customer JWT pair lives in the iOS Keychain (Security framework,
no third-party dep) — see `Models/SecureStore.swift`. Identity
preferences (`user_id`, `display_name`, `lang`, `apiUrl`) live in
`UserDefaults` so they persist across launches but aren't conflated
with secrets.

---

## Configuration

The default `ApiClient.defaultApiUrl` points at the production gateway.
If you operate a private HyperBabel deployment (e.g. via `wrangler dev`
from the platform source), assign a different URL in `Session` at
launch:

```swift
Session.shared.setApiUrl("http://localhost:8787/api/v1")
```

(The iOS Simulator can reach the host's `localhost` directly; physical
devices need the host machine's LAN IP.)

### CORS & Allowed Origins

HyperBabel APIs enforce **Strict Origin Validation** for org API keys.
That validation does NOT apply to customer JWTs from Firebase Direct
Exchange (the bearer is the per-end-user JWT, not your org key), and
iOS apps don't send a browser-style `Origin` header anyway, so this
demo works without extra console configuration.

---

## Project Structure

```
swift/
├── Package.swift                      # SPM manifest — documents SDK deps
├── .gitignore
├── firebase/                          # Drop GoogleService-Info.plist here
│   └── README.md
└── HyperBabelDemo/
    ├── HyperBabelDemoApp.swift        # @main + FirebaseApp.configure() + NavigationStack + IncomingCallOverlay
    ├── API/
    │   ├── ApiClient.swift            # Customer JWT HTTP client (B1) — proactive refresh + 401 fallback + org-key guard
    │   ├── FirebaseAuthService.swift  # Firebase → /customer/auth/firebase-exchange
    │   ├── AuthService.swift          # /auth/usage
    │   ├── ChatService.swift          # /chat/* (reactions)
    │   ├── UnitedChatService.swift    # rooms / messages / moderation / video-call lifecycle
    │   ├── StreamService.swift        # live stream session lifecycle
    │   ├── StorageService.swift       # 3-step presign upload
    │   ├── TranslateService.swift     # AI Translation
    │   ├── PresenceService.swift      # online status heartbeat
    │   ├── PushService.swift          # token register / list
    │   ├── UsersService.swift         # global block list
    │   └── RtmService.swift           # token issuance for Real-Time + Video
    ├── Models/
    │   ├── Models.swift               # Codable wire types
    │   ├── Session.swift              # ObservableObject identity + apiUrl (tokens live in Keychain)
    │   └── SecureStore.swift          # Keychain wrapper for customer JWT pair
    ├── Realtime/
    │   └── HyperBabelRealtime.swift   # Real-Time client (vendor SDK aliased)
    ├── Video/
    │   └── HyperBabelVideo.swift      # Video client (vendor SDK aliased)
    └── Screens/
        ├── LoginScreen.swift          # Firebase Email/Password + Anonymous
        ├── SignUpScreen.swift         # Firebase createUser → exchange
        ├── HomeScreen.swift
        ├── ChatScreen.swift           # ChatScreen UX
        ├── MembersSheet.swift
        ├── VideoCallScreen.swift
        ├── StreamScreen.swift
        ├── IncomingCallOverlay.swift  # Global Accept / Reject prompt
        ├── BlocksScreen.swift
        └── SettingsScreen.swift       # usage / push tokens / language detection / logout
```

## Integrating into your own app

1. **Auth.** Copy `API/FirebaseAuthService.swift` + `Models/SecureStore.swift`
   + `API/ApiClient.swift`. The first owns Firebase sign-in / sign-up
   / exchange / sign-out; the second is a small Keychain wrapper; the
   third owns the customer JWT lifecycle (proactive refresh + 401
   fallback + org-key guard).
2. **HTTP services.** The modules in `API/` are pure URLSession +
   Codable calls against the public HyperBabel API — copy whichever
   you need.
3. **Real-Time push.** `Realtime/HyperBabelRealtime.swift` shows how
   to exchange a token via `POST /rtm/token` and subscribe to a room
   channel. The underlying SDK is wrapped behind a thin facade so the
   vendor name never leaks into app code.
4. **Video.** `Video/HyperBabelVideo.swift` mirrors the same pattern
   for 1:1 / group video calls.

## License

MIT — see the project root `LICENSE`.

> **Disclaimer.** This code is provided for demonstration purposes only.
> Add proper error handling, telemetry, and end-to-end testing before
> shipping.
