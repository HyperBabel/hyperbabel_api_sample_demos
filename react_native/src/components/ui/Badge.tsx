/**
 * HyperBabel Demo — Badge Component
 *
 * Small status indicator pill.
 * Variants: default (surface), primary, success, error, warning
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, borderRadius, textPresets } from '@/theme';

type Variant = 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info';

interface BadgeProps {
  label:    string | number;
  variant?: Variant;
  style?:   ViewStyle;
}

const STYLES: Record<Variant, { bg: string; text: string }> = {
  default: { bg: colors.surface,     text: colors.textSecondary },
  primary: { bg: colors.primary,     text: colors.white },
  success: { bg: colors.success,     text: colors.white },
  error:   { bg: colors.error,       text: colors.white },
  warning: { bg: colors.warning,     text: colors.black },
  info:    { bg: colors.info,        text: colors.white },
};

export function Badge({ label, variant = 'default', style }: BadgeProps) {
  const s = STYLES[variant];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }, style]}>
      <Text style={[styles.label, { color: s.text }]}>{String(label)}</Text>
    </View>
  );
}

// Numeric unread count badge (the small circle on room list items)
interface UnreadBadgeProps { count: number }
export function UnreadBadge({ count }: UnreadBadgeProps) {
  if (!count) return null;
  const display = count > 99 ? '99+' : String(count);
  return (
    <View style={styles.unreadBadge}>
      <Text style={styles.unreadText}>{display}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing[2],
    paddingVertical:   2,
    borderRadius:      borderRadius.full,
    alignSelf:         'flex-start',
  },
  label: {
    ...textPresets.caption,
    fontWeight: '600',
  },
  unreadBadge: {
    minWidth:          20,
    height:            20,
    backgroundColor:   colors.error,
    borderRadius:      borderRadius.full,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 4,
  },
  unreadText: {
    ...textPresets.caption,
    color:      colors.white,
    fontWeight: '700',
    fontSize:   10,
  },
});
