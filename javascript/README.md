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
     tokens from this Firebase project."

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

If you operate a private HyperBabel deployment (e.g. via `wrangler dev`
from the platform source), point the demo at it:

```env
VITE_HB_API_URL=http://localhost:8787/api/v1
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
    │   ├── client.js              # Customer JWT HTTP client (B1)
    │   ├── firebaseAuth.js        # Firebase → /customer/auth/firebase-exchange
    │   ├── auth.js                # /auth/usage
    │   ├── chat.js                # /chat/* (reactions, search)
    │   ├── unitedChat.js          # rooms / messages / moderation / video-call
    │   ├── stream.js              # live stream session lifecycle
    │   ├── storage.js             # 3-step presign upload (envelope-aware)
    │   ├── translate.js           # AI Translation (text / detect / languages)
    │   ├── presence.js            # online status heartbeat + bulk lookup
    │   ├── push.js                # token register / list / unregister
    │   ├── users.js               # global block list
    │   └── rtm.js                 # token issuance for Real-Time + Video
    ├── realtime/
    │   └── hyperbabelRealtime.js  # Real-Time client (vendor SDK aliased)
    ├── video/
    │   └── hyperbabelVideo.js     # Video client (vendor SDK aliased)
    └── pages/
        ├── login.js               # Firebase Email/Password + Anonymous
        ├── signup.js              # Firebase createUser → exchange
        ├── home.js                # room list + create
        ├── chat.js                # ChatScreen UX (typing / reactions / reply / edit / delete / image / file / freeze / mute / members)
        ├── videoCall.js           # 1:1 video call surface
        ├── streams.js             # live stream discovery
        ├── streamHost.js          # host broadcasts as publisher
        ├── streamViewer.js        # viewer subscribes as audience
        ├── blocks.js              # global block list management
        └── settings.js            # API usage + push tokens + language detection + logout
```

## Integrating into your own app

1. **Auth.** Copy `src/api/firebaseAuth.js` and `src/api/client.js`.
   The first owns Firebase sign-in / sign-up / exchange / sign-out;
   the second owns the customer JWT lifecycle (proactive refresh +
   401 fallback + org-key guard).
2. **HTTP services.** The modules in `src/api/` are pure `fetch` calls
   against the public HyperBabel API — copy whichever you need.
3. **Real-Time push.** `src/realtime/hyperbabelRealtime.js` shows how
   to exchange a token via `POST /rtm/token` and subscribe to a room
   channel. The underlying SDK is wrapped behind a thin facade so the
   vendor name never leaks into app code.
4. **Video.** `src/video/hyperbabelVideo.js` mirrors the same pattern
   for 1:1 / group video calls. Tokens come from
   `POST /rtm/rtc/token`; the SDK handles the media streams.

## License

MIT — see the project root `LICENSE`.

> **Disclaimer.** This code is provided for demonstration purposes only.
> Add proper error handling, telemetry, and end-to-end testing before
> shipping.
