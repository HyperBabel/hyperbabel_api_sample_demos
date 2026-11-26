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
| Sign in / Sign up    | Firebase Auth → `POST /customer/auth/firebase-exchange`, then `PATCH /customer/users/me { display_name }` when the user typed a name (1–60 characters). Without it a new user is named after the Firebase profile name or, failing that, the Firebase **email** — which other members would see. A failure is logged and does not block sign-in. |
| Logout               | `POST /customer/logout { refresh_token, push_tokens }` (no auth header) **before** local state is cleared — revokes the server session and deletes this device's push token; a failure is ignored |
| Room list & creation | `GET /unitedchat/rooms`, `POST /unitedchat/rooms` (group / open) |
| Chat (send / receive / edit / delete / typing / reply) | `/unitedchat/rooms/:id/messages*` (replies use the top-level `reply_to` field) + Real-Time push. Typing pings are throttled to one every 3 s. |
| Send a reaction      | `POST /unitedchat/rooms/:roomId/messages/:messageId/reactions` (room-scoped). The demo only sends reactions — it does not display them. |
| Image / file upload  | `POST /storage/presign` → PUT signed URL → `POST /storage/confirm`, then sent with the `message_type` the confirm step returns |
| Mark as read         | `POST /unitedchat/rooms/:roomId/read` when a room opens   |
| Members & moderation | `GET /unitedchat/rooms/:id/members`, ban / sub-admin / mute. Freeze / unfreeze for owner / sub_admin: the state is read from `room.is_frozen` and kept current by the `room.updated` Real-Time event. |
| Block list           | `GET /users/:id/blocks`, `DELETE /users/block` (list + unblock; `POST /users/block` is declared in `UsersService` but no screen calls it) |
| Presence heartbeat   | `POST /presence/heartbeat` every 30 s while the app is in the foreground. `PresenceService.list` wraps `GET /presence?user_ids=a,b` → `{ presence: [...] }` for your own UI; no screen uses it. |
| Video call (1:1, or group up to 3 people when your plan includes group video) | `POST /unitedchat/rooms/:roomId/video-call`, `…/active`, `…/accept`, `…/reject`, `…/leave`, `…/joined-rtc`, `…/heartbeat` (every 60 s), `…/renew-token` (each with `session_id`) + `CALL_INVITE` on the user's private Real-Time channel + call events (`call_ended`, `call_rejected`, …) on the room channel + HyperBabel Video. Camera / microphone permissions are requested before joining. Without group video a group call is rejected with 400 `plan_upgrade_required`; a call nobody joins is ended by the server after 3 minutes. |
| Live stream (host) ⚠️ | `POST /stream/sessions`, `…/start`, `…/end` + HyperBabel Video (broadcaster) — **needs your backend**, see below |
| Live stream (viewer) ⚠️ | `POST /stream/sessions/:id/viewer-token` + HyperBabel Video (audience) — **needs your backend**, see below |
| Push tokens          | `POST /push/register` with this device's FCM token (once per launch while signed in), `GET /push/tokens` — see [Push notifications](#push-notifications) |
| Token issuance       | `POST /rtm/token`, `POST /rtm/rtc/token`                   |
| Error messages       | Every non-2xx answer becomes an `ApiException` that keeps the server's message, for both error shapes: `{ "error": { "code", "message" } }` and `{ "error": "…" }` |

Organization usage and plan data are available to your backend with the
organization API key, not to end-user apps, so the demo does not show them.

### ⚠️ Live streaming and standalone translation need your backend

The rows marked ⚠️ are the only features that do **not** run from this
app, and that is by design rather than a gap.

Every `/stream/…` endpoint — and every standalone Translation endpoint
(`/translate/text`, `/translate/batch`, `/translate/detect`,
`/translate/languages`) —
authenticates with your **organization API key**
(`Authorization: Bearer hb_live_…`). A request carrying anything else is
rejected before it reaches the handler:

```
POST /api/v1/stream/sessions
→ 401 { "error": { "code": "invalid_api_key_format" } }
```

This app holds only a customer JWT — `api/ApiClient.kt` refuses to send
an org key from the device — so the stream calls fail here on purpose,
and the app does not call `/translate/…` at all. Run them as:

```
app  →  your backend (holds hb_live_…)  →  HyperBabel /stream/… or /translate/…
```

`api/StreamService.kt` and `ui/screens/StreamScreen.kt` still document the
exact live-stream call sequence and payloads; implement them on your
server and expose a thin endpoint the app can call. To translate chat
messages from the app itself, use
`POST /unitedchat/rooms/:roomId/messages/batch-translate`
(`UnitedChatService.batchTranslateMessages`), which accepts the customer
JWT.

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

### Push notifications

HyperBabel delivers push notifications only to **FCM registration tokens**
— on iOS too, where the app registers the token from Firebase Messaging.
Tokens FCM rejects are pruned on the server, so never register a
placeholder value.

- **Where the token is registered:** `PushRegistration.registerThisDevice()`
  in `api/PushService.kt`. Once per app launch while someone is signed in
  (`MainActivity.kt`), it reads `FirebaseMessaging.getInstance().token` and
  sends `POST /push/register { user_id, token, platform: "android",
  token_type: "fcm" }`. The same `google-services.json` that enables
  Firebase Auth enables Firebase Messaging.
- **On logout** the registered token goes to `POST /customer/logout` in
  `push_tokens`, which deletes it, so the next person on the device does not
  receive the previous user's notifications.
- **Before you ship:** add a `FirebaseMessagingService` that calls
  `POST /push/register` from `onNewToken` (tokens rotate), and on Android 13+
  declare and request `POST_NOTIFICATIONS` — without it the system shows no
  notifications. This demo registers the token but does not render
  notifications itself.

---

## Configuration

The default API base URL points at production
(`https://api.hyperbabel.com/api/v1`). To override (e.g. for a private
HyperBabel deployment), set `HB_API_URL` in `local.properties`:

```properties
# Your own API base URL — keep the trailing /api/v1
HB_API_URL=https://your-api-base-url.example.com/api/v1
```

The value is wired into `BuildConfig.HB_API_URL` and read by
`Session.apiUrl` on launch. It must end in `/api/v1`: the Retrofit paths in
`api/*.kt` are relative to it (`unitedchat/rooms`, not
`api/v1/unitedchat/rooms`).

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
        │   ├── ChatService.kt        # send / remove reactions (room-scoped)
        │   ├── UnitedChatService.kt  # rooms / messages / moderation / video-call
        │   ├── StreamService.kt      # live stream session lifecycle (needs your backend)
        │   ├── StorageService.kt     # 3-step presign upload
        │   ├── PresenceService.kt    # heartbeat / status / bulk read
        │   ├── PushService.kt        # FCM token register / list (PushRegistration)
        │   ├── UsersService.kt       # global block list + own profile (PATCH /customer/users/me)
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
   exchange / display-name save / sign-out; the second is the EncryptedSharedPreferences
   wrapper; the third owns the customer JWT lifecycle (proactive
   refresh + 401 fallback via Retrofit `Authenticator` + org-key
   guard + `POST /customer/logout`) and turns error answers into
   `ApiException` with the server's message.
2. **HTTP services.** The modules in `api/` are Retrofit interfaces +
   kotlinx-serialization — copy whichever you need. Their paths are
   relative to the `/api/v1/` base URL.
3. **Real-Time push.** `realtime/HyperBabelRealtime.kt` shows how to
   exchange a token via `POST /rtm/token`, subscribe to a room channel,
   and subscribe to the signed-in user's private channel
   (`user:{orgId}:{userId}`), where incoming calls arrive as event
   `signal` with `data.type == "CALL_INVITE"` (see `MainActivity.kt`).
   The underlying SDK is wrapped behind a thin facade so the vendor
   name never leaks into app code.
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
  (live-stream host, 1:1 call); 640 × 480 from three participants up, so
  even a four-way call (possible only through `POST /video/sessions` from
  your backend — room calls stop at three) still totals
  3 × 307,200 = 921,600 px.
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
POST /api/v1/unitedchat/rooms/:roomId/video-call
{
  "caller_id": "alice",
  "target_user_ids": ["bob", "carol"],
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
