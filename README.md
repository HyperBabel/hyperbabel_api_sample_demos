# HyperBabel Demo Applications

Production-ready sample applications for the **HyperBabel API Platform**, in
six flavours so you can copy-paste from whichever stack you already use.

| Directory                                | Stack                                                      |
| ---------------------------------------- | ---------------------------------------------------------- |
| [`react/`](./react/)                 | React 19 + Vite + JavaScript + Firebase Web SDK                 |
| [`react_native/`](./react_native/)   | Expo SDK 56 + React Native 0.85 + TypeScript + `@react-native-firebase` v24 |
| [`flutter/`](./flutter/)             | Flutter 3 + Riverpod + GoRouter + `firebase_auth`               |
| [`javascript/`](./javascript/)       | Vanilla JavaScript + Vite + Firebase Web SDK                    |
| [`kotlin/`](./kotlin/)               | Android + Jetpack Compose + Retrofit + Firebase BOM             |
| [`swift/`](./swift/)                 | iOS + SwiftUI + URLSession + Firebase iOS SDK                   |

Every demo targets the same HyperBabel API endpoints. The HTTP path,
auth header, request body, and response shape are identical across the
six — pick the demo whose UI layer matches your project.

### Authentication model — Customer Auth (Firebase Direct Exchange)

All six demos use **Customer Auth pattern B1 — Firebase Direct Exchange**.
The end user signs in with Firebase on device (or in the browser); the
demo posts the resulting Firebase ID token to HyperBabel's
`POST /api/v1/customer/auth/firebase-exchange` endpoint, which returns a
short-lived **customer JWT** (1 h access, 30 d refresh) scoped to that
end user. Every subsequent API call attaches that JWT as
`Authorization: Bearer <customer_jwt>`.

**Your organization API key (`hb_live_…` / `hb_test_…`) never ships in
the binary or browser bundle.** Each demo's HTTP client refuses to start
if it ever sees one. See the [Customer Auth docs](https://hyperbabel.com/docs#customer-auth)
for the full architecture and threat model; the per-org Firebase
project allow-list is configured in the [HyperBabel Console](https://console.hyperbabel.com)
under **Customer Auth**.

---

## Supported Features

The demos cover the full HyperBabel API surface a sandbox key can reach:

- **Real-time chat** — 1:1, group, and open rooms via the United Chat API,
  with live message / typing / read-receipt push over a single channel.
- **Auto-translation** — incoming messages are translated to the viewer's
  preferred language using the AI Translation API.
- **Rich messaging** — reply quotes, edit / delete, emoji reactions,
  message search, freeze toggle, per-room mute, ban / sub-admin / promote
  moderation.
- **Image & file uploads** — 3-step presigned-URL flow against the
  Storage API.
- **1:1 + group video calls** — start, accept, reject, end, leave; an
  in-app overlay rings on inbound CALL_INVITE events.
- **Live streaming** — host publishes their camera / mic, viewers join
  as audience-only with a separate viewer token.
- **Presence + push** — heartbeat to mark "online", FCM token
  registration so background pushes light up the right device.
- **Settings** — usage stats, language detection playground, blocked-user
  list, push-token inspector.

Webhook CRUD, billing, and other tenant-admin endpoints are intentionally
**not** exposed by the demos — those live in the HyperBabel Console
because they require a logged-in session JWT.

---

## Video Resolution & Billing Tier

HyperBabel meters video and live streaming by **resolution tier**, and the
tier is decided by the total resolution each participant **receives** — not
by what a single camera sends. In a group call every participant receives
(N − 1) remote streams, so the tier climbs with the number of people even
when each camera keeps the same resolution.

The HD tier tops out at **921,600 pixels (1280 × 720)** per participant.
Every demo ships a single `videoQuality` module that keeps publishing inside
that budget and derives the tier it declares from the same numbers:

| Remote participants | Published | Each participant receives | Tier |
|---|---|---|---|
| 0 (live-stream host) | 1280 × 720 | 921,600 | HD |
| 1 (1:1 call) | 1280 × 720 | 921,600 | HD |
| 2 (3-way call) | 640 × 480 | 2 × 307,200 = 614,400 | HD |
| 3 (4-way call) | 640 × 480 | 3 × 307,200 = 921,600 | HD |

A fifth publisher would push the sum to 1,228,800 and move the whole call
into the next, more expensive tier — which is why group calls are capped at
four participants.

### Two sums get quoted for a group call — keep them straight

| | Formula | 4-way call | Is the tier based on it? |
|---|---|---|---|
| What **one participant receives** | (N − 1) × preset | 3 × 307,200 = **921,600** | **Yes** |
| What the **whole call publishes** | N × preset | 4 × 307,200 = 1,228,800 | No |

The presets hold the *received* sum at or under the ceiling for every
supported call size — the same rule the HyperBabel Console applies in its own
video surfaces.

If your own policy is the stricter *"nothing the call publishes may add up to
more than HD"*, swap the ladder for this one. It is a one-constant change in
each `videoQuality` module, and it costs 1:1 calls their 720p:

| Publishers | Preset | Total published |
|---|---|---|
| 1 | 1280 × 720 | 921,600 |
| 2 | 848 × 480 | 814,080 |
| 3 | 640 × 480 | 921,600 |
| 4 | 640 × 360 | 921,600 |

### Leaving and rejoining

The roster is re-evaluated on **every** join and **every** leave, in every
demo. A four-way call that drops to two participants moves back up to
1280 × 720, and a participant who rejoins pulls everyone back down to
640 × 480 *before* their first frame is published. Nothing is pinned to the
size the call started at, so a call cannot drift above the ceiling by people
coming and going.

Two details that make that hold:

- Membership is counted from **channel presence**, not from who is currently
  publishing video. A participant sitting in the call with the camera off can
  switch it on at any moment.
- The preset is applied **before** the local track is published, so a late
  joiner never emits even one oversized frame.

> **Setting this explicitly matters most on mobile.** The RTC SDK's own
> default is 960 × 540, so a three-way call left at the default already
> sends every participant 1,036,800 pixels — above the HD ceiling.

### Declaring the tier

Every session-creation call in these demos sends a `quality` field:

```jsonc
// POST /api/v1/unitedchat/rooms/:roomId/video-call
// POST /api/v1/video/sessions
// POST /api/v1/stream/sessions
{ "quality": "hd" }   // "hd" (default) | "fhd" | "2k" | "2k_plus"
```

Media flows directly between your application and HyperBabel's
infrastructure, so the platform cannot observe the resolution you actually
transmit — **the declared value is what your invoice is calculated from.**
Declaring it accurately is a contractual obligation (Terms of Service §5.1),
and a declaration that understates measured usage is corrected afterwards
with an adjustment charge (§5.2).

### Always send `publish_resolution` with it

Because the platform cannot observe your media, `quality` alone gives it no
way to tell a wrong declaration from a right one — and the wrong ones are
usually honest mistakes. Every demo therefore sends a second field on the same
call, and **your app should too**:

```jsonc
{
  "quality": "hd",
  "publish_resolution": { "width": 640, "height": 480 }
}
```

The API accepts a request without it. Leaving it out is how the most common
billing surprise happens.

| | |
|---|---|
| **What to send** | The resolution this session will actually publish **at this participant count** — not the camera maximum, not a constant. Every demo builds it from the same preset the encoder uses, so the declared number and the emitted pixels cannot drift apart. |
| **What happens** | HyperBabel multiplies it by the streams one participant receives — (N − 1) for a call, 1 for a broadcast — and compares the total with `quality`. A higher tier puts a `quality_warning` string in the creation response. |
| **What does not happen** | Your bill does not change. Billing follows `quality`, always. The session is created either way; nothing is blocked, and a malformed value is ignored rather than rejected. |

**The mistake this catches is a unit mismatch, not dishonesty.** 720p is
genuinely HD in a 1:1 call and genuinely *above* HD in a four-way one, because
the tier is computed on the total each participant receives. Declaring `"hd"`
while publishing 720p to three other people is an honest answer to the wrong
question, and without this field nothing tells you so.

**Read `quality_warning` and act on it.** Log it at minimum. When it appears,
either lower the publishing resolution or declare the tier it names — your
invoice is calculated from `quality`, and the difference is recoverable under
§5.2.

### If you raise the resolution

Change the preset **and** the declared tier together, in the one file that
owns both:

| Demo | File |
|---|---|
| `javascript` | `src/video/videoQuality.js` |
| `react` | `src/services/videoQuality.js` |
| `react_native` | `src/services/videoQuality.ts` |
| `flutter` | `lib/core/video/video_quality.dart` |
| `kotlin` | `app/src/main/kotlin/com/hyperbabel/demo/video/VideoQuality.kt` |
| `swift` | `HyperBabelDemo/Video/VideoQuality.swift` |

Publishing 1080p in a four-way call is a perfectly reasonable product
decision — just declare `"2k"` for it, and your bill will match what you
used. The failure mode this module exists to prevent is the silent one:
raising the resolution and leaving the declaration at its `"hd"` default.

Two more rules the modules follow, worth keeping if you adapt them:

- **Count everyone in the channel, not just who has a camera on.** A muted
  camera can be switched back on at any moment. Over-counting lowers the
  resolution, which is safe; under-counting is what pushes a call above the
  tier it declared.
- **Never swallow a failed resolution change.** If the downshift does not
  land, the call keeps publishing large and the whole session silently
  lands in a higher tier. Every demo logs a warning instead.

---

## How to Test the Demos

You can clone this directory and run any of the six instantly. There is
no API key to copy into env files — every demo signs in through your
Firebase project and exchanges the ID token for a short-lived customer
JWT at runtime.

### Step 1 — Set up your Firebase project

1. Create a Firebase project at <https://console.firebase.google.com>
   (free tier is enough).
2. **Authentication → Sign-in method** → enable **Email/Password**
   (and **Anonymous** if you want the kiosk-mode button on the login
   screen).
3. For **web** demos (`react`, `javascript`): copy the **Web SDK config**
   from Project Settings → Your apps → Web. You need `apiKey`,
   `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`,
   `appId`.
4. For **mobile** demos (`react_native`, `flutter`, `kotlin`, `swift`):
   download the native config files (`google-services.json` for
   Android, `GoogleService-Info.plist` for iOS) from Project Settings
   → Your apps.

### Step 2 — Allow-list your Firebase project in HyperBabel

1. Open the HyperBabel Console at <https://console.hyperbabel.com>.
2. Sign in or register an organization.
3. Go to **Customer Auth → Add Firebase project**.
4. Paste your Firebase project ID (e.g. `your-app-prod`) and a Firebase
   ID token to prove ownership (the wizard shows two ways to generate
   one).
5. Click *Verify and add*. This single step tells HyperBabel "trust ID
   tokens from this Firebase project."

This is the only step that touches the Console — there is no API key to
generate, copy, or rotate.

### Step 3 — Configure the demo

Each demo reads its Firebase config through the native mechanism for
its platform:

| Demo           | Where Firebase config goes                                                                |
| -------------- | ----------------------------------------------------------------------------------------- |
| `react`        | `.env.local` ← `cp .env.example .env.local`, then fill the `VITE_FIREBASE_*` block        |
| `javascript`   | `.env.local` ← `cp .env.example .env.local`, then fill the `VITE_FIREBASE_*` block        |
| `react_native` | Drop `google-services.json` + `GoogleService-Info.plist` into `react_native/firebase/`    |
| `flutter`      | Drop `google-services.json` + `GoogleService-Info.plist` into `flutter/firebase/`         |
| `kotlin`       | Drop `google-services.json` into `kotlin/firebase/` — Gradle copies it to `app/` on build |
| `swift`        | Drop `GoogleService-Info.plist` into `swift/firebase/`, then drag it into Xcode           |

Each demo's `firebase/README.md` documents the platform-specific
integration steps.

By default each demo targets `https://api.hyperbabel.com/api/v1`. To
override (e.g. for a private HyperBabel deployment), set the matching
env var in the same config file — `VITE_HB_API_URL` (web),
`EXPO_PUBLIC_HB_API_URL` (RN), `HB_API_URL` (Flutter / Kotlin
`local.properties`) — or override at runtime in code (Swift). Each
language README has the exact key name.

### Step 4 — Run

```bash
# react           (web)
cd react && npm install && npm run dev

# javascript      (web)
cd javascript && npm install && npm run dev

# react_native    (Android / iOS) — see react_native/README.md for EAS build alternative
cd react_native && npm install && npx expo run:ios   # or run:android

# flutter         (Android / iOS)
cd flutter && flutter pub get && flutter run

# kotlin          (Android)
cd kotlin && cp local.properties.example local.properties && ./gradlew :app:installDebug

# swift           (iOS) — see swift/README.md for the Xcode App project setup
cd swift && open Package.swift
```

You can mix and match: open the `react` demo in your browser signed in
as one user, run `react_native` on your phone signed in as another, and
watch real-time chat / video call / live stream sync side-by-side.

### Note on origins

HyperBabel APIs enforce **Strict Origin Validation** for organization
API keys, but that validation does **not** apply to customer JWTs minted
via Firebase Direct Exchange (the bearer is the per-end-user JWT, not
your org key). Web demos therefore run from any authorized Firebase
domain — `localhost` is allow-listed by Firebase by default, so no
Console-side origin configuration is required for the demos to work.

---

## Architecture & Code Quality

All six demos have been audited end-to-end against the HyperBabel API
endpoint manifest. Every API call is verified to:

- attach the short-lived customer JWT as `Authorization: Bearer <customer_jwt>`,
- refuse to start if an `hb_live_…` / `hb_test_…` organization key is
  ever wired into the HTTP client (defensive guard at module init),
- proactively refresh the access token before expiry and recover from
  401 by calling `POST /customer/refresh`,
- target an existing endpoint with the right HTTP verb and body shape,
- decode the wire response (including `{ message, data: {…} }` envelopes
  that the Storage API returns),
- correctly disambiguate the wrapped `{ type: 'message' | 'typing' | … }`
  envelope that real-time broadcasts ride on top of.

`ChatScreen` UX (typing indicator, reactions, reply quote, edit / delete,
image / file picker, freeze, mute, members modal, locale-aware time) is
implemented to parity across all six demos.
