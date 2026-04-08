/**
 * HyperBabel Demo — Live Stream Viewer Screen (with StreamChat)
 *
 * Audience joins a live stream via RtcClient (subscriber role).
 * Full-screen stream player with StreamChat overlay.
 *
 * Route: /live-stream/viewer/[sessionId]
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  Alert, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useAuth }     from '@/context/AuthContext';
import { StreamChat }  from '@/components/stream/StreamChat';
import { colors, spacing, textPresets, borderRadius } from '@/theme';
import { RtcClient, RtcSurfaceView, VideoSourceType } from '@/services/rtcService';
import * as streamService from '@/services/streamService';
import type { StreamSession } from '@/services/streamService';

export default function LiveStreamViewerScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { user }      = useAuth();

  const [session,   setSession]   = useState<StreamSession | null>(null);
  const [hostUid,   setHostUid]   = useState<number | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [showChat,  setShowChat]  = useState(true);

  const rtcRef = useRef<RtcClient | null>(null);

  useEffect(() => {
    if (!sessionId || !user) return;
    let mounted = true;

    (async () => {
      try {
        const { session: s } = await streamService.getViewerToken(sessionId, {
          user_id:             user.userId,
          viewer_display_name: user.userName,
        });
        if (!mounted) return;
        setSession(s);

        const client = new RtcClient();
        rtcRef.current = client;

        await client.join(
          {
            appId:       s.app_id ?? '',
            channelName: s.channel_name ?? '',
            token:       s.rtc_token ?? '',
            uid:         s.uid ?? 0,
            role:        'subscriber',
          },
          {
            onJoined:     ()    => { if (mounted) setLoading(false); },
            onUserJoined: (uid) => { if (mounted) setHostUid(uid); },
            onUserLeft:   (uid) => {
              if (!mounted) return;
              if (uid === hostUid) {
                Alert.alert('Stream Ended', 'The host has ended the broadcast.');
                router.back();
              }
            },
          },
        );

        if (mounted) setLoading(false);
      } catch (err: any) {
        Alert.alert('Error', err.message ?? 'Failed to join stream.');
        if (mounted) router.back();
      }
    })();

    return () => {
      mounted = false;
      rtcRef.current?.release();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleLeave = () => {
    rtcRef.current?.leave();
    router.back();
  };

  if (loading) {
    return (
      <View style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Joining stream…</Text>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      {/* Host video full-screen */}
      {hostUid !== null ? (
        <RtcSurfaceView style={styles.video} canvas={{ uid: hostUid, sourceType: VideoSourceType.VideoSourceRemote }} />
      ) : (
        <View style={[styles.video, styles.waitWrap]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.waitText}>Waiting for host…</Text>
        </View>
      )}

      {/* Info overlay (top-left) */}
      <SafeAreaView style={styles.topOverlay}>
        <View style={styles.infoCard}>
          <Text style={styles.streamTitle} numberOfLines={1}>{session?.title}</Text>
          <Text style={styles.hostName}>{session?.host_name}</Text>
        </View>
      </SafeAreaView>

      {/* Chat overlay (bottom-left) */}
      {showChat && session?.chat_room_id && (
        <View style={styles.chatWrap}>
          <StreamChat chatRoomId={session.chat_room_id} />
        </View>
      )}

      {/* Action buttons (top-right) */}
      <SafeAreaView style={styles.topRight}>
        {session?.chat_room_id && (
          <TouchableOpacity onPress={() => setShowChat((v) => !v)} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>💬</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={handleLeave} style={[styles.iconBtn, styles.leaveBtn]}>
          <Text style={styles.leaveBtnText}>✕ Leave</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: '#000' },
  centered:    { alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...textPresets.body, color: colors.textSecondary, marginTop: spacing[4] },
  video:       { flex: 1 },
  waitWrap:    { alignItems: 'center', justifyContent: 'center', gap: spacing[4] },
  waitText:    { ...textPresets.h4, color: colors.textSecondary },

  topOverlay:  { position: 'absolute', top: 0, left: 0, padding: spacing[4] },
  infoCard:    { backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: borderRadius.lg, padding: spacing[3] },
  streamTitle: { ...textPresets.label, color: colors.white, fontWeight: '700' },
  hostName:    { ...textPresets.caption, color: 'rgba(255,255,255,0.7)' },

  chatWrap:    { position: 'absolute', bottom: 100, left: spacing[4] },

  topRight:    { position: 'absolute', top: 0, right: 0, padding: spacing[4], gap: spacing[2] },
  iconBtn:     { backgroundColor: 'rgba(0,0,0,0.55)', padding: spacing[3], borderRadius: borderRadius.lg },
  iconBtnText: { fontSize: 20 },
  leaveBtn:    { backgroundColor: 'rgba(220,38,38,0.85)' },
  leaveBtnText:{ ...textPresets.label, color: colors.white, fontWeight: '700' },
});
