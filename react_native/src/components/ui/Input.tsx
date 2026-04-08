/**
 * HyperBabel Demo — Input Component
 *
 * Text input with floating label, optional icon, error message, and variants.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { colors, spacing, textPresets, borderRadius } from '@/theme';

interface InputProps extends TextInputProps {
  label?:       string;
  error?:       string;
  hint?:        string;
  rightIcon?:   React.ReactNode;
  onRightPress?: () => void;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  hint,
  rightIcon,
  onRightPress,
  containerStyle,
  ...props
}: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}

      <View style={[
        styles.inputWrap,
        focused && styles.inputWrapFocused,
        !!error && styles.inputWrapError,
      ]}>
        <TextInput
          style={styles.input}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
        {rightIcon && (
          <TouchableOpacity
            onPress={onRightPress}
            disabled={!onRightPress}
            style={styles.rightIcon}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {rightIcon}
          </TouchableOpacity>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {hint && !error && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { gap: spacing[2] },
  label:            { ...textPresets.caption, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrap:        { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border },
  inputWrapFocused: { borderColor: colors.primary },
  inputWrapError:   { borderColor: colors.error },
  input:            { flex: 1, ...textPresets.body, color: colors.text, paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  rightIcon:        { paddingHorizontal: spacing[3] },
  error:            { ...textPresets.caption, color: colors.error },
  hint:             { ...textPresets.caption, color: colors.textMuted },
});
