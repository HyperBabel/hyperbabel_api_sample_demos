# HyperBabel Demo Applications

Welcome to the HyperBabel Demo Applications! This repository contains fully functional, production-ready sample applications built on top of the **HyperBabel API Platform**. The codebase is designed to serve as a comprehensive reference for integrating HyperBabel's real-time capabilities into your own products.

There are currently two architectures provided:
1. **[React (Web API Demo)](./react/README.md)**
2. **[React Native (Mobile API Demo)](./react_native/README.md)**

---

## Supported Features

Both demo applications showcase how to successfully integrate and bind our APIs to standard front-end components. Standard features implemented across these demos include:

* **Real-time Chat (1:1 & Group)**: Room creation, joining, and real-time message broadcasting using the United Chat API.
* **Open Chat Rooms**: Public spaces where users can participate freely.
* **Auto-Translation**: Seamless, cross-lingual communication where messages are instantly translated into the receiver's primary language.
* **Rich Messaging Features**: Full-text message searching, read receipts, typing indicators, pinned messages, reactions, and thread replies.
* **1:1 and Group Video Calls**: Robust signaling for starting, accepting, rejecting, and ending video calls. 
* **Live Streaming**: Broadcasting sessions with distinct Host and Viewer roles, accompanied by live chat.
* **System Utilities**: Presence management (online/offline/away), secure file uploads in 3 steps (presigned URLs), push notification token registration, and webhook consumption endpoints.

---

## How to Test the Demos

You can clone this directory and run the examples instantly using your own HyperBabel Workspace API Keys.

### Step 1: Obtain your API Key
1. Navigate to the **HyperBabel Console Dashboard**.
2. Sign in or register for a Workspace.
3. Generate a new API Key from your **Developer Settings**. 

### Step 2: Configure the Demo
Each demo uses environment variables to authenticate with the API platform.
1. Enter the specific demo directory you wish to run:
   ```bash
   cd react
   # OR
   cd react_native
   ```
2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` and paste your API Key:
   ```env
   VITE_HB_API_KEY=your_copied_api_key_here
   # Or for React Native:
   EXPO_PUBLIC_HB_API_KEY=your_copied_api_key_here
   ```

### Step 3: Origin / CORS Security (Crucial for Web)
HyperBabel enforces Zero Trust security models. For Web applications (React), requests will be blocked (returning a `403 Forbidden` response) unless the origin is allowed.
* In your **Console Dashboard**, navigate to your API Key settings.
* Whitelist the local development URL (e.g., `http://localhost:5173` or `http://localhost:8081`). 

### Step 4: Run the Application!

For the React application:
```bash
npm install
npm run dev
```

For the React Native application:
```bash
npm install
npx expo start
```
You can now create users, join chat rooms, trigger video calls between browser tabs or physical mobile devices, and monitor your usage hitting the API platform!

---

## Architecture & Code Quality
Both the `react/` and `react_native/` demos have been thoroughly audited and hardened to prevent edge cases common in real-time engineering:
* **Event Guarding**: Real-time event listeners strictly validate payloads, preventing malformed UI state (e.g., dismissing heartbeat/typing events that masquerade as messages).
* **System Messages**: Refined UI components elegantly intercept backend-generated system alerts, rendering them centrally instead of drawing blank user message bubbles.
* **Resource Optimization**: The UI lists are equipped with robust fallback logic and perform automatic cleanup to securely close real-time connections on unmount. 
