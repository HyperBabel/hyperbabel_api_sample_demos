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
| Chat (send / receive / edit / delete / typing / reactions / reply) | `/unitedchat/rooms/:id/messages*` (reactions included — room-scoped) + Real-Time push |
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
    │   ├── ChatService.swift          # reactions (room-scoped)
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

---

## Video Resolution & Billing Tier

Video and live streaming are metered by **resolution tier**, decided by the
total resolution each participant *receives*. This demo keeps every call
inside the HD budget (921,600 px per participant) and declares the matching
tier on every session-creation call:

- `HyperBabelDemo/Video/VideoQuality.swift` — the presets and the `quality` value are both defined here.
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
  constant. Build it with `VideoQuality.publishResolution(forParticipantCount:)` in
  `HyperBabelDemo/Video/VideoQuality.swift`, which derives it from the same presets the
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
