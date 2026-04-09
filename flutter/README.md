# HyperBabel Flutter Demo Sample

A comprehensive cross-platform Flutter application that showcases all features of the **HyperBabel API Platform**. Use this project as a reference implementation for integrating HyperBabel real-time communication, video, and AI translation features into your iOS and Android applications.

## Features

| Feature | APIs Used |
|---|---|
| **1:1 Chat** | United Chat — Rooms, Messages, Batch-Translate |
| **Group Chat** | United Chat — Rooms, Messages, Members |
| **Open Chat** | United Chat — Rooms, Join, Leave |
| **1:1 Video Call** | United Chat — Video Call (start, accept, reject, end) via HyperBabel Video |
| **Live Stream** | Stream — Broadcast & Spectate |
| **Auto-Translation** | Translation — Text, Batch, Detect, Languages |
| **Real-time Engine** | HyperBabel Real-Time — Signaling and live presence |

## Prerequisites

- **Flutter SDK** >= 3.3.0
- **HyperBabel API Key** — Get one from the [HyperBabel Console](https://console.hyperbabel.com)
- **iOS Simulator / Android Emulator** — For local testing.

## Quick Start

```bash
# 1. Navigate to the flutter demo directory
cd sample_demos/flutter

# 2. Fetch the Flutter dependencies
flutter pub get

# 3. Start the application
# (Ensure your Emulator/Simulator is running, or a physical device is connected)
flutter run
```

When the app launches, enter your **API Key** directly in the setup screen to connect to the HyperBabel backend.

## Architecture & Project Structure

This project follows a clean architecture pattern utilizing `Riverpod` for state management, `GoRouter` for deep-linking and navigation, and a bespoke "Glassmorphism" UI rendering engine.

```
flutter/
├── lib/
│   ├── core/
│   │   ├── network/                # HTTP API integration logic (Dio)
│   │   │   ├── api_client.dart     # Base injection layer and interceptors
│   │   │   └── united_chat_repository.dart 
│   │   ├── realtime/               # HyperBabel Real-Time signaling wrapper
│   │   ├── video/                  # HyperBabel Video signaling wrapper
│   │   └── theme/                  # Global color mappings (Deep Dark & Accents)
│   │
│   ├── features/                   # Domain-driven feature sets
│   │   ├── auth/                   # API Key login injection
│   │   ├── chat/                   # Threaded messaging & translation views
│   │   ├── video_call/             # Interactive video components
│   │   ├── live_stream/            # Broadcaster interface
│   │   └── home/                   # Central Hub & Dashboard
│   │
│   ├── shared/
│   │   └── widgets/                # Reusable glassmorphism elements
│   │
│   └── main.dart                   # Entry point and routing configuration
│
├── assets/
│   └── images/                     # App icons (hyperbabel.png)
│
├── pubspec.yaml                    # Dart package dependencies
└── README.md                       # This file
```

## Integrating into your own app

### 1. HTTP Communication Layer (`api_client.dart`)
We use `dio` to inject the HyperBabel `Authorization` bearer token across all HTTP requests. See `lib/core/network/api_client.dart` for the setup.

### 2. State Management & Real-time Integration
The app relies heavily on WebSockets for Presence and Typing indicators. Look specifically at `hyperbabel_realtime_client.dart` for the implementation pattern of subscribing to dedicated Room Channels upon navigating to `ChatScreen`.

### 3. Avoiding Layout Overflows
Unlike React Native, Flutter implements strict bounding boxes for Text elements. To avoid **Pixel Overflow Errors** when fetching translated text that may be unexpectedly long, developers should follow the pattern in `chat_screen.dart`:
- Utilize `BoxConstraints(maxWidth: ... )` for bubble width limits.
- Set `softWrap: true`.

## Customization

- **Styling**: `lib/core/theme/app_theme.dart` governs the core color profiles. The app is set to an immersive Dark Mode layout.
- **Glass Effects**: `lib/shared/widgets/glass_container.dart` can be customized dynamically by modifying the `blurStrength` property. 

## License

This project is licensed under the MIT License.

> **Disclaimer**: This code is provided for demonstration purposes only. Thoroughly sanitize user states and handle connection exceptions before pushing to production environments.
