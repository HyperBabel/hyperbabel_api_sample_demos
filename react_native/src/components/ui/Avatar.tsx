/**
 * HyperBabel Demo — Avatar Component
 *
 * Displays a user's initials inside a gradient circle, with an optional
 * presence indicator dot (online / away / dnd / offline).
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, borderRadius } from '@/theme';

type PresenceStatus = 'online' | 'away' | 'dnd' | 'offline';

interface AvatarProps {
  name:       string;         // Used to derive initials and gradient
  size?:      number;         // Diameter in dp (default: 40)
  presence?:  PresenceStatus;
  style?:     ViewStyle;
}

const PRESENCE_COLOR: Record<PresenceStatus, string> = {
  online:  colors.presenceOnline,
  away:    colors.presenceAway,
  dnd:     colors.presenceDnd,
  offline: colors.presenceOffline,
};

// Deterministic gradient from name (cycles through a set of brand gradients)
const GRADIENTS: Array<[string, string]> = [
  ['#6366f1', '#8b5cf6'],
  ['#0891b2', '#06b6d4'],
  ['#059669', '#10b981'],
  ['#d97706', '#f59e0b'],
  ['#dc2626', '#ef4444'],
  ['#7c3aed', '#a855f7'],
];

function getGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function Avatar({ name, size = 40, presence, style }: AvatarProps) {
  const gradient  = getGradient(name);
  const initials  = getInitials(name);
  const fontSize  = Math.round(size * 0.38);
  const dotSize   = Math.round(size * 0.28);
  const dotOffset = Math.round(size * 0.04);

  return (
    <View style={[{ width: size, height: size }, style]}>
      <LinearGradient
        colors={gradient}
        style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
      </LinearGradient>

      {presence && (
        <View
          style={[
            styles.presenceDot,
            {
              width:            dotSize,
              height:           dotSize,
              borderRadius:     dotSize / 2,
              backgroundColor:  PRESENCE_COLOR[presence],
              bottom:           dotOffset,
              right:            dotOffset,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems:      'center',
    justifyContent:  'center',
    overflow:        'hidden',
  },
  initials: {
    color:       colors.white,
    fontWeight:  '700',
  },
  presenceDot: {
    position:    'absolute',
    borderWidth: 2,
    borderColor: colors.background,
  },
});
