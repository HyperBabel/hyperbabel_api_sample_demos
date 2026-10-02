/**
 * HyperBabel Demo — Incoming Call Listener
 *
 * Background subscriber that listens on the user's private real-time channel
 * for call invites and dispatches them to CallContext.
 *
 * Renders nothing — purely a side-effect component.
 * Mounted in app/_layout.tsx so it is always active regardless of screen.
 *
 * Event flow:
 *  1. HyperBabel backend publishes to user:{orgId}:{userId} with the event
 *     NAME 'signal' and a payload whose `type` says what it is — an invite is
 *     `{ type: 'CALL_INVITE', sessionId, roomId, callerId, callerName, … }`.
 *     The event name is NOT 'CALL_INVITE'; always match on `data.type`.
 *  2. This component receives the event and calls receiveCallInvite()
 *  3. If the user is busy → drop silently (server-side busy gate already filtered)
 *  4. If available → sets incomingCall → IncomingCallOverlay renders
 */

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCall, type IncomingCallData } from '@/context/CallContext';
import { useRealtime } from '@/context/RealtimeContext';

export function IncomingCallListener() {
  const { user }                = useAuth();
  const { channelService }      = useRealtime();
  const { receiveCallInvite }   = useCall();

  useEffect(() => {
    if (!channelService || !user) return;

    const unsub = channelService.subscribeToPrivate(user.userId, ({ event, data }) => {
      const payload = data as {
        type?:         string;
        roomId?:       string;
        room_id?:      string;
        sessionId?:    string;
        session_id?:   string;
        callerId?:     string;
        caller_id?:    string;
        callerName?:   string;
        caller_name?:  string;
        callType?:     '1to1' | 'group';
        call_type?:    '1to1' | 'group';
        channelName?:  string;
        channel_name?: string;
        rtcToken?:     string;
        rtc_token?:    string;
        uid?:          number;
        appId?:        string;
        app_id?:       string;
        roomSignalChannel?: string;
      };

      // Call signals share one event name; the payload `type` tells them apart
      // (other values, e.g. 'CALL_BUSY', are not invites).
      if (event !== 'signal' || payload?.type !== 'CALL_INVITE') return;

      const callInfo: IncomingCallData = {
        roomId:      payload.roomId      ?? payload.room_id      ?? '',
        sessionId:   payload.sessionId   ?? payload.session_id   ?? '',
        callerId:    payload.callerId    ?? payload.caller_id    ?? '',
        callerName:  payload.callerName  ?? payload.caller_name  ?? payload.callerId ?? payload.caller_id ?? '',
        callType:    payload.callType    ?? payload.call_type    ?? '1to1',
        channelName: payload.channelName ?? payload.channel_name ?? '',
        rtcToken:    payload.rtcToken    ?? payload.rtc_token,
        uid:         payload.uid,
        appId:       payload.appId       ?? payload.app_id,
        // The room's real-time channel. Use this field only — the payload also
        // carries an older alias of it that is deprecated.
        roomSignalChannel: payload.roomSignalChannel,
      };
      // Accept / reject need both — an invite without them cannot be answered.
      if (!callInfo.roomId || !callInfo.sessionId) return;

      receiveCallInvite(callInfo, () => {
        // User is busy — drop the invite. The server-side busy gate
        // (POST /unitedchat/rooms/:roomId/video-call) prevents the inviter
        // from reaching us in the first place; this branch only catches
        // race conditions where two calls land in the same instant.
      });
    });

    return () => unsub();
  }, [channelService, user, receiveCallInvite]);

  // This component renders nothing
  return null;
}
