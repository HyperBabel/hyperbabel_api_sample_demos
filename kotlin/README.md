# HyperBabel Kotlin Android Demo

A vendor-neutral, Jetpack Compose reference implementation for the
**HyperBabel API Platform**. Drop-in code that shows how to call the public
HTTP endpoints, hold a live channel subscription, and join a 1:1 video call —
all using Kotlin, Retrofit, and the modern Android UI stack.

If you are using React, React Native, JavaScript, Flutter, or Swift, the same
endpoints, request bodies, and response shapes apply — see the sibling
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
| 1:1 Video call       | `POST /unitedchat/rooms/:roomId/video-call`, `…/active`, `…/leave` + HyperBabel Video |
| Live stream (host)   | `POST /stream/sessions`, `…/start`, `…/end` + HyperBabel Video (broadcaster) |
| Live stream (viewer) | `POST /stream/sessions/:id/viewer-token` + HyperBabel Video (audience) |
| Push tokens          | `POST /push/register`, `GET /push/tokens`                  |
| Usage stats          | `GET /auth/usage`                                          |
| Language detection   | `POST /translate/detect`                                   |
| Token issuance       | `POST /rtm/token`, `POST /rtm/rtc/token`                   |

## Prerequisites

- Android Studio Koala (2024.1) or newer
- Android SDK 34, build-tools 34
- A HyperBabel API Key — get one from the [HyperBabel Console](https://console.hyperbabel.com)

## Quick Start

```bash
cd sample_demos/kotlin
cp local.properties.example local.properties
# edit local.properties — set sdk.dir, optionally HB_API_KEY / HB_API_URL
./gradlew :app:assembleDebug   # build APK
./gradlew :app:installDebug    # install on a connected device / emulator
```

You can also open the project in Android Studio and press **Run**. On the
launch screen, paste your `hb_live_…` API key and your User ID, then **Sign in**.

## Configuration

| Property (local.properties) | Default                                | Purpose                                  |
| --------------------------- | -------------------------------------- | ---------------------------------------- |
| `sdk.dir`                   | —                                      | Path to your Android SDK                 |
| `HB_API_URL`                | `https://api.hyperbabel.com/api/v1`    | Pre-fill the API base URL on the login screen |
| `HB_API_KEY`                | —                                      | Pre-fill the API key on the login screen |

If you are running a local HyperBabel API server (e.g. via `wrangler dev` from
the platform source), set the URL on the login screen to:

```
http://10.0.2.2:8787/api/v1   # Android emulator → host loopback
http://localhost:8787/api/v1  # physical device sharing the host network
```

### CORS & Allowed Origins

In production HyperBabel APIs enforce **Strict Origin Validation (Zero Trust)**
for API Keys.

- Mobile builds typically do not send a browser-style `Origin` header, so they
  are accepted by default.
- If you have configured **Allowed Origins** for your API Key in the Console,
  make sure either the list is empty (which permits any origin) or it includes
  the test environment you call from.

## Project Structure

```
kotlin/
├── settings.gradle.kts
├── build.gradle.kts                        # project-level plugins
├── gradle.properties
├── local.properties.example
└── app/
    ├── build.gradle.kts                    # module-level: Compose, Retrofit, SDK deps
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml             # internet + camera + mic permissions
        ├── res/values/                     # strings, themes
        └── kotlin/com/hyperbabel/demo/
            ├── MainActivity.kt              # Compose nav graph
            ├── api/
            │   ├── ApiClient.kt             # OkHttp + Retrofit + Bearer interceptor
            │   ├── AuthService.kt           # /auth/usage
            │   ├── ChatService.kt           # /chat/* (reactions, search)
            │   ├── UnitedChatService.kt     # rooms, messages, moderation, video-call lifecycle
            │   ├── StreamService.kt         # live stream session lifecycle
            │   ├── StorageService.kt        # 3-step presign upload (envelope-aware)
            │   ├── TranslateService.kt      # AI Translation (text / detect / languages)
            │   ├── PresenceService.kt       # online status heartbeat + bulk lookup
            │   ├── PushService.kt           # FCM token register / list / unregister
            │   ├── UsersService.kt          # global block list
            │   └── RtmService.kt            # token issuance for Real-Time + Video
            ├── data/
            │   ├── Models.kt                # @Serializable wire types
            │   └── Session.kt               # in-memory session
            ├── realtime/
            │   └── HyperBabelRealtime.kt    # ably-android wired through authCallback
            ├── video/
            │   └── HyperBabelVideo.kt       # Agora wired with broadcaster / audience role + SurfaceView binding
            └── ui/
                ├── components/
                │   └── MembersSheet.kt      # promote / demote / ban modal
                ├── theme/Theme.kt           # Material 3 dark theme
                └── screens/
                    ├── LoginScreen.kt
                    ├── HomeScreen.kt
                    ├── ChatScreen.kt        # full UX (typing / reactions / reply / edit / delete / image / file / freeze / mute)
                    ├── VideoCallScreen.kt
                    ├── StreamScreen.kt      # list / host / viewer with real RTC publish + subscribe
                    ├── BlocksScreen.kt
                    └── SettingsScreen.kt    # usage / push tokens / language detection / logout
```

## Integrating into your own app

1. **HTTP layer.** Copy `data/Models.kt`, `api/ApiClient.kt`, and the four
   service interfaces in `api/`. They cover the public surface used in this
   demo and rely only on Retrofit + kotlinx.serialization.
2. **Real-Time push.** `realtime/HyperBabelRealtime.kt` shows how to exchange a
   token via `POST /rtm/token` and subscribe to a room channel. Wrap the
   underlying SDK behind your own thin facade so the vendor name never leaks
   into your app code.
3. **Video.** `video/HyperBabelVideo.kt` mirrors the same pattern for 1:1 /
   group video calls. Tokens come from `POST /rtm/rtc/token`; the SDK handles
   the media streams.

## API Key Lifecycle

API keys created from the Console default to a **Live** environment. Treat
the value in `local.properties` as a sandbox secret — never embed a Live key
in a binary you publish to end users. For production deployments issue
per-tenant keys from your own server.

## License

MIT — see the project root `LICENSE`.

> **Disclaimer**: This code is provided for demonstration purposes only.
> Add proper error handling, telemetry, and authentication before shipping.
