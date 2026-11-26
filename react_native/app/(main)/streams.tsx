/**
 * HyperBabel Demo — Streams Discovery Screen
 *
 * Shows active live streams for this organisation.
 * Tapping a session opens the viewer screen.
 * Hosts can create a new stream from here.
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

import { useAuth } from '@/context/AuthContext';
import { colors, spacing, textPresets, borderRadius, shadows } from '@/theme';
import * as streamService from '@/services/streamService';
import type { StreamListItem } from '@/services/streamService';
import { declaredQuality, publishResolutionFor } from '@/services/videoQuality';

function StreamCard({ session, onPress }: { session: StreamListItem; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient colors={['#0891b2', '#06b6d4']} style={styles.cardThumbnail}>
        <Text style={styles.liveTag}>● LIVE</Text>
        <Text style={styles.cardTitle} numberOfLines={1}>{session.title}</Text>
      </LinearGradient>
      <View style={styles.cardFooter}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hostName} numberOfLines={1}>{session.host.display_name}</Text>
          <Text style={styles.viewers}>{session.viewer_count} watching</Text>
        </View>
        <Text style={styles.startedAt}>{dayjs(session.started_at ?? session.created_at).fromNow()}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function StreamsScreen() {
  const { user } = useAuth();
  const [sessions,   setSessions]   = useState<StreamListItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data = await streamService.listSessions({ status: 'live', limit: 20 });
      setSessions(data.sessions ?? []);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to load streams.');
    }
  };

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleGoLive = async () => {
    if (!user) return;
    try {
      const { session } = await streamService.createSession({
        host_user_id:   user.userId,
        title:          `${user.userName}'s Live Stream`,
        host_display_name: user.userName,
        // Billing tier for this broadcast — see services/videoQuality.ts.
        quality:        declaredQuality(),
        // Optional self-check. A viewer subscribes to the host stream only, so
        // a broadcast's aggregate is this resolution itself — pass 1.
        publish_resolution: publishResolutionFor(1),
      });
      // The id is `session.id`. createSession keeps the response (with the
      // host's publisher token in `session.host`) for the host screen.
      router.push({ pathname: '/live-stream/host', params: { sessionId: session.id } });
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to create stream session.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Live Streams</Text>
        <TouchableOpacity style={styles.goLiveBtn} onPress={handleGoLive} activeOpacity={0.85}>
          <LinearGradient colors={['#dc2626', '#ef4444']} style={styles.goLiveBtnGradient}>
            <Text style={styles.goLiveBtnText}>● Go Live</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <StreamCard
            session={item}
            onPress={() => router.push({ pathname: '/live-stream/viewer/[sessionId]', params: { sessionId: item.id } })}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        // 🔴 Tell the truth in the empty state. Listing broadcasts calls
        //    `/stream/*`, which authenticates with the ORGANIZATION API key —
        //    never present on a device — so here the call returns 401 and the
        //    list is always empty. "No live streams right now" would read as
        //    "nobody is broadcasting", sending a developer hunting for a bug
        //    that isn't one. See src/services/streamService.ts.
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📡</Text>
            <Text style={styles.emptyText}>Live streaming needs your backend</Text>
            <Text style={styles.emptyHint}>
              Listing and creating broadcasts authenticates with your organization API key,
              which never ships on a device — so this list stays empty here. Proxy
              /stream/* through your own server to light it up.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}



const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: colors.background },
  centered:          { alignItems: 'center', justifyContent: 'center' },
  header:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[5], paddingVertical: spacing[4], borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle:       { ...textPresets.h3, color: colors.text },
  goLiveBtn:         { borderRadius: borderRadius.lg, overflow: 'hidden' },
  goLiveBtnGradient: { paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  goLiveBtnText:     { ...textPresets.label, color: colors.white, fontWeight: '700' },

  list:              { padding: spacing[5], gap: spacing[4] },
  card:              { backgroundColor: colors.card, borderRadius: borderRadius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.glassBorder, ...shadows.md },
  cardThumbnail:     { height: 160, padding: spacing[4], justifyContent: 'space-between' },
  liveTag:           { ...textPresets.caption, color: colors.white, backgroundColor: 'rgba(220,38,38,0.85)', alignSelf: 'flex-start', paddingHorizontal: spacing[3], paddingVertical: 2, borderRadius: borderRadius.full, fontWeight: '700' },
  cardTitle:         { ...textPresets.h4, color: colors.white, fontWeight: '700' },
  cardFooter:        { flexDirection: 'row', alignItems: 'center', padding: spacing[4] },
  hostName:          { ...textPresets.label, color: colors.text, fontWeight: '700' },
  viewers:           { ...textPresets.caption, color: colors.textSecondary },
  startedAt:         { ...textPresets.caption, color: colors.textMuted },

  empty:             { alignItems: 'center', paddingVertical: spacing[20] },
  emptyIcon:         { fontSize: 48, marginBottom: spacing[4] },
  emptyText:         { ...textPresets.h4, color: colors.textSecondary, marginBottom: spacing[2] },
  emptyHint:         { ...textPresets.label, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing[6] },
});
