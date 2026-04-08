/**
 * HyperBabel Demo — Incoming Call Listener
 *
 * Background subscriber that listens on the user's private real-time channel
 * for CALL_INVITE events and dispatches them to CallContext.
 *
 * Renders nothing — purely a side-effect component.
 * Mounted in app/_layout.tsx so it is always active regardless of screen.
 *
 * Event flow:
 *  1. HyperBabel backend publishes CALL_INVITE to hb:{orgId}:private:{userId}
 *  2. This component receives the event and calls receiveCallInvite()
 *  3. If the user is busy → calls busyRejectVideoCall() silently
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
      if (event !== 'CALL_INVITE') return;

      const payload = data as {
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
      };

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
      };

      receiveCallInvite(callInfo, () => {
        // User is busy — send automatic busy response
        unitedChat.busyRejectVideoCall(callInfo.roomId, user.userId).catch(() => {});
      });
    });

    return () => unsub();
  }, [channelService, user, receiveCallInvite]);

  // This component renders nothing
  return null;
}
