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
import type { StreamSession } from '@/services/streamService';

function StreamCard({ session, onPress }: { session: StreamSession; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient colors={['#0891b2', '#06b6d4']} style={styles.cardThumbnail}>
        <Text style={styles.liveTag}>● LIVE</Text>
        <Text style={styles.cardTitle} numberOfLines={1}>{session.title}</Text>
      </LinearGradient>
      <View style={styles.cardFooter}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hostName} numberOfLines={1}>{session.host_name ?? session.host_user_id}</Text>
          <Text style={styles.viewers}>{session.viewer_count} watching</Text>
        </View>
        <Text style={styles.startedAt}>{dayjs(session.created_at).fromNow()}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function StreamsScreen() {
  const { user } = useAuth();
  const [sessions,   setSessions]   = useState<StreamSession[]>([]);
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
      });
      router.push({ pathname: '/live-stream/host', params: { sessionId: session.session_id } });
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
        keyExtractor={(s) => s.session_id}
        renderItem={({ item }) => (
          <StreamCard
            session={item}
            onPress={() => router.push({ pathname: '/live-stream/viewer/[sessionId]', params: { sessionId: item.session_id } })}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📡</Text>
            <Text style={styles.emptyText}>No live streams right now</Text>
            <Text style={styles.emptyHint}>Tap &quot;Go Live&quot; to start broadcasting</Text>
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
  emptyHint:         { ...textPresets.label, color: colors.textMuted },
});
