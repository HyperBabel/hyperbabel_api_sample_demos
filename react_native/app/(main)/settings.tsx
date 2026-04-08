/**
 * HyperBabel Demo — Settings Screen
 *
 * Covers Phase 6 features:
 *  - Profile info (userId, lang)
 *  - API usage stats (current billing period)
 *  - Webhook management (list, create, delete)
 *  - Language preference update
 *  - Logout
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, Switch, TextInput, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, spacing, textPresets, borderRadius } from '@/theme';
import * as authService from '@/services/authService';
import type { UsageStats, WebhookConfig } from '@/services/authService';

// ── Usage stat row ────────────────────────────────────────────────────────

function UsageRow({ label, value, limit }: { label: string; value: number; limit?: number }) {
  const pct = limit ? Math.min(100, Math.round((value / limit) * 100)) : 0;
  return (
    <View style={styles.usageRow}>
      <View style={styles.usageRowHeader}>
        <Text style={styles.usageLabel}>{label}</Text>
        <Text style={styles.usageValue}>{value.toLocaleString()}{limit ? ` / ${limit.toLocaleString()}` : ''}</Text>
      </View>
      {!!limit && (
        <View style={styles.usageBar}>
          <View style={[styles.usageBarFill, { width: `${pct}%` as any, backgroundColor: pct > 80 ? colors.error : colors.primary }]} />
        </View>
      )}
    </View>
  );
}

// ── Webhook row ───────────────────────────────────────────────────────────

function WebhookRow({ wh, onDelete }: { wh: WebhookConfig; onDelete: () => void }) {
  return (
    <View style={styles.webhookRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.webhookUrl} numberOfLines={1}>{wh.url}</Text>
        <Text style={styles.webhookEvents}>{wh.events.join(', ')}</Text>
      </View>
      <View style={styles.webhookActions}>
        <View style={[styles.whStatus, { backgroundColor: wh.is_active ? colors.success : colors.textMuted }]} />
        <TouchableOpacity onPress={onDelete}>
          <Text style={{ color: colors.error, fontSize: 18 }}>🗑</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'fr', label: 'Français' },
];

export default function SettingsScreen() {
  const { user, logout, updateLang } = useAuth();
  const [usage,     setUsage]     = useState<UsageStats | null>(null);
  const [webhooks,  setWebhooks]  = useState<WebhookConfig[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [newWhUrl,  setNewWhUrl]  = useState('');
  const [addingWh,  setAddingWh]  = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [u, w] = await Promise.all([
        authService.getUsage().catch(() => null),
        authService.listWebhooks().catch(() => ({ webhooks: [] })),
      ]);
      setUsage(u);
      setWebhooks(w.webhooks ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, []);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => { await logout(); router.replace('/(auth)/login'); } },
    ]);
  };

  const handleAddWebhook = async () => {
    const url = newWhUrl.trim();
    if (!url.startsWith('http')) { Alert.alert('Invalid', 'URL must start with http(s)://'); return; }
    setAddingWh(true);
    try {
      const wh = await authService.createWebhook(url, ['message.created', 'video_call.started']);
      setWebhooks((prev) => [...prev, wh]);
      setNewWhUrl('');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to add webhook.');
    } finally {
      setAddingWh(false);
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    try {
      await authService.deleteWebhook(webhookId);
      setWebhooks((prev) => prev.filter((w) => w.webhook_id !== webhookId));
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to delete webhook.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Profile section */}
        <Text style={styles.sectionTitle}>Profile</Text>
        <Card style={styles.card}>
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>User ID</Text>
            <Text style={styles.profileValue}>{user?.userId}</Text>
          </View>
          <View style={[styles.profileRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.profileLabel}>API Base URL</Text>
            <Text style={styles.profileValue} numberOfLines={1}>{user?.baseUrl}</Text>
          </View>
        </Card>

        {/* Language */}
        <Text style={styles.sectionTitle}>Language</Text>
        <View style={styles.langRow}>
          {LANGUAGES.map((l) => (
            <TouchableOpacity
              key={l.code}
              style={[styles.langChip, user?.langCode === l.code && styles.langChipActive]}
              onPress={() => updateLang(l.code)}
            >
              <Text style={[styles.langChipText, user?.langCode === l.code && { color: colors.white }]}>{l.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Usage stats */}
        <Text style={styles.sectionTitle}>API Usage</Text>
        <Card style={styles.card}>
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : usage ? (
            <>
              <UsageRow label="Chat Messages" value={usage.chat_messages_sent} limit={usage.plan_limits?.chat_messages} />
              <UsageRow label="Video Minutes"  value={usage.video_minutes}    limit={usage.plan_limits?.video_minutes} />
              <UsageRow label="Stream Minutes" value={usage.stream_minutes}   limit={usage.plan_limits?.stream_minutes} />
              <UsageRow label="Translations"   value={usage.translations}     limit={usage.plan_limits?.translations} />
            </>
          ) : (
            <Text style={styles.errorText}>Unable to load usage stats.</Text>
          )}
        </Card>

        {/* Webhooks */}
        <Text style={styles.sectionTitle}>Webhooks</Text>
        <Card style={styles.card}>
          {webhooks.map((wh) => (
            <WebhookRow key={wh.webhook_id} wh={wh} onDelete={() => handleDeleteWebhook(wh.webhook_id)} />
          ))}
          {webhooks.length === 0 && !loading && (
            <Text style={styles.emptyText}>No webhooks registered</Text>
          )}
          <View style={styles.whAddRow}>
            <TextInput
              style={styles.whInput}
              placeholder="https://your-server.com/webhook"
              placeholderTextColor={colors.textMuted}
              value={newWhUrl}
              onChangeText={setNewWhUrl}
              autoCapitalize="none"
            />
            <Button label={addingWh ? '…' : 'Add'} onPress={handleAddWebhook} disabled={addingWh} size="sm" />
          </View>
        </Card>

        {/* Logout */}
        <Button label="Logout" variant="danger" onPress={handleLogout} fullWidth style={{ marginTop: spacing[4] }} />
        <View style={{ height: spacing[8] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: colors.background },
  scroll:         { flex: 1 },
  content:        { padding: spacing[5] },

  sectionTitle:   { ...textPresets.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing[3], marginTop: spacing[6] },
  card:           { padding: spacing[4] },

  profileRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  profileLabel:   { ...textPresets.label, color: colors.textSecondary },
  profileValue:   { ...textPresets.label, color: colors.text, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: spacing[4] },

  langRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  langChip:       { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: borderRadius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  langChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langChipText:   { ...textPresets.label, color: colors.textSecondary },

  usageRow:       { paddingVertical: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  usageRowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing[2] },
  usageLabel:     { ...textPresets.label, color: colors.textSecondary },
  usageValue:     { ...textPresets.label, color: colors.text, fontWeight: '600' },
  usageBar:       { height: 4, backgroundColor: colors.surface, borderRadius: 2, overflow: 'hidden' },
  usageBarFill:   { height: '100%', borderRadius: 2 },

  webhookRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: spacing[3] },
  webhookUrl:     { ...textPresets.label, color: colors.text, fontWeight: '600' },
  webhookEvents:  { ...textPresets.caption, color: colors.textMuted },
  webhookActions: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  whStatus:       { width: 8, height: 8, borderRadius: 4 },
  whAddRow:       { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[4] },
  whInput:        { flex: 1, ...textPresets.body, color: colors.text, backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },

  emptyText:      { ...textPresets.label, color: colors.textMuted, paddingVertical: spacing[4], textAlign: 'center' },
  errorText:      { ...textPresets.label, color: colors.error, textAlign: 'center', padding: spacing[4] },
});
