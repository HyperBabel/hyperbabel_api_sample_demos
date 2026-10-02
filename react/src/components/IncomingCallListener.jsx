/**
 * HyperBabel React Demo — Incoming Call Listener
 *
 * A **non-rendering** global component that opens the app-wide HyperBabel
 * Real-Time connection for the signed-in user and keeps a
 * `subscribeToPrivate()` subscription on their private channel
 * (`user:{orgId}:{userId}`) alive while the app is open — on every page,
 * not just the chat hub.
 *
 * Call signals arrive on that channel with the event name `signal`; the kind
 * of signal is in the payload's `type` field:
 *
 *  data.type === 'CALL_INVITE'
 *    ├─ isInCall === true   → decline as busy (POST /video-call/reject with
 *    │                         reason 'busy'). The server-side busy gate
 *    │                         normally stops such invites; this only catches
 *    │                         two calls landing in the same instant.
 *    └─ isInCall === false  → setIncomingCall(...) → IncomingCallOverlay renders
 *
 *  Caller hangs up while it is still ringing:
 *    there is no cancel signal on the private channel. The server posts a
 *    `call_ended` event on the ROOM channel instead (`roomSignalChannel` in
 *    the invite), so this component watches that channel while the popup is
 *    up and dismisses it when the event for this session arrives.
 *
 * The connection is opened here when a user signs in and closed by
 * AuthContext.logout(). Pages must not call realtimeService.disconnect() on
 * unmount — that would stop incoming calls from ringing.
 *
 * This component is rendered once inside <CallProvider> in App.jsx.
 * It renders nothing — return null.
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import realtimeService from '../services/realtimeService';
import * as unitedChat from '../services/unitedChatService';

export default function IncomingCallListener() {
  const { user } = useAuth();
  const { isInCall, incomingCall, setIncomingCall } = useCall();
  const isInCallRef = useRef(isInCall); // ref so the callback always reads fresh state
  const channelServiceRef = useRef(null);

  // Keep ref in sync with state
  useEffect(() => { isInCallRef.current = isInCall; }, [isInCall]);

  const userId   = user?.user_id;
  const userName = user?.display_name;
  const userLang = user?.preferred_lang_cd;

  // ── Private channel: incoming call invitations ───────────────────────────
  useEffect(() => {
    if (!userId) return undefined; // not signed in — nothing to listen to

    let unsubscribe = null;
    let cancelled = false;
    let retryTimer = null;

    const connect = () => {
      realtimeService
        .init(userId, userName, userLang)
        .then((channelService) => {
          if (cancelled) return;
          channelServiceRef.current = channelService;
          unsubscribe = channelService.subscribeToPrivate(userId, ({ data }) => {
            if (data?.type !== 'CALL_INVITE') return;

            if (isInCallRef.current) {
              // Already in a call — decline as busy so the caller stops ringing.
              unitedChat
                .rejectVideoCall(data.roomId, userId, data.sessionId, 'busy')
                .catch(() => { /* the caller's ring timeout still ends it */ });
              return;
            }

            setIncomingCall({
              roomId:            data.roomId,
              // Every later call action (accept / reject / end / leave) needs it.
              sessionId:         data.sessionId,
              channelName:       data.channelName,
              // Room channel the server posts `call_ended` on (see below).
              roomSignalChannel: data.roomSignalChannel || null,
              callerId:          data.callerId,
              callerName:        data.callerName || data.callerId,
              callerAvatar:      data.callerPhotoUrl || null,
              callType:          data.callType || '1to1', // '1to1' | 'group'
              rtcToken:          data.rtcToken || null,
              uid:               data.uid ?? null,
            });
          });
        })
        .catch((err) => {
          console.warn('[IncomingCallListener] real-time connection unavailable, retrying:', err?.message);
          // Without this connection no call can ring — keep trying.
          if (!cancelled) retryTimer = setTimeout(connect, 15_000);
        });
    };
    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      if (typeof unsubscribe === 'function') unsubscribe();
      channelServiceRef.current = null;
      setIncomingCall(null); // signed out — drop any popup that was ringing
    };
  }, [userId, userName, userLang, setIncomingCall]);

  // ── Room channel: caller hung up before the callee answered ──────────────
  const ringingChannel = incomingCall?.roomSignalChannel;
  const ringingSession = incomingCall?.sessionId;
  useEffect(() => {
    const channelService = channelServiceRef.current;
    if (!channelService || !ringingChannel || !ringingSession) return undefined;

    // Call events are chat messages: event name 'message', payload
    // { type: 'message', data: <message> } where the message's
    // metadata.event is 'call_ended' and metadata.session_id names the call.
    return channelService.subscribeToRoom(ringingChannel, ({ message, type }) => {
      const meta = type === 'message' ? message?.data?.metadata : null;
      if (meta?.event === 'call_ended' && meta.session_id === ringingSession) {
        setIncomingCall(null);
      }
    });
  }, [ringingChannel, ringingSession, setIncomingCall]);

  return null; // purely side-effect — no UI
}
