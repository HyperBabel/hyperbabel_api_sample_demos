/**
 * HyperBabel React Demo — Call Context (Global State)
 *
 * Provides two pieces of shared state needed across the entire app:
 *
 *  1. isInCall (boolean) — whether the current user is currently inside a
 *     video call session. Set to true by VideoCallPage on mount, false on unmount.
 *     Used by IncomingCallListener to auto-busy-reject while already in a call.
 *
 *  2. incomingCall (object|null) — the pending invitation received from
 *     another user. Structure:
 *       { roomId, callerId, callerName, callerAvatar, callType }
 *     Non-null triggers the IncomingCallOverlay to render.
 *
 * Architecture diagram:
 *
 *   App.jsx
 *    └─ <CallProvider>              ← wraps entire app tree
 *         ├─ <IncomingCallListener> ← subscribeToPrivate() once (global)
 *         ├─ <IncomingCallOverlay>  ← popup, only renders when incomingCall != null
 *         └─ <Routes .../>
 *
 *   VideoCallPage.jsx
 *    └─ useEffect: mount   → setIsInCall(true)
 *                  unmount → setIsInCall(false)
 *
 * Developer Test Scenarios:
 *   [Browser Tab A] user_A login
 *   [Browser Tab B] user_B login
 *
 *   Scenario 1 — Accept:
 *     B calls A via 1:1 video call
 *     → A sees accept/reject popup ✅
 *     → A clicks Accept → VideoCallPage opens
 *
 *   Scenario 2 — Reject:
 *     B calls A
 *     → A clicks Reject → popup disappears ✅
 *
 *   Scenario 3 — Busy:
 *     A is already in a call with C when B calls A
 *     → A sees NO popup; B receives busy event automatically ✅
 */

import { createContext, useContext, useState } from 'react';

export const CallContext = createContext(null);

/**
 * Wrap your entire app with <CallProvider> to enable global call state.
 * Place it in App.jsx around <BrowserRouter> or inside it.
 */
export function CallProvider({ children }) {
  const [isInCall,     setIsInCall]     = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  // incomingCall shape: { roomId, callerId, callerName, callerAvatar, callType }

  return (
    <CallContext.Provider value={{ isInCall, setIsInCall, incomingCall, setIncomingCall }}>
      {children}
    </CallContext.Provider>
  );
}

/** Convenience hook — throws if used outside <CallProvider>. */
export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside <CallProvider>');
  return ctx;
}
