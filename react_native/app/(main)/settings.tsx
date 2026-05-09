/**
 * HyperBabel Demo — Settings Screen
 *
 * Provides configuration and monitoring panels:
 *  - Profile info (userId, base URL)
 *  - Language preference update
 *  - Privacy → Blocked Users link
 *  - API usage statistics (current billing period)
 *  - Push notification token list
 *  - Language detection playground
 *  - Logout
 *
 * Webhooks are managed in the HyperBabel Console (https://console.hyperbabel.com),
 * not from this demo, because webhook CRUD is a tenant-admin operation that
 * requires a Console session and is not exposed to API keys.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, TextInput, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, spacing, textPresets, borderRadius } from '@/theme';
import * as authService from '@/services/authService';
import * as pushService from '@/services/pushService';
import * as translateService from '@/services/translateService';
import type { UsageStats } from '@/services/authService';

type PushTokenRow = { token: string; platform: 'ios' | 'android' | 'web'; created_at: string };

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

// ── Push token row ────────────────────────────────────────────────────────

function PushTokenItem({ row }: { row: PushTokenRow }) {
  const short = row.token.length > 24 ? `${row.token.slice(0, 16)}…${row.token.slice(-4)}` : row.token;
  return (
    <View style={styles.pushRow}>
      <View style={styles.pushPlatformPill}>
        <Text style={styles.pushPlatformText}>{row.platform}</Text>
      </View>
      <Text style={styles.pushToken} numberOfLines={1}>{short}</Text>
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
  const [usage,         setUsage]         = useState<UsageStats | null>(null);
  const [pushTokens,    setPushTokens]    = useState<PushTokenRow[]>([]);
  const [loading,       setLoading]       = useState(true);

  // Language detection playground state
  const [detectInput,   setDetectInput]   = useState('');
  const [detectResult,  setDetectResult]  = useState<string | null>(null);
  const [detecting,     setDetecting]     = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [u, t] = await Promise.all([
        authService.getUsage().catch(() => null),
        pushService.getTokens(user.userId).catch(() => ({ tokens: [] })),
      ]);
      setUsage(u);
      setPushTokens(t.tokens ?? []);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => { await logout(); router.replace('/(auth)/login'); } },
    ]);
  };

  const handleDetectLanguage = async () => {
    const text = detectInput.trim();
    if (!text) return;
    setDetecting(true);
    setDetectResult(null);
    try {
      const res = await translateService.detectLanguage(text);
      setDetectResult(`${res.language}  (${Math.round((res.confidence ?? 0) * 100)}% confidence)`);
    } catch (err: any) {
      setDetectResult(`Error: ${err?.message ?? 'Failed to detect language'}`);
    } finally {
      setDetecting(false);
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

        {/* Privacy → Blocked users */}
        <Text style={styles.sectionTitle}>Privacy</Text>
        <TouchableOpacity onPress={() => router.push('/(main)/blocks' as any)} activeOpacity={0.85}>
          <Card style={styles.card}>
            <View style={styles.linkRow}>
              <Text style={styles.linkLabel}>🚫  Blocked Users</Text>
              <Text style={styles.linkArrow}>›</Text>
            </View>
          </Card>
        </TouchableOpacity>

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

        {/* Push tokens */}
        <Text style={styles.sectionTitle}>Push Tokens</Text>
        <Card style={styles.card}>
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : pushTokens.length === 0 ? (
            <Text style={styles.emptyText}>No push tokens registered for this user yet.</Text>
          ) : (
            pushTokens.map((row, idx) => <PushTokenItem key={`${row.token}-${idx}`} row={row} />)
          )}
        </Card>

        {/* Language detection playground */}
        <Text style={styles.sectionTitle}>Language Detection</Text>
        <Card style={styles.card}>
          <Text style={styles.helperText}>
            Type any text and tap Detect to see what language the AI Translation
            engine identifies it as.
          </Text>
          <View style={styles.detectRow}>
            <TextInput
              style={styles.detectInput}
              placeholder="Type something to detect…"
              placeholderTextColor={colors.textMuted}
              value={detectInput}
              onChangeText={setDetectInput}
              autoCapitalize="none"
            />
            <Button
              label={detecting ? '…' : 'Detect'}
              onPress={handleDetectLanguage}
              disabled={detecting}
              size="sm"
            />
          </View>
          {detectResult && (
            <Text style={styles.detectResult}>{detectResult}</Text>
          )}
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

  linkRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkLabel:      { ...textPresets.label, color: colors.text, fontWeight: '600' },
  linkArrow:      { ...textPresets.h3, color: colors.textMuted },

  usageRow:       { paddingVertical: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  usageRowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing[2] },
  usageLabel:     { ...textPresets.label, color: colors.textSecondary },
  usageValue:     { ...textPresets.label, color: colors.text, fontWeight: '600' },
  usageBar:       { height: 4, backgroundColor: colors.surface, borderRadius: 2, overflow: 'hidden' },
  usageBarFill:   { height: '100%', borderRadius: 2 },

  pushRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: spacing[3] },
  pushPlatformPill: { paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: borderRadius.sm, backgroundColor: colors.primary },
  pushPlatformText: { ...textPresets.caption, color: colors.white, fontWeight: '700', textTransform: 'uppercase' },
  pushToken:      { ...textPresets.caption, color: colors.text, flex: 1 },

  detectRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[3] },
  detectInput:    { flex: 1, ...textPresets.body, color: colors.text, backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  detectResult:   { ...textPresets.label, color: colors.text, marginTop: spacing[3], padding: spacing[3], backgroundColor: colors.surface, borderRadius: borderRadius.lg },
  helperText:     { ...textPresets.caption, color: colors.textMuted },

  emptyText:      { ...textPresets.label, color: colors.textMuted, paddingVertical: spacing[4], textAlign: 'center' },
  errorText:      { ...textPresets.label, color: colors.error, textAlign: 'center', padding: spacing[4] },
});
