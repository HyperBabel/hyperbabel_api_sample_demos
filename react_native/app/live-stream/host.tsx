/**
 * HyperBabel Demo — Live Stream Host Screen (with StreamChat)
 *
 * Host publishes video and audio (broadcaster role via RtcClient).
 * Supports StreamChat overlay once Go Live is active.
 *
 * Route: /live-stream/host
 * Params: sessionId (from createSession)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useAuth }        from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { StreamChat }     from '@/components/stream/StreamChat';
import { colors, spacing, textPresets, borderRadius } from '@/theme';
import { RtcClient, RtcSurfaceView, VideoSourceType } from '@/services/rtcService';
import * as streamService from '@/services/streamService';
import type { StreamSession } from '@/services/streamService';

export default function LiveStreamHostScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { user }      = useAuth();
  const { allGranted, checking, request } = usePermissions();

  const [session,     setSession]    = useState<StreamSession | null>(null);
  const [isLive,      setIsLive]     = useState(false);
  const [muted,       setMuted]      = useState(false);
  const [showChat,    setShowChat]   = useState(false);
  const [loading,     setLoading]    = useState(true);
  const [permDenied,  setPermDenied] = useState(false);
  const [title,       setTitle]      = useState('');

  const rtcRef   = useRef<RtcClient | null>(null);

  // ── 1. Permission gate ──────────────────────────────────────────────────

  useEffect(() => {
    if (checking) return;
    if (allGranted) {
      initSession();
    } else {
      request().then((ok) => { if (!ok) setPermDenied(true); else initSession(); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking]);

  // ── 2. Get session token & join RTC ─────────────────────────────────────

  const initSession = async () => {
    if (!sessionId) return;
    try {
      const { session: s } = await streamService.getViewerToken(sessionId, {});
      setSession(s);
      setTitle(s.title ?? '');

      const client = new RtcClient();
      rtcRef.current = client;

      await client.join(
        {
          appId:       s.app_id ?? '',
          channelName: s.channel_name ?? '',
          token:       s.rtc_token ?? '',
          uid:         s.uid ?? 0,
          role:        'publisher',
        },
        { onJoined: () => setLoading(false) },
      );
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to set up stream.');
      router.back();
    }
  };

  useEffect(() => {
    return () => { rtcRef.current?.release(); };
  }, []);

  const handleGoLive = async () => {
    if (!sessionId) return;
    await streamService.startSession(sessionId).catch(() => {});
    setIsLive(true);
  };

  const handleEnd = async () => {
    if (sessionId) await streamService.endSession(sessionId).catch(() => {});
    rtcRef.current?.leave();
    router.back();
  };

  // ── 3. Render ────────────────────────────────────────────────────────────

  if (permDenied) {
    return (
      <View style={[styles.safe, styles.centered]}>
        <Text style={styles.permText}>Camera & Mic access required.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading || checking) {
    return (
      <View style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Setting up camera…</Text>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      {/* Local camera preview full-screen */}
      <RtcSurfaceView style={styles.preview} canvas={{ uid: 0, sourceType: VideoSourceType.VideoSourceCamera }} />

      {/* Live tag */}
      <SafeAreaView style={styles.topOverlay}>
        {isLive ? (
          <View style={styles.liveTag}>
            <Text style={styles.liveTagText}>● LIVE</Text>
          </View>
        ) : (
          <TextInput
            style={styles.titleInput}
            placeholder="Stream title…"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={title}
            onChangeText={setTitle}
          />
        )}
      </SafeAreaView>

      {/* Stream chat overlay (visible after going live) */}
      {isLive && showChat && session?.chat_room_id && (
        <View style={styles.chatWrap}>
          <StreamChat chatRoomId={session.chat_room_id} />
        </View>
      )}

      {/* Controls */}
      <SafeAreaView style={styles.controls}>
        {!isLive ? (
          <TouchableOpacity style={styles.goLiveBtn} onPress={handleGoLive}>
            <Text style={styles.goLiveBtnText}>● Go Live</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.ctrlBtn} onPress={() => { rtcRef.current?.muteAudio(!muted); setMuted((v) => !v); }}>
              <Text style={styles.ctrlIcon}>{muted ? '🔇' : '🎙'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ctrlBtn} onPress={() => rtcRef.current?.flipCamera()}>
              <Text style={styles.ctrlIcon}>🔄</Text>
            </TouchableOpacity>
            {session?.chat_room_id && (
              <TouchableOpacity style={styles.ctrlBtn} onPress={() => setShowChat((v) => !v)}>
                <Text style={styles.ctrlIcon}>💬</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        <TouchableOpacity style={[styles.ctrlBtn, styles.endBtn]} onPress={handleEnd}>
          <Text style={styles.endBtnText}>End</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: '#000' },
  centered:      { alignItems: 'center', justifyContent: 'center' },
  preview:       { flex: 1 },
  loadingText:   { ...textPresets.body, color: colors.textSecondary, marginTop: spacing[4] },
  permText:      { ...textPresets.h4, color: colors.white, marginBottom: spacing[4] },
  backBtn:       { backgroundColor: colors.primary, paddingHorizontal: spacing[8], paddingVertical: spacing[3], borderRadius: borderRadius.xl },
  backBtnText:   { ...textPresets.label, color: colors.white, fontWeight: '700' },

  topOverlay:    { position: 'absolute', top: 0, left: 0, right: 0, padding: spacing[4] },
  liveTag:       { alignSelf: 'flex-start', backgroundColor: 'rgba(220,38,38,0.9)', paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: borderRadius.full },
  liveTagText:   { ...textPresets.label, color: colors.white, fontWeight: '700' },
  titleInput:    { backgroundColor: 'rgba(0,0,0,0.5)', color: colors.white, borderRadius: borderRadius.lg, paddingHorizontal: spacing[4], paddingVertical: spacing[3], ...textPresets.label },

  chatWrap:      { position: 'absolute', bottom: 100, left: spacing[4] },

  controls:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingVertical: spacing[5], backgroundColor: 'rgba(0,0,0,0.8)' },
  goLiveBtn:     { backgroundColor: colors.error, paddingHorizontal: spacing[8], paddingVertical: spacing[4], borderRadius: borderRadius.xl },
  goLiveBtnText: { ...textPresets.label, color: colors.white, fontWeight: '700', fontSize: 16 },
  ctrlBtn:       { padding: spacing[3] },
  ctrlIcon:      { fontSize: 28 },
  endBtn:        { backgroundColor: colors.error, paddingHorizontal: spacing[5], paddingVertical: spacing[3], borderRadius: borderRadius.lg },
  endBtnText:    { ...textPresets.label, color: colors.white, fontWeight: '700' },
});
