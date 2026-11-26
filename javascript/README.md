# HyperBabel JavaScript Demo

A framework-free, vanilla JavaScript reference for the **HyperBabel API
Platform**. Drop-in code that shows how to call the public HTTP
endpoints, hold a live channel subscription, and join a 1:1 video call —
all using vanilla browser modules and a Vite dev server.

Authentication uses **Customer Auth pattern B1 — Firebase Direct
Exchange**. The browser signs in with Firebase, exchanges the resulting
ID token for a short-lived HyperBabel customer JWT, and uses that JWT
for every subsequent API call. **The integrator's organization API key
(`hb_live_…` / `hb_test_…`) never ships in the browser bundle.** The
HTTP client throws at startup if it ever sees one.

For the full architecture, see the
[Customer Auth section on the docs site](https://hyperbabel.com/docs#customer-auth).
The per-org Firebase project allow-list is configured in the
[HyperBabel Console](https://console.hyperbabel.com) under **Customer Auth**.

If you are using React, React Native, Flutter, Swift, or Kotlin, the
same endpoints, request bodies, and response shapes apply — see the
sibling `sample_demos/*` projects.

## Features

| Feature              | APIs Used                                                  |
| -------------------- | ---------------------------------------------------------- |
| Sign in / Sign up    | Firebase Auth → `POST /customer/auth/firebase-exchange`, then `PATCH /customer/users/me` with the display name you typed |
| Sign out             | `POST /customer/logout` (ends the session and deletes this device's push tokens), then the real-time connection is closed |
| Room list & creation | `GET /unitedchat/rooms`, `POST /unitedchat/rooms` (1:1 or group with other user IDs, or open) |
| Chat (send / receive / edit / delete / typing / reactions / reply) | `/unitedchat/rooms/:id/messages*` (reactions included — room-scoped; replies use the top-level `reply_to` field) + Real-Time push |
| Message translation  | `POST /unitedchat/rooms/:roomId/messages/batch-translate`  |
| Image / file upload  | `POST /storage/presign` → PUT signed URL → `POST /storage/confirm` |
| Read receipts        | `POST /unitedchat/rooms/:roomId/read`                      |
| Members & moderation | `GET /unitedchat/rooms/:id/members`, ban / sub-admin / freeze / mute |
| Block list           | `GET /users/:id/blocks`, `DELETE /users/block` (unblock). `src/api/users.js` also wraps `POST /users/block`; no screen calls it |
| Presence heartbeat   | `POST /presence/heartbeat` every 30 s on the room list. `src/api/presence.js` also wraps `POST /presence/status` and `GET /presence?user_ids=…`; no screen calls them |
| 1:1 Video call       | `POST /unitedchat/rooms/:roomId/video-call`, `…/accept`, `…/reject`, `…/active`, `…/joined-rtc`, `…/heartbeat`, `…/renew-token`, `…/leave` + HyperBabel Video |
| Incoming call        | Real-Time event `signal` with `type: "CALL_INVITE"` on the user's private channel |
| Call events          | `video_call` system messages on the room channel (`metadata.event`: `call_started` / `call_accepted` / `call_ended` / `call_rejected` / `call_missed` / `call_busy`) |
| In-call live captions | `wss /stt-relay` (Speech Translation — live STT + translation subtitles). An `error` frame with `fatal: false` is transient and captions keep running; only `fatal: true` ends them |
| Live stream (host) — **needs your backend** | `GET /stream/sessions`, `POST /stream/sessions`, `…/start`, `…/heartbeat`, `…/end` + HyperBabel Video (broadcaster) |
| Live stream (viewer) — **needs your backend** | `POST /stream/sessions/:id/viewer-token` + HyperBabel Video (audience) |
| Push tokens          | `GET /push/tokens` (Settings). The demo registers no token — see [Push notifications](#push-notifications) |
| Language detection — **needs your backend** | `POST /translate/detect` — not called; the Settings screen explains why |
| Token issuance       | `POST /rtm/token`, `POST /rtm/rtc/token`                   |

Organization usage and plan data are available to your backend with the
organization API key, not to end-user apps, so the demo does not show them.

### How two users meet

Run the demo in two browsers (or one normal and one private window) and
sign in as two different users. Every user's ID is shown under the
**Create a room** form and in **Settings**. User A picks **1:1** (or
**Group**), pastes user B's ID into *Other user IDs*, and clicks
**Create** — the room appears in both users' room lists, and either of
them can start a video call from it.

The demo has no open-room browser and no invite-code join, so an **Open**
room it creates contains only you. Your app adds those flows on top of
the same API (the open rooms are returned as `open_rooms` by
`GET /unitedchat/rooms`).

### Features that need your backend

`/stream/*` (live streaming, host **and** viewer) and `/translate/*`
(text translation, language detection) accept **only your organization
API key**. This demo signs users in with a customer JWT and never holds
that key, so those calls are refused here (`401
invalid_api_key_format`) — the Streams screens show the resulting
"Invalid API key format" error, and the Settings screen explains it
instead of calling `/translate/detect`.

To ship them, route the call through your own server:
browser → your backend (holds `hb_live_…`) → HyperBabel. The paths,
payloads and response shapes in `src/api/stream.js` and
`src/api/translate.js` are accurate — implement them on your server and
expose a thin endpoint to the browser. The stream screens already read
the real responses: the host joins with `session.host.rtc_token` from
`POST /stream/sessions`, and viewers join with the flat `token` from
`…/viewer-token`.
Chat-message translation does **not** need this: it uses the room-scoped
batch-translate endpoint, which accepts the customer JWT.

The same applies to `/video/*` (API-key video sessions) and `/chat/*`
(which refuses customer JWTs with `403`). This demo calls neither: its
video calls use the room-scoped `/unitedchat/rooms/:roomId/video-call*`
endpoints, and its reactions use `/unitedchat/…/reactions`.

### Push notifications

HyperBabel delivers push through Firebase Cloud Messaging only, so the
token you register with `POST /push/register` must be an **FCM
registration token** — on iOS too (the token Firebase Messaging gives
you, not a raw APNs device token). FCM rejects a made-up token at the
first send and HyperBabel then deletes it, so never register a
placeholder.

This demo does not wire Firebase Messaging, so it registers no token. To
add push to your web app:

1. In Firebase Console → Project settings → Cloud Messaging, create a
   Web Push certificate (VAPID key), and serve a
   `firebase-messaging-sw.js` service worker.
2. Connect the same Firebase project in HyperBabel Console → **Push
   Settings**.
3. Right after sign-in, get the token with Firebase Messaging
   `getToken()` and pass it to `registerDeviceToken()` in
   `src/api/push.js` (the file header has the snippet). It remembers the
   token so that sign-out sends it to `POST /customer/logout`, which
   deletes this device's registration.

### Sign-out

Settings → **Logout** calls `POST /customer/logout` with the refresh
token (no Authorization header) **before** clearing anything locally.
That ends this device's session on the server, so the 30-day refresh
token stops working, and deletes the push tokens this device
registered. It then closes the real-time connection and the
incoming-call listener, so the next user who signs in to the same tab
gets their own call invites — not the previous user's.

## Prerequisites

- Node.js 20+
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
     tokens from this Firebase project." Without it, sign-in fails with
     `401` and the login screen shows the server's message:
     *Firebase project "…" is not registered with HyperBabel*.

3. **Enable sign-in methods in Firebase Console**:
   - Authentication → Sign-in method → enable **Email/Password** (and
     **Anonymous** if you want the kiosk-mode button on the login
     screen).
   - Authentication → Settings → Authorized domains → ensure your dev
     origin (`localhost` is allow-listed by default) and any prod
     hostname are present. Without this, Firebase rejects sign-in with
     `auth/unauthorized-domain`.

4. **Copy your Firebase Web SDK config** from Firebase Console →
   Project Settings → Your apps → Web → "Config" snippet. You need
   `apiKey`, `authDomain`, `projectId`, `storageBucket`,
   `messagingSenderId`, `appId`.

5. **Install, configure, and run**:
   ```bash
   cd sample_demos/javascript
   cp .env.example .env.local
   #  → paste your Firebase Web SDK values into the VITE_FIREBASE_* slots
   npm install
   npm run dev
   ```

Open <http://localhost:5175> in your browser. The login screen renders
a sign-in form when Firebase is configured, or a "Firebase config
missing" hint otherwise. Sign in (or create an account), and the demo
exchanges the Firebase ID token for a customer JWT, stores the pair in
`localStorage`, and routes you into the room list.

### Browser storage trade-off

The customer JWT lives in `localStorage`, which is XSS-readable. This
is the inherent cost of any client-direct B1 flow. The risk is
bounded — customer JWTs are short-lived (1 h access, 30 d refresh) and
scoped to a single end-user; they cannot create new users or touch
billing. For higher assurance, host an httpOnly-cookie backend that
brokers the exchange (pattern B2 in the
[Customer Auth docs](https://hyperbabel.com/docs#customer-auth)).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_HB_API_URL` | no | API base URL. Defaults to `https://api.hyperbabel.com/api/v1`. |
| `VITE_FIREBASE_API_KEY` | yes | Firebase Web SDK — apiKey |
| `VITE_FIREBASE_AUTH_DOMAIN` | yes | Firebase Web SDK — authDomain |
| `VITE_FIREBASE_PROJECT_ID` | yes | Firebase Web SDK — projectId |
| `VITE_FIREBASE_STORAGE_BUCKET` | yes | Firebase Web SDK — storageBucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | yes | Firebase Web SDK — messagingSenderId |
| `VITE_FIREBASE_APP_ID` | yes | Firebase Web SDK — appId |

There is no API-key env var — the demo only accepts customer JWTs
minted via Firebase Direct Exchange. Setting `VITE_HB_API_KEY` to an
`hb_live_…` / `hb_test_…` value makes the HTTP client throw at startup.

To send the demo's API calls somewhere else — for example a server you
run locally in front of the HyperBabel API — point it there:

```env
VITE_HB_API_URL=http://localhost:3000/api/v1
```

### CORS & Allowed Origins

HyperBabel APIs enforce **Strict Origin Validation** for org API keys.
That validation does NOT apply to customer JWTs from Firebase Direct
Exchange (the bearer is the per-end-user JWT, not your org key), so
this demo works from any authorized Firebase domain without extra
console configuration.

---

## Project Structure

```
javascript/
├── index.html                     # entry document with header + <main>
├── package.json
├── vite.config.js
├── .env.example                   # environment variables template
└── src/
    ├── main.js                    # hash router & app shell
    ├── styles.css                 # demo styling
    ├── api/
    │   ├── client.js              # Customer JWT HTTP client (B1) + error-message parsing
    │   ├── firebaseAuth.js        # Firebase → /customer/auth/firebase-exchange, display name, logout
    │   ├── chat.js                # room-scoped emoji reactions
    │   ├── unitedChat.js          # rooms / messages / translation / moderation / video-call
    │   ├── stream.js              # live stream session lifecycle (needs your backend)
    │   ├── storage.js             # 3-step presign upload (envelope-aware)
    │   ├── translate.js           # AI Translation text / detect / languages (needs your backend)
    │   ├── presence.js            # online status heartbeat + bulk lookup
    │   ├── push.js                # FCM token register / list / unregister (no token registered by the demo)
    │   ├── users.js               # own profile (display name) + global block list
    │   └── rtm.js                 # token issuance for Real-Time + Video
    ├── realtime/
    │   └── hyperbabelRealtime.js  # Real-Time client (vendor SDK aliased)
    ├── video/
    │   └── hyperbabelVideo.js     # Video client (vendor SDK aliased)
    ├── incomingCall.js            # global CALL_INVITE listener + Accept / Reject overlay
    ├── callEvents.js              # call events on the room channel
    └── pages/
        ├── login.js               # Firebase Email/Password + Anonymous
        ├── signup.js              # Firebase createUser → exchange
        ├── home.js                # room list + create (1:1 / group with other user IDs, open)
        ├── chat.js                # ChatScreen UX (typing / reactions / reply / translate / edit / delete / image / file / freeze / mute / members)
        ├── videoCall.js           # 1:1 video call surface (joined-rtc / heartbeat / token renewal / leave)
        ├── streams.js             # live stream discovery (needs your backend)
        ├── streamHost.js          # host broadcasts as publisher (needs your backend)
        ├── streamViewer.js        # viewer subscribes as audience (needs your backend)
        ├── blocks.js              # global block list management
        └── settings.js            # profile + push tokens + logout
```

## Integrating into your own app

1. **Auth.** Copy `src/api/firebaseAuth.js` and `src/api/client.js`.
   The first owns Firebase sign-in / sign-up / exchange, saving the
   typed display name (`completeSignIn`), and sign-out
   (`logoutAndClear` → `POST /customer/logout`); the second owns the
   customer JWT lifecycle (proactive refresh + 401 fallback + org-key
   guard) and reads the server's message from both error shapes
   (`{ "error": { "code", "message" } }` and `{ "error": "…" }`). On
   sign-out, also close the real-time connection and the incoming-call
   listener, as `src/pages/settings.js` does.
2. **HTTP services.** The modules in `src/api/` are pure `fetch` calls
   against the public HyperBabel API — copy whichever you need.
3. **Real-Time push.** `src/realtime/hyperbabelRealtime.js` shows how
   to exchange a token via `POST /rtm/token` and subscribe to a room
   channel. The underlying SDK is wrapped behind a thin facade so the
   vendor name never leaks into app code.
4. **Video.** `src/video/hyperbabelVideo.js` mirrors the same pattern
   for 1:1 / group video calls. Tokens come from
   `POST /rtm/rtc/token`; the SDK handles the media streams.
   `src/pages/videoCall.js` shows the session upkeep a call needs:
   `…/joined-rtc` once joined, `…/heartbeat` every minute, and
   `…/renew-token` before the one-hour RTC token expires. Every call
   action (`accept`, `reject`, `end`, `leave`, …) sends the call's
   `session_id`.
5. **Call events.** Call state changes arrive on the room's channel as
   `video_call` system messages (`src/callEvents.js`). The call page
   closes on `call_ended`; the caller of a 1:1 call stops on a decline,
   missed call or busy signal, and gives up when nobody joins within
   45 s (restarted once someone accepts, so a late answer still connects). The incoming-call overlay closes when the caller hangs up and
   reports a missed call after 45 s of ringing.

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

- `src/video/videoQuality.js` — the presets and the `quality` value are both defined here.
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
`quality` (`POST /unitedchat/rooms/:roomId/video-call` and, through your
backend, `POST /stream/sessions`), and **your app should too**. The API
accepts a request without it, but leaving it out is how the most common
billing surprise happens. The example below is the API-key video endpoint your
backend would call:

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
  constant. Build it with `publishResolutionFor(participantCount)` in
  `src/video/videoQuality.js`, which derives it from the same presets the
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
