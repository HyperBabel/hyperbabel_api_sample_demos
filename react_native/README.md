# HyperBabel Demo — React Native

A production-grade React Native sample application that demonstrates the full HyperBabel API suite on Android and iOS. Built with Expo SDK 55, the Expo Router v4 file-based navigation, and the React Native New Architecture.

## Key Implemented Features

### 1. Unified Chat Experience (`unitedChatService`)
- **Real-time Pipeline**: Integrated with `RealtimeContext` to subscribe to messages, typing indicators, and deleted message events.
- **Rich Messaging Ecosystem**: Media Upload (via `expo-image-picker` with Presign URL pipelines), Native-feel Emoji Reactions (`ReactionPicker`), and Nested Threaded Replies (`ThreadPanel`).
- **Room Moderation**: Sticky announcements (`PinBanner`) and Role-based moderation (Freeze Room, Ban/Unban, Promote/Demote via `MembersSheet`).
- **Auto-Translation**: Hook-based translation (`useTranslation`) handles in-memory batch caching to render global chats identically across languages.

### 2. Live Broadcasts & Streaming
- **Stream Discovery**: The `streams.tsx` map fetches live rooms dynamically.
- **Chat Overlay**: The `StreamChat` transparent UI handles real-time messages floating over the host's video feed.
- **Role Isolation**: Hosts publish their video/audio (`publisher`), while users join fully muted (`subscriber`). Auto-leave handles the loop when a host ends the broadcast.

### 3. Fully Connected Video Calls
- **In-Call Chat**: The `InCallChat` panel handles side-channel communication without leaving the video stream.
- **Rejoin & Auto-Reject**: Advanced lifecycle hooks offer a "Rejoin Call" banner if an active call exists, and a 30-second `autoRejectTimer` manages unanswered incoming pings.
- **Incoming Background Call**: `IncomingCallListener` detects incoming invites simultaneously across Android and iOS, ringing with `expo-av` and native device `Vibration` loops.

### 4. Push Notifications & Presence
- **Presence API**: The `usePresence` hook pulses a heartbeat every 30 seconds when the app is active, and automatically pauses when sent to the background (`AppState` listener).
- **Push Services**: `usePushNotifications` handles Firebase FCM tokens seamlessly, synchronizing tokens with HyperBabel's push APIs securely using `SecureStore`.

## 🚀 How to Build & Run

> **Note**: Because this project utilizes native SDKs extensively (Camera, Audio, Haptic Vibration, Firebase, etc.), **the standard Expo Go app will not work**. You must compile a **Development Build** directly onto your physical device.

1. Create a `.env` file in the `sample_demos/react_native/` directory and insert your HyperBabel API keys.
2. Add your phone ringtone file as `ringtone.mp3` inside the `assets/sounds/` directory.
3. Connect your physical device, then run the following commands to build the app:

```bash
# Install dependencies
npm install

# Build for Android device
npx expo run:android

# Build for iPhone (Requires Mac environment and Xcode)
npx expo run:ios
```

> 💡 **Multi-Platform Testing Tip**: Log into the React-based web demo app using a specific ID (e.g., `TestWeb`), and log into the React Native mobile app using a different ID (e.g., `TestPhone`). Place the web browser and your phone side-by-side to witness real-time multilingual chat, threaded reactions, video calls, live broadcasting, and in-call chat synchronizing perfectly across platforms!

## Project Structure

```
sample_demos/react_native/
├── app/                        # Expo Router screens (file-based routing)
│   ├── _layout.tsx             # Root layout (providers + overlays)
│   ├── index.tsx               # Auth redirect
│   ├── (auth)/                 # Login + Signup
│   ├── (main)/                 # Authenticated tabs
│   │   ├── dashboard.tsx       # Sandbox Hub
│   │   ├── chat/               # Chat Hub + Room Detail
│   │   ├── streams.tsx         # Live stream discovery
│   │   └── settings.tsx        # Settings + API usage
│   ├── video-call/             # Video call room
│   └── live-stream/            # Host + Viewer screens
│
├── src/
│   ├── components/
│   │   ├── ui/                 # Design system (Button, Card, Avatar, ...)
│   │   ├── IncomingCallListener.tsx   # Real-time CALL_INVITE subscriber
│   │   └── IncomingCallOverlay.tsx    # Incoming call UI (ringtone + vibration)
│   │
│   ├── context/
│   │   ├── AuthContext.tsx     # userId-based auth + SecureStore
│   │   ├── CallContext.tsx     # Global call state + busy guard
│   │   └── RealtimeContext.tsx # Singleton real-time connection
│   │
│   ├── services/               # TypeScript API service layer (1:1 with React demo)
│   │   ├── api.ts              # Base HTTP client
│   │   ├── unitedChatService.ts
│   │   ├── realtimeService.ts
│   │   ├── translateService.ts
│   │   ├── storageService.ts
│   │   ├── presenceService.ts
│   │   ├── pushService.ts
│   │   ├── streamService.ts
│   │   └── authService.ts
│   │
│   ├── theme/                  # Design tokens (colors, typography, spacing)
│   └── utils/
│       └── ringtone.ts         # expo-av + Vibration ringtone controller
│
├── assets/
│   └── sounds/
│       └── ringtone.mp3        # Replace with your incoming call audio file
│
├── .env.example                # Environment variable template
├── app.json                    # Expo config (bundle IDs, permissions)
└── eas.json                    # EAS Build profiles
```

## Environment Variables

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_HB_API_URL` | API base URL (default: `https://api.hyperbabel.com/api/v1`) |
| `EXPO_PUBLIC_HB_API_KEY` | Your HyperBabel API key (visible in Console) |

All variables must be prefixed with `EXPO_PUBLIC_` to be accessible in the React Native bundle.

## Ringtone

Place your incoming call ringtone audio file at:

```
assets/sounds/ringtone.mp3
```

The ringtone is played via `expo-av` with looping enabled and **plays even when the iOS device is on silent** (`playsInSilentModeIOS: true`). Device vibration is triggered simultaneously via React Native's `Vibration` API.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

> **Disclaimer**: This code is provided for demonstration purposes only. It is not intended for production environments without proper security and performance reviews.
