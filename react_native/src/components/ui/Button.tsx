/**
 * HyperBabel Demo — Button Component
 *
 * Variants: primary (gradient fill), secondary (outline), ghost (text only), danger (red)
 * States: default, loading, disabled
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, textPresets, borderRadius } from '@/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size    = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label:        string;
  onPress:      () => void;
  variant?:     Variant;
  size?:        Size;
  loading?:     boolean;
  disabled?:    boolean;
  style?:       ViewStyle;
  labelStyle?:  TextStyle;
  icon?:        React.ReactNode;
  fullWidth?:   boolean;
}

const SIZE_MAP: Record<Size, { paddingH: number; paddingV: number; fontSize: number }> = {
  sm: { paddingH: spacing[3], paddingV: spacing[2],  fontSize: 13 },
  md: { paddingH: spacing[5], paddingV: spacing[3],  fontSize: 15 },
  lg: { paddingH: spacing[6], paddingV: spacing[4],  fontSize: 16 },
};

export function Button({
  label,
  onPress,
  variant  = 'primary',
  size     = 'md',
  loading  = false,
  disabled = false,
  style,
  labelStyle,
  icon,
  fullWidth = false,
}: ButtonProps) {
  const sz   = SIZE_MAP[size];
  const isDisabled = disabled || loading;

  const content = (
    <View style={[styles.inner, { paddingHorizontal: sz.paddingH, paddingVertical: sz.paddingV }]}>
      {loading
        ? <ActivityIndicator size="small" color={variant === 'primary' || variant === 'danger' ? colors.white : colors.primary} />
        : (
          <>
            {icon && <View style={styles.iconWrap}>{icon}</View>}
            <Text
              style={[
                styles.label,
                { fontSize: sz.fontSize },
                variant === 'primary'   && styles.labelPrimary,
                variant === 'secondary' && styles.labelSecondary,
                variant === 'ghost'     && styles.labelGhost,
                variant === 'danger'    && styles.labelDanger,
                isDisabled              && styles.labelDisabled,
                labelStyle,
              ]}
            >
              {label}
            </Text>
          </>
        )
      }
    </View>
  );

  const containerStyle: (ViewStyle | undefined)[] = [
    styles.btn,
    fullWidth ? styles.fullWidth : undefined,
    variant === 'secondary' ? styles.btnSecondary : undefined,
    variant === 'ghost'     ? styles.btnGhost     : undefined,
    variant === 'danger'    ? styles.btnDanger     : undefined,
    isDisabled              ? styles.btnDisabled   : undefined,
    style ?? undefined,
  ];

  if (variant === 'primary') {
    return (
      <TouchableOpacity
        style={containerStyle}
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={isDisabled ? ['#374151', '#374151'] : colors.gradientBrand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.gradient, { borderRadius: borderRadius.xl }]}
        >
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn:             { borderRadius: borderRadius.xl, overflow: 'hidden' },
  fullWidth:       { alignSelf: 'stretch' },
  gradient:        {},
  inner:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2] },
  iconWrap:        {},
  label:           { fontWeight: '600' },
  labelPrimary:    { color: colors.white },
  labelSecondary:  { color: colors.primary },
  labelGhost:      { color: colors.textSecondary },
  labelDanger:     { color: colors.white },
  labelDisabled:   { color: colors.textMuted },
  btnSecondary:    { borderWidth: 1, borderColor: colors.primary, backgroundColor: 'transparent' },
  btnGhost:        { backgroundColor: 'transparent' },
  btnDanger:       { backgroundColor: colors.error },
  btnDisabled:     { opacity: 0.6 },
});
