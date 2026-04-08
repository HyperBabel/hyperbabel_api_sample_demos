/**
 * HyperBabel Demo — Card Component
 *
 * Glassmorphism-style card with dark background, subtle border, and optional shadow.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, borderRadius, shadows } from '@/theme';

interface CardProps {
  children:   React.ReactNode;
  style?:     ViewStyle;
  elevated?:  boolean;   // uses cardElevated background
  shadow?:    boolean;
  padding?:   number;
}

export function Card({ children, style, elevated = false, shadow = false, padding = spacing[4] }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        { padding },
        elevated && styles.elevated,
        shadow  && shadows.md,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor:  colors.card,
    borderRadius:     borderRadius.xl,
    borderWidth:      1,
    borderColor:      colors.glassBorder,
  },
  elevated: {
    backgroundColor: colors.cardElevated,
  },
});
