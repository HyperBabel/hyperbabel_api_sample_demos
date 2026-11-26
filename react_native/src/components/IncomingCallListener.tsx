/**
 * HyperBabel Demo — Incoming Call Listener
 *
 * Background subscriber that listens on the user's private real-time channel
 * for call invites and dispatches them to CallContext. It works while the
 * app is running in the foreground — ringing a closed or backgrounded app
 * needs push (VoIP / CallKit on iOS, a high-priority FCM message on
 * Android), which this demo does not implement.
 *
 * Renders nothing — purely a side-effect component.
 * Mounted in app/_layout.tsx so it is always active regardless of screen.
 *
 * Event flow:
 *  1. HyperBabel backend publishes to user:{orgId}:{userId} with the event
 *     NAME 'signal' and a payload whose `type` says what it is — an invite is
 *     `{ type: 'CALL_INVITE', sessionId, roomId, callerId, callerName, … }`.
 *     The event name is NOT 'CALL_INVITE'; always match on `data.type`.
 *     (The same channel also carries `CALL_BUSY` — sent to a CALLER for
 *     each group-call target skipped because they were already in a call.)
 *  2. This component receives the event and calls receiveCallInvite()
 *  3. If the user is already in a call → decline the invite as busy
 *  4. If available → sets incomingCall → IncomingCallOverlay renders
 */

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCall, type IncomingCallData } from '@/context/CallContext';
import { useRealtime } from '@/context/RealtimeContext';
import * as unitedChat from '@/services/unitedChatService';

export function IncomingCallListener() {
  const { user }                = useAuth();
  const { channelService }      = useRealtime();
  const { receiveCallInvite }   = useCall();

  useEffect(() => {
    if (!channelService || !user) return;

    const unsub = channelService.subscribeToPrivate(user.userId, ({ event, data }) => {
      // The CALL_INVITE payload, as the server sends it.
      const payload = data as {
        type?:              string;
        roomId?:            string;
        sessionId?:         string;
        callerId?:          string;
        callerName?:        string;
        callType?:          '1to1' | 'group';
        channelName?:       string;
        rtcToken?:          string;
        uid?:               number;
        app_id?:            string;
        roomSignalChannel?: string;
      };

      // Call signals share one event name; the payload `type` tells them apart
      // (other values, e.g. 'CALL_BUSY', are not invites).
      if (event !== 'signal' || payload?.type !== 'CALL_INVITE') return;

      const callInfo: IncomingCallData = {
        roomId:      payload.roomId      ?? '',
        sessionId:   payload.sessionId   ?? '',
        callerId:    payload.callerId    ?? '',
        callerName:  payload.callerName  || payload.callerId || '',
        callType:    payload.callType    ?? '1to1',
        channelName: payload.channelName ?? '',
        rtcToken:    payload.rtcToken,
        uid:         payload.uid,
        appId:       payload.app_id,
        // The room's real-time channel — call events for this invite
        // (e.g. the caller hanging up) arrive there.
        roomSignalChannel: payload.roomSignalChannel,
      };
      // Accept / reject need both — an invite without them cannot be answered.
      if (!callInfo.roomId || !callInfo.sessionId) return;

      receiveCallInvite(callInfo, () => {
        // Already in a call. The server's busy gate normally keeps such an
        // invite from being sent at all (a user active in a call is skipped);
        // this catches the race where two calls land at the same moment.
        // Decline as busy so the caller is not left ringing.
        unitedChat
          .rejectVideoCall(callInfo.roomId, user.userId, callInfo.sessionId, 'busy')
          .catch(() => {});
      });
    });

    return () => unsub();
  }, [channelService, user, receiveCallInvite]);

  // This component renders nothing
  return null;
}
