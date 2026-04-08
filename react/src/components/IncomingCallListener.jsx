/**
 * HyperBabel React Demo — Incoming Call Listener
 *
 * A **non-rendering** global component that keeps a `subscribeToPrivate()`
 * HyperBabel Realtime subscription alive for the logged-in user while the app is open.
 *
 * It handles the incoming call flow:
 *
 *  Received event type: CALL_INVITE
 *    ├─ isInCall === true   → busyRejectVideoCall() — no popup shown
 *    └─ isInCall === false  → setIncomingCall(event) → IncomingCallOverlay renders
 *
 *  Received event type: CALL_ENDED (mid-ring)
 *    → setIncomingCall(null) — dismiss any showing popup (caller hung up)
 *
 * This component is rendered once inside <CallProvider> in App.jsx.
 * It renders nothing — return null.
 */

import { useEffect, useRef } from 'react';
import { useCall } from '../context/CallContext';
import realtimeService from '../services/realtimeService';
import * as unitedChat from '../services/unitedChatService';

export default function IncomingCallListener() {
  const { isInCall, setIncomingCall } = useCall();
  const isInCallRef = useRef(isInCall); // ref so the callback always reads fresh state

  // Keep ref in sync with state
  useEffect(() => { isInCallRef.current = isInCall; }, [isInCall]);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('hb_user') || '{}');
    if (!user.user_id) return; // not logged in yet — skip

    let unsubscribe;

    const start = async () => {
      try {
        unsubscribe = await realtimeService.subscribeToPrivate(user.user_id, (event) => {
          // ── Incoming call invitation ─────────────────────────────────────
          if (event.type === 'CALL_INVITE' || event.type === 'video_call.started') {
            if (isInCallRef.current) {
              // Already in a call → send busy rejection silently
              unitedChat.busyRejectVideoCall(
                event.room_id || event.roomId,
                user.user_id
              ).catch(() => {}); // fire-and-forget; non-critical
            } else {
              setIncomingCall({
                roomId:       event.room_id      || event.roomId,
                callerId:     event.caller_id    || event.callerId,
                callerName:   event.caller_name  || event.callerName  || event.caller_id,
                callerAvatar: event.caller_avatar || null,
                callType:     event.call_type    || event.callType    || '1to1',
                // Session fields required to join the video call (passed from IncomingCallListener → VideoCallPage)
                channelName:  event.channelName  || null,
                sessionId:    event.sessionId    || null,
                rtcToken:     event.rtcToken     || null,
                uid:          event.uid          || null,
              });
            }
          }

          // ── Caller hung up before callee answered ────────────────────────
          if (event.type === 'CALL_CANCELLED' || event.type === 'call.ended') {
            setIncomingCall(null);
          }
        });
      } catch (err) {
        console.warn('[IncomingCallListener] subscribeToPrivate failed:', err.message);
      }
    };

    start();

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []); // mount once; isInCall read via ref

  return null; // purely side-effect — no UI
}
