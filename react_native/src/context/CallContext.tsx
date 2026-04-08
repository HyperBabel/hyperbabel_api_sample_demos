/**
 * HyperBabel Demo — CallContext
 *
 * Global state manager for the incoming video call flow.
 * Prevents overlapping calls, triggers the IncomingCallOverlay,
 * and tracks whether the user is currently in a call (busy logic).
 *
 * Architecture (mirrors React demo's CallContext.jsx):
 *  - IncomingCallListener subscribes to the private real-time channel
 *    and dispatches CALL_INVITE events here.
 *  - IncomingCallOverlay reads incomingCall and renders the accept/reject UI.
 *  - VideoCallScreen reads/writes isInCall to guard against busy rejection.
 */

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────

export interface IncomingCallData {
  roomId:       string;
  sessionId:    string;
  callerId:     string;
  callerName:   string;
  callType:     '1to1' | 'group';
  channelName:  string;
  rtcToken?:    string;
  uid?:         number;
  appId?:       string;
}

interface CallContextValue {
  // Whether the user is currently in an active call (prevents overlap)
  isInCall:         boolean;
  setIsInCall:      (val: boolean) => void;

  // Pending incoming call invite, if any
  incomingCall:     IncomingCallData | null;
  setIncomingCall:  (call: IncomingCallData | null) => void;

  // Called from IncomingCallListener — handles busy guard automatically
  receiveCallInvite: (call: IncomingCallData, busyCallback: () => void) => void;

  clearIncomingCall: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────

const CallContext = createContext<CallContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [isInCall, setIsInCall]         = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const isInCallRef = useRef(false);

  // Keep ref in sync so event listeners can read the latest value without stale closure
  const handleSetIsInCall = useCallback((val: boolean) => {
    isInCallRef.current = val;
    setIsInCall(val);
  }, []);

  const autoRejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearIncomingCall = useCallback(() => {
    setIncomingCall(null);
    if (autoRejectTimerRef.current) {
      clearTimeout(autoRejectTimerRef.current);
      autoRejectTimerRef.current = null;
    }
  }, []);

  const receiveCallInvite = useCallback(
    (call: IncomingCallData, busyCallback: () => void) => {
      if (isInCallRef.current) {
        // User is already in a call — silently send CALL_BUSY
        busyCallback();
        return;
      }
      setIncomingCall(call);

      // 30-second auto-reject: if no action taken, reject silently
      if (autoRejectTimerRef.current) clearTimeout(autoRejectTimerRef.current);
      autoRejectTimerRef.current = setTimeout(() => {
        setIncomingCall(null);
        autoRejectTimerRef.current = null;
        // Caller will receive a timeout / no-answer state
      }, 30_000);
    },
    [],
  );

  return (
    <CallContext.Provider
      value={{
        isInCall,
        setIsInCall: handleSetIsInCall,
        incomingCall,
        setIncomingCall,
        receiveCallInvite,
        clearIncomingCall,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within <CallProvider>');
  return ctx;
}
