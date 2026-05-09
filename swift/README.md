# HyperBabel Swift iOS Demo

A vendor-neutral, SwiftUI reference implementation for the **HyperBabel API
Platform**. Drop-in code that shows how to call the public HTTP endpoints,
hold a live channel subscription, and join a 1:1 video call — all using
modern Swift concurrency.

If you are using React, React Native, JavaScript, Flutter, or Kotlin, the
same endpoints, request bodies, and response shapes apply — see the sibling
`sample_demos/*` projects.

## Features

| Feature              | APIs Used                                                  |
| -------------------- | ---------------------------------------------------------- |
| Sign in              | local in-memory session (no auth call)                     |
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
- A HyperBabel API Key — get one from the [HyperBabel Console](https://console.hyperbabel.com)

## Quick Start

```bash
cd sample_demos/swift
open Package.swift   # Xcode opens the package
```

The included `Package.swift` declares the SDK dependencies. To turn the
sources into a runnable iOS app:

1. **Create a new iOS App project** in Xcode (File → New → Project → iOS App,
   "SwiftUI", Swift, deployment target iOS 16).
2. **Drag the `HyperBabelDemo/` folder** into the project navigator (choose
   "Create groups", do not copy files; tick the app target).
3. **Delete the auto-generated `*App.swift` and `ContentView.swift`** the
   template added — `HyperBabelDemoApp.swift` from this repo replaces them.
4. **Add the SDK dependencies** via File → Add Package Dependencies:
   - `https://github.com/ably/ably-cocoa.git` — pin to 1.2.0+
   - `https://github.com/AgoraIO/AgoraRtcEngine_iOS.git` — pin to 4.4.0+
5. **Set Info.plist usage descriptions** for camera + microphone:
   - `NSCameraUsageDescription` — "Used for video calls."
   - `NSMicrophoneUsageDescription` — "Used for voice and video calls."
6. **Build and run** on a simulator or device. Paste your `hb_live_…` API
   key on the launch screen.

## Configuration

The login screen captures both the API key and the API base URL. Defaults
are baked into `ApiClient.defaultApiUrl` and `ApiClient.defaultApiKey` —
override them in source if you want sensible defaults pre-filled.

If you are running a local HyperBabel API server (e.g. via `wrangler dev`
from the platform source), set the URL on the login screen to:

```
http://localhost:8787/api/v1
```

(The iOS Simulator can reach the host's `localhost` directly; physical
devices need the host machine's LAN IP.)

### CORS & Allowed Origins

In production HyperBabel APIs enforce **Strict Origin Validation (Zero
Trust)** for API Keys.

- iOS apps do not send a browser-style `Origin` header, so they are accepted
  by default.
- If you have configured **Allowed Origins** for your API Key in the
  Console, make sure either the list is empty (which permits any origin) or
  it includes the test environment you call from.

## Project Structure

```
swift/
├── Package.swift                      # SPM manifest — documents SDK deps
├── .gitignore
└── HyperBabelDemo/
    ├── HyperBabelDemoApp.swift        # @main entry + NavigationStack + IncomingCallOverlay + shared NavStore
    ├── API/
    │   ├── ApiClient.swift            # URLSession + Bearer token + Codable
    │   ├── AuthService.swift          # /auth/usage
    │   ├── ChatService.swift          # /chat/* (reactions)
    │   ├── UnitedChatService.swift    # rooms / messages / moderation / video-call lifecycle
    │   ├── StreamService.swift        # live stream session lifecycle (envelope-aware)
    │   ├── StorageService.swift       # 3-step presign upload (envelope-aware)
    │   ├── TranslateService.swift     # AI Translation (text / detect / languages)
    │   ├── PresenceService.swift      # online status heartbeat
    │   ├── PushService.swift          # FCM token register / list
    │   ├── UsersService.swift         # global block list
    │   └── RtmService.swift           # token issuance for Real-Time + Video
    ├── Models/
    │   ├── Models.swift               # Codable wire types (Reaction, MessageMetadata, …)
    │   └── Session.swift              # ObservableObject session
    ├── Realtime/
    │   └── HyperBabelRealtime.swift   # ably-cocoa wired through authCallback
    ├── Video/
    │   └── HyperBabelVideo.swift      # Agora wired with broadcaster / audience role + SwiftUI VideoCanvasView
    └── Screens/
        ├── LoginScreen.swift
        ├── HomeScreen.swift
        ├── ChatScreen.swift           # full UX (typing / reactions / reply / edit / delete / image / file / freeze / mute)
        ├── MembersSheet.swift         # promote / demote / ban modal
        ├── VideoCallScreen.swift
        ├── StreamScreen.swift         # list / host / viewer with real RTC publish + subscribe
        ├── IncomingCallOverlay.swift  # global Accept / Reject prompt over NavigationStack
        ├── BlocksScreen.swift
        └── SettingsScreen.swift       # usage / push tokens / language detection / logout
```

## Integrating into your own app

1. **HTTP layer.** Copy `Models/Models.swift`, `API/ApiClient.swift`, and the
   four service modules in `API/`. They cover the public surface used in this
   demo and rely only on URLSession + Codable.
2. **Real-Time push.** `Realtime/HyperBabelRealtime.swift` shows how to
   exchange a token via `POST /rtm/token` and subscribe to a room channel.
   Wrap the underlying SDK behind your own thin facade so the vendor name
   never leaks into your app code.
3. **Video.** `Video/HyperBabelVideo.swift` mirrors the same pattern for
   1:1 / group video calls. Tokens come from `POST /rtm/rtc/token`; the SDK
   handles the media streams.

## API Key Lifecycle

API keys created from the Console default to a **Live** environment. Treat
the value you paste on the login screen as a sandbox secret — never embed a
Live key in a binary you publish to end users. For production deployments
issue per-tenant keys from your own server.

## License

MIT — see the project root `LICENSE`.

> **Disclaimer**: This code is provided for demonstration purposes only.
> Add proper error handling, telemetry, and authentication before shipping.
