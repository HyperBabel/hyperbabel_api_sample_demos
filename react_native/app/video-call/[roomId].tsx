/**
 * HyperBabel Demo — Video Call Screen
 *
 * Full video call lifecycle using react-native-agora (HyperBabel Video RTC):
 *  - usePermissions: request camera + mic before joining
 *  - Join active call session (accept flow or direct start)
 *  - Rejoin: detects existing active call and shows rejoin banner
 *  - Remote video tiles, local PiP camera preview
 *  - Controls: mute, camera on/off, flip, in-call chat, end/leave
 *  - In-call chat overlay (InCallChat component)
 *  - Sets CallContext.isInCall for busy guard
 *
 * Route: /video-call/[roomId]
 * Params:
 *   roomId      — United Chat room ID
 *   sessionId   — (optional) existing session to join
 *   isIncoming  — '1' if this was an accepted incoming call
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  createAgoraRtcEngine, IRtcEngine, RtcConnection,
  RtcSurfaceView, VideoSourceType,
  ClientRoleType, ChannelProfileType, IRtcEngineEventHandler,
} from 'react-native-agora';

import { useAuth }                from '@/context/AuthContext';
import { useCall }                from '@/context/CallContext';
import { usePermissions }         from '@/hooks/usePermissions';
import { InCallChat }             from '@/components/video/InCallChat';
import { colors, spacing, textPresets, borderRadius } from '@/theme';
import * as unitedChat            from '@/services/unitedChatService';
import type { ActiveVideoCall }   from '@/services/unitedChatService';

export default function VideoCallScreen() {
  const { roomId, isIncoming } = useLocalSearchParams<{
    roomId:      string;
    isIncoming?: string;
  }>();
  const { user }                            = useAuth();
  const { setIsInCall, clearIncomingCall }  = useCall();
  const { allGranted, checking, request }   = usePermissions();

  const [callData,    setCallData]    = useState<ActiveVideoCall | null>(null);
  const [remoteUids,  setRemoteUids]  = useState<number[]>([]);
  const [muted,       setMuted]       = useState(false);
  const [cameraOff,   setCameraOff]   = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [permDenied,  setPermDenied]  = useState(false);
  const [hasRejoin,   setHasRejoin]   = useState(false); // existing call detected

  const engineRef = useRef<IRtcEngine | null>(null);

  // ── 1. Permission gate ──────────────────────────────────────────────────

  useEffect(() => {
    if (checking) return;
    if (allGranted) {
      joinCall();
    } else {
      request().then((granted) => {
        if (!granted) setPermDenied(true);
        else joinCall();
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking]);

  // ── 2. Check for rejoin (existing active session) ──────────────────────

  const checkExistingCall = async (): Promise<ActiveVideoCall | null> => {
    try {
      return await unitedChat.getActiveVideoCall(roomId);
    } catch {
      return null;
    }
  };

  // ── 3. Join call ────────────────────────────────────────────────────────

  const joinCall = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Get active call data (accept provided token, or check for existing call)
      let data: ActiveVideoCall | null = null;

      if (isIncoming === '1') {
        // Accept was already called — fetch active call to get token
        data = await unitedChat.getActiveVideoCall(roomId);
      } else {
        // Check for existing call to offer rejoin
        const existing = await checkExistingCall();
        if (existing && existing.participants?.length > 0) {
          setHasRejoin(true);
          setCallData(existing);
          setLoading(false);
          return;
        }
        // Start new call
        data = await unitedChat.startVideoCall(roomId, user.userId);
      }

      if (!data) {
        Alert.alert('Error', 'No active call found.');
        router.back();
        return;
      }

      setCallData(data);
      setIsInCall(true);
      await initAgoraEngine(data);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to join call.');
      setIsInCall(false);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const rejoinCall = async () => {
    if (!callData || !user) return;
    setHasRejoin(false);
    setLoading(true);
    setIsInCall(true);
    await initAgoraEngine(callData);
    setLoading(false);
  };

  // ── 4. Agora engine init ────────────────────────────────────────────────

  const initAgoraEngine = async (data: ActiveVideoCall) => {
    const _engine = createAgoraRtcEngine();
    engineRef.current = _engine;

    _engine.initialize({
      appId:           data.app_id ?? '',
      channelProfile:  ChannelProfileType.ChannelProfileCommunication,
    });

    const handler: IRtcEngineEventHandler = {
      onJoinChannelSuccess: (_conn: RtcConnection) => console.log('[RTC] Joined'),
      onUserJoined:  (_conn: RtcConnection, uid: number) =>
        setRemoteUids((prev) => [...new Set([...prev, uid])]),
      onUserOffline: (_conn: RtcConnection, uid: number) =>
        setRemoteUids((prev) => prev.filter((u) => u !== uid)),
    };
    _engine.registerEventHandler(handler);
    _engine.enableVideo();

    await _engine.joinChannel(
      data.rtc_token ?? '',
      data.channel_name,
      data.uid ?? 0,
      { clientRoleType: ClientRoleType.ClientRoleBroadcaster },
    );
  };

  useEffect(() => {
    return () => {
      engineRef.current?.leaveChannel();
      engineRef.current?.release();
      engineRef.current = null;
    };
  }, []);

  // ── 5. Controls ─────────────────────────────────────────────────────────

  const toggleMute = () => {
    engineRef.current?.muteLocalAudioStream(!muted);
    setMuted((v) => !v);
  };

  const toggleCamera = () => {
    engineRef.current?.muteLocalVideoStream(!cameraOff);
    setCameraOff((v) => !v);
  };

  const flipCamera = () => engineRef.current?.switchCamera();

  const handleLeave = async () => {
    try {
      if (user && roomId) await unitedChat.leaveVideoCall(roomId, user.userId);
    } finally {
      setIsInCall(false);
      clearIncomingCall();
      engineRef.current?.leaveChannel();
      router.back();
    }
  };

  const handleEnd = async () => {
    Alert.alert('End Call', 'End the call for everyone?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End for All', style: 'destructive', onPress: async () => {
        try {
          if (user && roomId) await unitedChat.endVideoCall(roomId, user.userId);
        } finally {
          setIsInCall(false);
          clearIncomingCall();
          engineRef.current?.leaveChannel();
          router.back();
        }
      }},
      { text: 'Leave Only', onPress: handleLeave },
    ]);
  };

  // ── 6. Render ───────────────────────────────────────────────────────────

  if (permDenied) {
    return (
      <View style={[styles.fullscreen, styles.centered]}>
        <Text style={styles.permIcon}>🎥</Text>
        <Text style={styles.permTitle}>Camera & Mic Required</Text>
        <Text style={styles.permSub}>Please enable permissions in Settings</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading || checking) {
    return (
      <View style={[styles.fullscreen, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.connectText}>Connecting…</Text>
      </View>
    );
  }

  // Rejoin banner state
  if (hasRejoin && callData) {
    return (
      <View style={[styles.fullscreen, styles.centered]}>
        <Text style={styles.rejoinIcon}>📹</Text>
        <Text style={styles.rejoinTitle}>Call In Progress</Text>
        <Text style={styles.rejoinSub}>
          {callData.participants?.length ?? 0} participant(s) in the call
        </Text>
        <TouchableOpacity style={styles.rejoinBtn} onPress={rejoinCall}>
          <Text style={styles.rejoinBtnText}>Rejoin Call</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ignoreBtn} onPress={() => router.back()}>
          <Text style={styles.ignoreBtnText}>Ignore</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.fullscreen}>
      {/* Remote video(s) */}
      {remoteUids.length > 0 ? (
        <View style={styles.remoteWrap}>
          {remoteUids.map((uid) => (
            <RtcSurfaceView
              key={uid}
              style={styles.remoteVideo}
              canvas={{ uid, sourceType: VideoSourceType.VideoSourceRemote }}
            />
          ))}
        </View>
      ) : (
        <View style={[styles.remoteWrap, styles.waitWrap]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.waitText}>Waiting for others…</Text>
        </View>
      )}

      {/* Local camera PiP */}
      {!cameraOff && (
        <View style={styles.pipWrap}>
          <RtcSurfaceView
            style={styles.pipVideo}
            canvas={{ uid: 0, sourceType: VideoSourceType.VideoSourceCamera }}
          />
        </View>
      )}

      {/* Participant count */}
      <SafeAreaView style={styles.topBar}>
        <View style={styles.participantBadge}>
          <Text style={styles.participantText}>👥 {remoteUids.length + 1}</Text>
        </View>
      </SafeAreaView>

      {/* Controls */}
      <SafeAreaView style={styles.controlsBar}>
        <ControlBtn icon={muted ? '🔇' : '🎙'} label={muted ? 'Unmute' : 'Mute'} onPress={toggleMute} />
        <ControlBtn icon={cameraOff ? '📵' : '📹'} label={cameraOff ? 'Cam On' : 'Cam Off'} onPress={toggleCamera} />
        <ControlBtn icon="🔄" label="Flip" onPress={flipCamera} />
        <ControlBtn icon="💬" label="Chat" onPress={() => setChatVisible((v) => !v)} active={chatVisible} />
        <ControlBtn icon="✕" label="End" onPress={handleEnd} danger />
      </SafeAreaView>

      {/* In-call chat overlay */}
      {roomId && (
        <InCallChat
          roomId={roomId}
          visible={chatVisible}
          onClose={() => setChatVisible(false)}
        />
      )}
    </View>
  );
}

// ── Control button ──────────────────────────────────────────────────────────

function ControlBtn({
  icon, label, onPress, danger, active
}: {
  icon: string; label: string; onPress: () => void; danger?: boolean; active?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.ctrlBtn} onPress={onPress} activeOpacity={0.75}>
      <View style={[
        styles.ctrlBtnInner,
        danger  && styles.ctrlBtnDanger,
        active  && styles.ctrlBtnActive,
      ]}>
        <Text style={styles.ctrlBtnIcon}>{icon}</Text>
      </View>
      <Text style={styles.ctrlBtnLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fullscreen:      { flex: 1, backgroundColor: '#000' },
  centered:        { alignItems: 'center', justifyContent: 'center' },

  connectText:     { ...textPresets.body, color: colors.textSecondary, marginTop: spacing[4] },

  remoteWrap:      { flex: 1 },
  remoteVideo:     { flex: 1 },
  waitWrap:        { alignItems: 'center', justifyContent: 'center', gap: spacing[4] },
  waitText:        { ...textPresets.h4, color: colors.textSecondary },

  pipWrap:         { position: 'absolute', top: 80, right: spacing[4], width: 90, height: 130, borderRadius: borderRadius.lg, overflow: 'hidden', borderWidth: 2, borderColor: colors.primary },
  pipVideo:        { flex: 1 },

  topBar:          { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing[5] },
  participantBadge:{ alignSelf: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: borderRadius.full, marginTop: spacing[3] },
  participantText: { ...textPresets.caption, color: colors.white, fontWeight: '700' },

  controlsBar:     { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingVertical: spacing[5], backgroundColor: 'rgba(0,0,0,0.72)' },
  ctrlBtn:         { alignItems: 'center', gap: spacing[2] },
  ctrlBtnInner:    { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  ctrlBtnDanger:   { backgroundColor: colors.error },
  ctrlBtnActive:   { backgroundColor: colors.primary },
  ctrlBtnIcon:     { fontSize: 24 },
  ctrlBtnLabel:    { ...textPresets.caption, color: colors.white, fontSize: 11 },

  // Permission denied
  permIcon:        { fontSize: 52, marginBottom: spacing[4] },
  permTitle:       { ...textPresets.h4, color: colors.white, marginBottom: spacing[2] },
  permSub:         { ...textPresets.body, color: colors.textSecondary, marginBottom: spacing[8], textAlign: 'center', paddingHorizontal: spacing[8] },
  backBtn:         { backgroundColor: colors.primary, paddingHorizontal: spacing[8], paddingVertical: spacing[4], borderRadius: borderRadius.xl },
  backBtnText:     { ...textPresets.label, color: colors.white, fontWeight: '700' },

  // Rejoin
  rejoinIcon:      { fontSize: 52, marginBottom: spacing[4] },
  rejoinTitle:     { ...textPresets.h3, color: colors.white, marginBottom: spacing[2] },
  rejoinSub:       { ...textPresets.body, color: colors.textSecondary, marginBottom: spacing[8] },
  rejoinBtn:       { backgroundColor: colors.callAccept, paddingHorizontal: spacing[10], paddingVertical: spacing[4], borderRadius: borderRadius.xl, marginBottom: spacing[4] },
  rejoinBtnText:   { ...textPresets.label, color: colors.white, fontWeight: '700', fontSize: 18 },
  ignoreBtn:       { paddingVertical: spacing[3] },
  ignoreBtnText:   { ...textPresets.label, color: colors.textMuted },
});
