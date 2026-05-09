/**
 * HyperBabel Demo — Block Management Screen
 *
 * Lists every user the signed-in account has globally blocked, with search +
 * pagination. A blocked user's messages don't reach the blocker in any room.
 *
 * APIs:
 *  - GET    /users/:userId/blocks       — list
 *  - DELETE /users/block                — unblock
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, spacing, textPresets, borderRadius } from '@/theme';
import * as unitedChat from '@/services/unitedChatService';

const PAGE_SIZE = 10;

type BlockedUser = { blocked_id: string; created_at: string };

export default function BlockManagementScreen() {
  const { user } = useAuth();
  const [blocked,    setBlocked]    = useState<BlockedUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(0);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const loadBlocks = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await unitedChat.getBlockList(user.userId);
      setBlocked(res.blocked_users ?? []);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to load block list.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadBlocks(); }, [loadBlocks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return blocked;
    return blocked.filter((b) => b.blocked_id.toLowerCase().includes(q));
  }, [blocked, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleUnblock = (blockedId: string) => {
    Alert.alert(
      'Unblock User',
      `Unblocking ${blockedId} will allow their messages to reach you in every room.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            setUnblocking(blockedId);
            try {
              await unitedChat.unblockUser(user.userId, blockedId);
              setBlocked((prev) => prev.filter((b) => b.blocked_id !== blockedId));
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Failed to unblock.');
            } finally {
              setUnblocking(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.headerBack}>← Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked Users</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Card style={styles.searchCard}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by user ID…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={(t) => { setSearch(t); setPage(0); }}
            autoCapitalize="none"
          />
        </Card>

        <Text style={styles.warning}>
          ⚠️ Blocks apply to every room, not just one.
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing[6] }} />
        ) : filtered.length === 0 ? (
          <Card style={styles.card}>
            <Text style={styles.emptyText}>
              {search ? 'No matches.' : 'You haven’t blocked anyone yet.'}
            </Text>
          </Card>
        ) : (
          <>
            {slice.map((row) => (
              <Card key={row.blocked_id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{row.blocked_id}</Text>
                  <Text style={styles.meta}>Blocked at: {new Date(row.created_at).toLocaleString()}</Text>
                </View>
                <Button
                  label={unblocking === row.blocked_id ? '…' : 'Unblock'}
                  variant="danger"
                  size="sm"
                  onPress={() => handleUnblock(row.blocked_id)}
                  disabled={unblocking === row.blocked_id}
                />
              </Card>
            ))}

            {totalPages > 1 && (
              <View style={styles.pager}>
                <TouchableOpacity
                  disabled={page === 0}
                  onPress={() => setPage((p) => Math.max(0, p - 1))}
                  style={[styles.pageBtn, page === 0 && styles.pageBtnDisabled]}
                >
                  <Text style={styles.pageBtnText}>← Prev</Text>
                </TouchableOpacity>
                <Text style={styles.pageText}>{page + 1} / {totalPages}</Text>
                <TouchableOpacity
                  disabled={page >= totalPages - 1}
                  onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  style={[styles.pageBtn, page >= totalPages - 1 && styles.pageBtnDisabled]}
                >
                  <Text style={styles.pageBtnText}>Next →</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        <View style={{ height: spacing[8] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.background },
  scroll:      { flex: 1 },
  content:     { padding: spacing[5] },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[5], paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.border },
  headerBack:  { ...textPresets.label, color: colors.primary },
  headerTitle: { ...textPresets.h4, color: colors.text },

  searchCard:  { padding: spacing[3], marginBottom: spacing[3] },
  searchInput: { ...textPresets.body, color: colors.text },

  warning:     { ...textPresets.caption, color: colors.warning ?? colors.textMuted, marginBottom: spacing[3] },

  card:        { padding: spacing[4] },
  row:         { flexDirection: 'row', alignItems: 'center', padding: spacing[3], gap: spacing[3], marginBottom: spacing[2] },
  userName:    { ...textPresets.label, color: colors.text, fontWeight: '700' },
  meta:        { ...textPresets.caption, color: colors.textMuted, marginTop: 2 },
  emptyText:   { ...textPresets.label, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing[6] },

  pager:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[4], marginTop: spacing[4] },
  pageBtn:     { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: borderRadius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { ...textPresets.caption, color: colors.text },
  pageText:    { ...textPresets.label, color: colors.textSecondary, fontWeight: '600' },
});
