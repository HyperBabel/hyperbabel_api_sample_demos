/**
 * HyperBabel React Demo — Application Root
 *
 * Sets up React Router with all application routes and wraps the entire
 * app with CallProvider to enable the global incoming call flow.
 *
 * ──────────────────────────────────────────────────────────
 * Incoming Call Architecture: CallContext + IncomingCallOverlay
 * ──────────────────────────────────────────────────────────
 *
 * App.jsx
 *  └─ <CallProvider>               ← isInCall global state management
 *       ├─ <IncomingCallListener>  ← subscribeToPrivate() global listener
 *       ├─ <IncomingCallOverlay>   ← popup UI (conditionally rendered)
 *       └─ <Routes>
 *
 * VideoCallPage.jsx
 *  └─ useEffect: mount   → setIsInCall(true)
 *                unmount → setIsInCall(false)
 *
 * ──────────────────────────────────────────────────────────
 * Developer Test Scenarios (Incoming Call)
 * ──────────────────────────────────────────────────────────
 *
 * [Browser Tab A] user_A logged in
 * [Browser Tab B] user_B logged in
 *
 * Scenario 1 — Accept:
 *   B initiates a 1:1 video call to A
 *   → A sees the accept/reject popup ✅
 *   → A clicks Accept → VideoCallPage opens
 *
 * Scenario 2 — Reject:
 *   B calls A
 *   → A clicks Reject → popup dismissed ✅
 *
 * Scenario 3 — Busy:
 *   B calls A while A is already in a call with C
 *   → No popup shown to A; busy event sent to B automatically ✅
 *
 * ──────────────────────────────────────────────────────────
 * Route structure:
 *  /login               — Login page
 *  /signup              — Registration page
 *  /dashboard           — Sandbox Hub (main landing after login)
 *  /chat                — Unified Chat Hub (room list)
 *  /chat/:roomId        — Specific chat room
 *  /video-call/:roomId  — Video call (1:1 or group)
 *  /live-stream/host    — Live stream host mode
 *  /live-stream/viewer/:sessionId — Live stream viewer mode
 *  /settings            — Settings, webhooks, usage
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CallProvider } from './context/CallContext';
import IncomingCallListener from './components/IncomingCallListener';
import IncomingCallOverlay from './components/IncomingCallOverlay';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import DashboardPage from './pages/DashboardPage';
import ChatHubPage from './pages/ChatHubPage';
import VideoCallPage from './pages/VideoCallPage';
import LiveStreamPage from './pages/LiveStreamPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <CallProvider>
      <BrowserRouter>
        {/* ── Global incoming call listener — no UI, pure side-effect ── */}
        <IncomingCallListener />

        {/* ── Incoming call popup overlay — renders only when a call invite arrives ── */}
        <IncomingCallOverlay />

        <Routes>
          {/* ── Authentication ── */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />

          {/* ── Dashboard / Sandbox Hub ── */}
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* ── Unified Chat Hub ── */}
          <Route path="/chat" element={<ChatHubPage />} />
          <Route path="/chat/:roomId" element={<ChatHubPage />} />

          {/* ── Video Call (launched from within chat rooms) ── */}
          <Route path="/video-call/:roomId" element={<VideoCallPage />} />

          {/* ── Live Stream ── */}
          <Route path="/live-stream/host" element={<LiveStreamPage />} />
          <Route path="/live-stream/viewer/:sessionId" element={<LiveStreamPage />} />

          {/* ── Settings ── */}
          <Route path="/settings" element={<SettingsPage />} />

          {/* ── Default redirect ── */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </CallProvider>
  );
}
