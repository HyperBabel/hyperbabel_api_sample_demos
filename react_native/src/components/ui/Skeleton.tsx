/**
 * HyperBabel Demo — Skeleton Loading Component
 *
 * Shimmer-effect placeholder for loading states (message lists, room lists, etc.)
 * Uses React Native's Animated API (no extra dependency).
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle, DimensionValue } from 'react-native';
import { colors, borderRadius } from '@/theme';

interface SkeletonProps {
  width?:   DimensionValue;
  height?:  number;
  radius?:  number;
  style?:   ViewStyle;
}

export function Skeleton({ width = '100%', height = 16, radius = borderRadius.md, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, borderRadius: radius, opacity },
        style,
      ]}
    />
  );
}

// Pre-made chat room list skeleton row
export function RoomItemSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton width={44} height={44} radius={22} />
      <View style={styles.lines}>
        <Skeleton width="55%" height={14} />
        <Skeleton width="80%" height={12} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { backgroundColor: colors.border },
  row:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  lines:    { flex: 1, gap: 4 },
});
