/**
 * HyperBabel Demo — Incoming Call Overlay
 *
 * Full-screen modal overlay shown when a call invite arrives.
 * Plays the ringtone (expo-av + device vibration) and displays
 * caller info and Accept / Decline buttons.
 *
 * Architecture:
 *  - Reads incomingCall from CallContext (populated by IncomingCallListener)
 *  - Accept: stops ringtone, calls acceptVideoCall API, navigates to VideoCallScreen
 *  - Decline: stops ringtone, calls rejectVideoCall API, clears overlay
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { BlurView } from 'expo-blur';

import { useCall } from '@/context/CallContext';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { startRingtone, stopRingtone } from '@/utils/ringtone';
import { colors, spacing, textPresets, borderRadius, shadows } from '@/theme';
import * as unitedChat from '@/services/unitedChatService';
import { router } from 'expo-router';

export function IncomingCallOverlay() {
  const { incomingCall, clearIncomingCall, setIsInCall } = useCall();
  const { user } = useAuth();

  // Pulsing animation for the accept button
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!incomingCall) return;

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

    return () => {
      pulse.stop();
      stopRingtone();
    };
  }, [incomingCall]);

  if (!incomingCall) return null;

  const handleAccept = async () => {
    stopRingtone();
    try {
      const callData = await unitedChat.acceptVideoCall(incomingCall.roomId, user?.userId ?? '');
      setIsInCall(true);
      clearIncomingCall();
      router.push({
        pathname: '/video-call/[roomId]',
        params:   { roomId: incomingCall.roomId, sessionId: incomingCall.sessionId, isIncoming: '1' },
      });
    } catch {
      clearIncomingCall();
    }
  };

  const handleDecline = async () => {
    stopRingtone();
    clearIncomingCall();
    try {
      await unitedChat.rejectVideoCall(incomingCall.roomId, user?.userId ?? '');
    } catch { /* ignore */ }
  };

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.overlay]}>
      {/* Glassmorphism blur background */}
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />

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
