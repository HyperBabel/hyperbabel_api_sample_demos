# HyperBabel Kotlin Android Demo

A Jetpack Compose reference implementation for the **HyperBabel API
Platform**. Drop-in code that shows how to call the public HTTP
endpoints, hold a live channel subscription, and join a 1:1 video call —
all using Kotlin, Retrofit, and the modern Android UI stack.

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

If you are using React, React Native, JavaScript, Flutter, or Swift,
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

4. **Register your Android app in Firebase**:
   - Package name must match `applicationId` in `app/build.gradle.kts`
     (template: `com.hyperbabel.demo`).
   - SHA-1 fingerprint is optional for Email/Password auth.

5. **Download `google-services.json`** from Firebase Console →
   Project Settings → Your Android app, then drop it into
   [`firebase/`](./firebase/). See
   [`firebase/README.md`](./firebase/README.md) for the build-step
   copy that moves it to `app/` on every build.

6. **Configure and run**:
   ```bash
   cd sample_demos/kotlin
   cp local.properties.example local.properties
   # edit local.properties — set sdk.dir
   ./gradlew :app:assembleDebug   # build APK
   ./gradlew :app:installDebug    # install on a connected device / emulator
   ```

   Or just open the project in Android Studio and press **Run**.

Sign in (or sign up) on the launch screen, and the demo will exchange
the Firebase ID token for a customer JWT, store the pair in
EncryptedSharedPreferences, and route you into the room list.

### What if I skip step 5?

The app still builds and runs — `FirebaseApp.initializeApp()` returns
null when no config is present, and the sign-in screen renders a
"Firebase config missing" hint instead of the form. Useful for
browsing the source first.

### Token storage

The customer JWT pair lives in `EncryptedSharedPreferences`
(Android Keystore-backed, AES-256-GCM at rest) — see
`data/SecureStore.kt`. Identity preferences (`user_id`, `display_name`,
`lang`, `apiUrl`) live in a plain `SharedPreferences` file so they
persist across launches but aren't conflated with secrets.

---

## Configuration

The default API base URL points at production
(`https://api.hyperbabel.com/api/v1`). To override (e.g. for a private
HyperBabel deployment), set `HB_API_URL` in `local.properties`:

```properties
# Android emulator hits the host's localhost as 10.0.2.2
HB_API_URL=http://10.0.2.2:8787/api/v1
```

The value is wired into `BuildConfig.HB_API_URL` and read by
`Session.apiUrl` on launch.

### CORS & Allowed Origins

HyperBabel APIs enforce **Strict Origin Validation** for org API keys.
That validation does NOT apply to customer JWTs from Firebase Direct
Exchange (the bearer is the per-end-user JWT, not your org key), and
Android apps don't send a browser-style `Origin` header anyway, so
this demo works without extra console configuration.

---

## Project Structure

```
kotlin/
├── build.gradle.kts                  # Root: AGP / Kotlin / serialization / google-services plugin declarations
├── settings.gradle.kts               # Repository declarations (incl. the video RTC SDK maven)
├── gradle.properties
├── local.properties.example          # Template — sdk.dir + optional HB_API_URL
├── firebase/                         # Drop google-services.json here
│   └── README.md
└── app/
    ├── build.gradle.kts              # App: compose, retrofit, firebase, security-crypto, real-time + video SDKs
    └── src/main/kotlin/com/hyperbabel/demo/
        ├── MainActivity.kt           # Entry + Compose nav + SecureStore.init + Session.init
        ├── api/
        │   ├── ApiClient.kt          # Customer JWT Retrofit client (B1) — proactive refresh + Authenticator + org-key guard
        │   ├── FirebaseAuthService.kt# Firebase → /customer/auth/firebase-exchange
        │   ├── AuthService.kt        # /auth/usage
        │   ├── ChatService.kt        # /chat/* (reactions)
        │   ├── UnitedChatService.kt  # rooms / messages / moderation / video-call
        │   ├── StreamService.kt      # live stream session lifecycle
        │   ├── StorageService.kt     # 3-step presign upload
        │   ├── TranslateService.kt   # AI Translation
        │   ├── PresenceService.kt    # online status heartbeat
        │   ├── PushService.kt        # token register / list
        │   ├── UsersService.kt       # global block list
        │   └── RtmService.kt         # token issuance for Real-Time + Video
        ├── data/
        │   ├── Models.kt             # @Serializable wire types
        │   ├── Session.kt            # Identity + apiUrl in SharedPreferences (tokens in SecureStore)
        │   └── SecureStore.kt        # EncryptedSharedPreferences wrapper
        ├── realtime/
        │   └── HyperBabelRealtime.kt # Real-Time client (vendor SDK aliased)
        ├── video/
        │   └── HyperBabelVideo.kt    # Video client (vendor SDK aliased)
        └── ui/
            ├── components/
            │   ├── IncomingCallOverlay.kt
            │   └── MembersSheet.kt
            ├── screens/
            │   ├── LoginScreen.kt    # Firebase Email/Password + Anonymous
            │   ├── SignUpScreen.kt   # Firebase createUser → exchange
            │   ├── HomeScreen.kt
            │   ├── ChatScreen.kt
            │   ├── VideoCallScreen.kt
            │   ├── StreamScreen.kt
            │   ├── BlocksScreen.kt
            │   └── SettingsScreen.kt
            └── theme/
                └── Theme.kt
```

## Integrating into your own app

1. **Auth.** Copy `api/FirebaseAuthService.kt` + `data/SecureStore.kt`
   + `api/ApiClient.kt`. The first owns Firebase sign-in / sign-up /
   exchange / sign-out; the second is the EncryptedSharedPreferences
   wrapper; the third owns the customer JWT lifecycle (proactive
   refresh + 401 fallback via Retrofit `Authenticator` + org-key
   guard).
2. **HTTP services.** The modules in `api/` are Retrofit interfaces +
   kotlinx-serialization — copy whichever you need.
3. **Real-Time push.** `realtime/HyperBabelRealtime.kt` shows how to
   exchange a token via `POST /rtm/token` and subscribe to a room
   channel. The underlying SDK is wrapped behind a thin facade so the
   vendor name never leaks into app code.
4. **Video.** `video/HyperBabelVideo.kt` mirrors the same pattern for
   1:1 / group video calls.

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

- `app/src/main/kotlin/com/hyperbabel/demo/video/VideoQuality.kt` — the presets and the `quality` value are both defined here.
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
  `app/src/main/kotlin/com/hyperbabel/demo/video/VideoQuality.kt`, which derives it from the same presets the
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
