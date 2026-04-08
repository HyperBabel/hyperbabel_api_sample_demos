/**
 * HyperBabel Demo — Dashboard (Sandbox Hub)
 *
 * Home screen after login. Shows:
 *  - Welcome greeting with user info
 *  - Feature grid (Chat, Video Call, Live Stream, Settings)
 *  - Quick stats (presence status, unread count placeholder)
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { colors, spacing, textPresets, borderRadius, shadows } from '@/theme';

// ── Feature cards data ────────────────────────────────────────────────────

const FEATURES = [
  {
    id:       'chat',
    icon:     '💬',
    title:    'United Chat',
    subtitle: '1:1, Group, Open Rooms',
    gradient: ['#4f46e5', '#6366f1'] as [string, string],
    onPress:  () => router.push('/(main)/chat'),
  },
  {
    id:       'video',
    icon:     '📹',
    title:    'Video Calls',
    subtitle: '1:1 & Group',
    gradient: ['#7c3aed', '#8b5cf6'] as [string, string],
    onPress:  () => router.push('/(main)/chat'),
  },
  {
    id:       'stream',
    icon:     '📡',
    title:    'Live Stream',
    subtitle: 'Host & Viewer',
    gradient: ['#0891b2', '#06b6d4'] as [string, string],
    onPress:  () => router.push('/(main)/streams'),
  },
  {
    id:       'translate',
    icon:     '🌐',
    title:    'AI Translation',
    subtitle: 'Auto & Batch',
    gradient: ['#059669', '#10b981'] as [string, string],
    onPress:  () => router.push('/(main)/chat'),
  },
  {
    id:       'storage',
    icon:     '📁',
    title:    'File Storage',
    subtitle: '3-Step Presign Upload',
    gradient: ['#d97706', '#f59e0b'] as [string, string],
    onPress:  () => router.push('/(main)/chat'),
  },
  {
    id:       'settings',
    icon:     '⚙️',
    title:    'Settings',
    subtitle: 'Usage, Webhooks, Push',
    gradient: ['#475569', '#64748b'] as [string, string],
    onPress:  () => router.push('/(main)/settings'),
  },
] as const;

// ── Component ─────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { user } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header gradient */}
        <LinearGradient
          colors={['#0a0a0f', '#12121a']}
          style={styles.headerGradient}
        >
          {/* Status bar area */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Welcome back 👋</Text>
              <Text style={styles.userName}>{user?.userName ?? user?.userId}</Text>
            </View>
            {/* Presence dot */}
            <View style={styles.presenceBadge}>
              <View style={styles.presenceDot} />
              <Text style={styles.presenceText}>Online</Text>
            </View>
          </View>

          {/* Hero card */}
          <View style={styles.heroCard}>
            <LinearGradient
              colors={colors.gradientBrand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            >
              <Text style={styles.heroTitle}>HyperBabel API</Text>
              <Text style={styles.heroSubtitle}>
                Explore real-time chat, HD video calls, live streaming, and AI translation — all from one unified API.
              </Text>
              <View style={styles.heroStats}>
                {[
                  { label: 'Chat APIs',    value: '31+' },
                  { label: 'Video APIs',   value: '12+' },
                  { label: 'Languages',    value: '50+' },
                ].map((stat) => (
                  <View key={stat.label} style={styles.heroStat}>
                    <Text style={styles.heroStatValue}>{stat.value}</Text>
                    <Text style={styles.heroStatLabel}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            </LinearGradient>
          </View>
        </LinearGradient>

        {/* Feature grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Features</Text>
          <View style={styles.grid}>
            {FEATURES.map((feat) => (
              <TouchableOpacity
                key={feat.id}
                style={styles.featureCard}
                onPress={feat.onPress}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={feat.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.featureGradient}
                >
                  <Text style={styles.featureIcon}>{feat.icon}</Text>
                </LinearGradient>
                <View style={styles.featureInfo}>
                  <Text style={styles.featureTitle}>{feat.title}</Text>
                  <Text style={styles.featureSubtitle}>{feat.subtitle}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* User info chip */}
        <View style={styles.userChip}>
          <Text style={styles.userChipLabel}>Logged in as</Text>
          <Text style={styles.userChipValue}>{user?.userId}</Text>
          <Text style={styles.userChipSep}>·</Text>
          <Text style={styles.userChipValue}>{user?.langCode?.toUpperCase()}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: colors.background },
  scroll:           { flex: 1 },
  content:          { paddingBottom: spacing[10] },

  headerGradient:   { paddingHorizontal: spacing[5], paddingTop: spacing[4], paddingBottom: spacing[2] },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[5] },
  greeting:         { ...textPresets.label, color: colors.textSecondary },
  userName:         { ...textPresets.h3, color: colors.text },
  presenceBadge:    { flexDirection: 'row', alignItems: 'center', gap: spacing[1], backgroundColor: colors.card, paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border },
  presenceDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.presenceOnline },
  presenceText:     { ...textPresets.caption, color: colors.presenceOnline, fontWeight: '600' },

  heroCard:         { borderRadius: borderRadius['2xl'], overflow: 'hidden', marginBottom: spacing[6], ...shadows.lg },
  heroGradient:     { padding: spacing[6] },
  heroTitle:        { ...textPresets.h2, color: colors.white, marginBottom: spacing[2] },
  heroSubtitle:     { ...textPresets.body, color: 'rgba(255,255,255,0.8)', marginBottom: spacing[5] },
  heroStats:        { flexDirection: 'row', gap: spacing[6] },
  heroStat:         { alignItems: 'center' },
  heroStatValue:    { ...textPresets.h3, color: colors.white, fontWeight: '800' },
  heroStatLabel:    { ...textPresets.caption, color: 'rgba(255,255,255,0.7)' },

  section:          { paddingHorizontal: spacing[5] },
  sectionTitle:     { ...textPresets.h4, color: colors.text, marginBottom: spacing[4] },

  grid:             { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  featureCard:      { width: '47.5%', backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing[4], borderWidth: 1, borderColor: colors.glassBorder, ...shadows.sm },
  featureGradient:  { width: 44, height: 44, borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[3] },
  featureIcon:      { fontSize: 22 },
  featureInfo:      {},
  featureTitle:     { ...textPresets.label, color: colors.text, fontWeight: '700', marginBottom: 2 },
  featureSubtitle:  { ...textPresets.caption, color: colors.textSecondary },

  userChip:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], marginTop: spacing[6], paddingHorizontal: spacing[5] },
  userChipLabel:    { ...textPresets.caption, color: colors.textMuted },
  userChipValue:    { ...textPresets.caption, color: colors.textSecondary, fontWeight: '600' },
  userChipSep:      { ...textPresets.caption, color: colors.textMuted },
});
