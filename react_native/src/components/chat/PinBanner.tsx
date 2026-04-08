/**
 * HyperBabel Demo — PinBanner Component
 *
 * Displays the currently pinned message in a room
 * as a fixed banner below the room header.
 * Tapping the banner scrolls to / highlights the pinned message.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, textPresets } from '@/theme';
import type { Message } from '@/services/unitedChatService';

interface PinBannerProps {
  message:    Message;
  onPress?:   () => void;
  onUnpin?:   () => void;
  showUnpin?: boolean;
}

export function PinBanner({ message, onPress, onUnpin, showUnpin }: PinBannerProps) {
  // message.content may be a multilingual object {en: '...', ko: '...'} or a plain string.
  const rawContent = message.content;
  const contentStr = rawContent && typeof rawContent === 'object'
    ? (rawContent['en'] || Object.values(rawContent)[0] || '')
    : (rawContent ?? '');

  const preview =
    message.message_type !== 'text'
      ? `[${message.message_type}]`
      : contentStr.length > 80
      ? `${contentStr.slice(0, 80)}…`
      : contentStr;

  return (
    <TouchableOpacity style={styles.banner} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.accent} />
      <View style={styles.body}>
        <Text style={styles.label}>📌 Pinned Message</Text>
        <Text style={styles.preview} numberOfLines={1}>{preview}</Text>
      </View>
      {showUnpin && (
        <TouchableOpacity style={styles.unpinBtn} onPress={onUnpin} hitSlop={8}>
          <Text style={styles.unpinText}>✕</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner:    { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  accent:    { width: 3, backgroundColor: colors.primary, alignSelf: 'stretch', marginRight: spacing[3] },
  body:      { flex: 1, paddingVertical: spacing[3], paddingRight: spacing[2] },
  label:     { ...textPresets.caption, color: colors.primary, fontWeight: '700', marginBottom: 2 },
  preview:   { ...textPresets.caption, color: colors.textSecondary },
  unpinBtn:  { padding: spacing[4] },
  unpinText: { color: colors.textMuted, fontSize: 14 },
});
