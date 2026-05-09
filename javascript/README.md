# HyperBabel JavaScript Demo

A vendor-neutral, framework-free JavaScript reference implementation for the
**HyperBabel API Platform**. Drop-in code that shows how to call the public
HTTP endpoints, hold a live channel subscription, and join a 1:1 video call —
all using vanilla browser modules and a Vite dev server.

If you are using React, React Native, Flutter, Swift, or Kotlin, the same
endpoints, request bodies, and response shapes apply — see the sibling
`sample_demos/*` projects.

## Features

| Feature              | APIs Used                                                  |
| -------------------- | ---------------------------------------------------------- |
| Sign in              | local session storage (no auth call)                       |
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
- A HyperBabel API Key — get one from the [HyperBabel Console](https://console.hyperbabel.com)

## Quick Start

```bash
cd sample_demos/javascript
npm install
cp .env.example .env
# edit .env and paste your hb_live_… API key into VITE_HB_API_KEY
npm run dev
```

Open [http://localhost:5175](http://localhost:5175) in your browser.

## Environment Configuration

| Variable          | Description                                | Default                                |
| ----------------- | ------------------------------------------ | -------------------------------------- |
| `VITE_HB_API_URL` | HyperBabel API base URL                    | `https://api.hyperbabel.com/api/v1`    |
| `VITE_HB_API_KEY` | Your API Key from the Console dashboard    | —                                      |

If you are running a local HyperBabel API server (e.g. via `wrangler dev` from
the platform source), point the demo at it:

```
VITE_HB_API_URL=http://localhost:8787/api/v1
```

### CORS & Allowed Origins

In production HyperBabel APIs enforce **Strict Origin Validation (Zero Trust)**
for API Keys.

- This demo runs on `http://localhost:5175` by default.
- If you have configured **Allowed Origins** for your API Key in the Console,
  you must add `http://localhost:5175` (or whichever origin you serve the demo
  from) to the list. Otherwise requests will be rejected with
  `403 origin_not_allowed`.

## Project Structure

```
javascript/
├── index.html                     # entry document with header + <main>
├── package.json
├── vite.config.js
├── .env.example
└── src/
    ├── main.js                    # hash router & app shell
    ├── styles.css                 # demo styling
    ├── api/
    │   ├── client.js              # fetch wrapper + Bearer token
    │   ├── auth.js                # /auth/usage
    │   ├── chat.js                # /chat/* (reactions, search)
    │   ├── unitedChat.js          # rooms / messages / moderation / video-call lifecycle
    │   ├── stream.js              # live stream session lifecycle
    │   ├── storage.js             # 3-step presign upload (envelope-aware)
    │   ├── translate.js           # AI Translation (text / detect / languages)
    │   ├── presence.js            # online status heartbeat + bulk lookup
    │   ├── push.js                # FCM token register / list / unregister
    │   ├── users.js               # global block list
    │   └── rtm.js                 # token issuance for Real-Time + Video
    ├── realtime/
    │   └── hyperbabelRealtime.js  # Real-Time client (vendor SDK aliased)
    ├── video/
    │   └── hyperbabelVideo.js     # Video client (vendor SDK aliased)
    └── pages/
        ├── login.js               # API key + user id entry
        ├── home.js                # room list + create
        ├── chat.js                # full ChatScreen UX (typing / reactions / reply / edit / delete / image / file / freeze / mute / members)
        ├── videoCall.js           # 1:1 video call surface
        ├── streams.js             # live stream discovery
        ├── streamHost.js          # host broadcasts as publisher
        ├── streamViewer.js        # viewer subscribes as audience
        ├── blocks.js              # global block list management
        └── settings.js            # API usage + push tokens + language detection
```

## Integrating into your own app

1. **HTTP layer.** Copy `src/api/client.js` and the service modules in
   `src/api/`. They cover the public surface used in this demo and are pure
   `fetch` — no framework dependencies.
2. **Real-Time push.** `src/realtime/hyperbabelRealtime.js` shows how to
   exchange a token via `POST /rtm/token` and subscribe to a room channel.
   Wrap the underlying SDK behind your own thin facade so the vendor name
   never leaks into your app code.
3. **Video.** `src/video/hyperbabelVideo.js` mirrors the same pattern for
   1:1 / group video calls. Tokens come from `POST /rtm/rtc/token`; the SDK
   handles the media streams.

## API Key Lifecycle

API keys created from the Console default to a **Live** environment. Treat
the value in `.env` as a sandbox secret — never embed a Live key in a binary
you publish to end users. For production deployments issue per-tenant keys
from your own server.

## License

MIT — see the project root `LICENSE`.

> **Disclaimer**: This code is provided for demonstration purposes only.
> Add proper error handling, telemetry, and authentication before shipping.
