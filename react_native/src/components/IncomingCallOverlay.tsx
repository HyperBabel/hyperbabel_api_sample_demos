/**
 * HyperBabel Demo — Incoming Call Overlay
 *
 * Full-screen modal overlay shown when a call invite arrives.
 * Plays the ringtone (expo-audio + device vibration) and displays
 * caller info and Accept / Decline buttons.
 *
 * Architecture:
 *  - Reads incomingCall from CallContext (populated by IncomingCallListener)
 *  - Accept: stops ringtone, calls acceptVideoCall API (with the invite's
 *    session id), navigates to VideoCallScreen. If the call already ended
 *    (410) the overlay closes with a notice; any other failure keeps the
 *    overlay up with an error so the user can retry or decline.
 *  - Decline: stops ringtone, calls rejectVideoCall API, clears overlay
 *  - While ringing: listens on the invite's room channel and closes if the
 *    caller hangs up (call_ended); after 45 s unanswered it declines the
 *    invite as missed.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Alert } from 'react-native';
import { BlurView } from 'expo-blur';

import { useCall } from '@/context/CallContext';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/context/RealtimeContext';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';
import { startRingtone, stopRingtone } from '@/utils/ringtone';
import { colors, spacing, textPresets, borderRadius, shadows } from '@/theme';
import * as unitedChat from '@/services/unitedChatService';
import { ApiError } from '@/services/api';
import { router } from 'expo-router';

/** How long an invite rings before it is declined as missed. */
const RING_TIMEOUT_MS = 45_000;

export function IncomingCallOverlay() {
  const { incomingCall, clearIncomingCall, setIsInCall } = useCall();
  const { user } = useAuth();
  const { channelService } = useRealtime();
  const { show: showToast } = useToast();
  const userId = user?.userId ?? '';
  // Set while an Accept request is in flight, so the ring timeout cannot
  // decline a call the user is answering at that moment.
  const acceptingRef = useRef(false);

  // Pulsing animation for the accept button (created once, never replaced)
  const [pulseAnim] = React.useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!incomingCall) return;
    const call = incomingCall;

    // Start ringtone + vibration
    startRingtone();

    // Pulse animation
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 500, easing: Easing.in(Easing.ease),  useNativeDriver: true }),
      ]),
    );
    pulse.start();

    // The caller hanging up ends the session, and the room channel carries a
    // call_ended event for it. The cleanup below removes ONLY this listener —
    // the chat screen may be subscribed to the same channel and must keep it.
    const unsubscribe = channelService && call.roomSignalChannel
      ? channelService.subscribeToRoom(call.roomSignalChannel, ({ message, type }) => {
          const evt = unitedChat.callEventFrom(type, message);
          if (evt?.event !== 'call_ended' || evt.session_id !== call.sessionId) return;
          clearIncomingCall();
          showToast({ title: 'Missed call', message: call.callerName, type: 'info' });
        })
      : () => {};

    // Unanswered: tell the server it was missed (the caller sees "Missed
    // call") and stop ringing.
    const missedTimer = setTimeout(() => {
      if (acceptingRef.current) return;
      clearIncomingCall();
      unitedChat.rejectVideoCall(call.roomId, userId, call.sessionId, 'missed').catch(() => {});
    }, RING_TIMEOUT_MS);

    return () => {
      clearTimeout(missedTimer);
      unsubscribe();
      pulse.stop();
      stopRingtone();
    };
  }, [incomingCall, channelService, clearIncomingCall, showToast, userId, pulseAnim]);

  if (!incomingCall) return null;

  const handleAccept = async () => {
    stopRingtone();
    acceptingRef.current = true;
    try {
      await unitedChat.acceptVideoCall(incomingCall.roomId, userId, incomingCall.sessionId);
      setIsInCall(true);
      clearIncomingCall();
      router.push({
        pathname: '/video-call/[roomId]',
        params:   { roomId: incomingCall.roomId, sessionId: incomingCall.sessionId, isIncoming: '1' },
      });
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 410) {
        // The caller hung up (or the call was ended) before we answered.
        clearIncomingCall();
        showToast({ title: 'Call ended', message: 'This call has already ended.', type: 'info' });
        return;
      }
      // Anything else (network, auth, server) — keep the invite on screen so
      // the user can try Accept again or Decline, and say what went wrong.
      Alert.alert('Could not join the call', err?.message ?? 'Please try again.');
    } finally {
      acceptingRef.current = false;
    }
  };

  const handleDecline = async () => {
    stopRingtone();
    clearIncomingCall();
    try {
      await unitedChat.rejectVideoCall(incomingCall.roomId, userId, incomingCall.sessionId);
    } catch { /* best effort — the caller's ring times out on its own */ }
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]}>
      {/* Glassmorphism blur background */}
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

      <View style={styles.card}>
        {/* Caller avatar */}
        <Avatar name={incomingCall.callerName} size={96} style={styles.avatar} />

        {/* Call info */}
        <Text style={styles.callType}>Incoming {incomingCall.callType === '1to1' ? '1:1' : 'Group'} Call</Text>
        <Text style={styles.callerName}>{incomingCall.callerName}</Text>
        <Text style={styles.callerId}>{incomingCall.callerId}</Text>

        {/* Action buttons */}
        <View style={styles.buttons}>
          {/* Decline */}
          <TouchableOpacity style={styles.declineBtn} onPress={handleDecline} activeOpacity={0.85}>
            <View style={styles.declineBtnInner}>
              <Text style={styles.btnIcon}>✕</Text>
            </View>
            <Text style={styles.btnLabel}>Decline</Text>
          </TouchableOpacity>

          {/* Accept (pulsing) */}
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept} activeOpacity={0.85}>
              <View style={styles.acceptBtnInner}>
                <Text style={styles.btnIcon}>📹</Text>
              </View>
              <Text style={styles.btnLabel}>Accept</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay:       { zIndex: 9000, alignItems: 'center', justifyContent: 'center' },
  card:          { width: '85%', backgroundColor: 'rgba(26,26,46,0.95)', borderRadius: borderRadius['2xl'], padding: spacing[8], alignItems: 'center', borderWidth: 1, borderColor: colors.glassBorder, ...shadows.lg },
  avatar:        { marginBottom: spacing[5] },
  callType:      { ...textPresets.caption, color: colors.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing[2] },
  callerName:    { ...textPresets.h3, color: colors.text, marginBottom: spacing[1] },
  callerId:      { ...textPresets.label, color: colors.textMuted, marginBottom: spacing[8] },
  buttons:       { flexDirection: 'row', gap: spacing[10] },
  declineBtn:    { alignItems: 'center', gap: spacing[2] },
  declineBtnInner:{ width: 68, height: 68, borderRadius: 34, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' },
  acceptBtn:     { alignItems: 'center', gap: spacing[2] },
  acceptBtnInner: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.callAccept, alignItems: 'center', justifyContent: 'center' },
  btnIcon:       { fontSize: 28 },
  btnLabel:      { ...textPresets.label, color: colors.text },
});
