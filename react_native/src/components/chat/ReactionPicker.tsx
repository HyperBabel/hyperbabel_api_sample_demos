/**
 * HyperBabel Demo — ReactionPicker Component
 *
 * Emoji reaction picker shown when the user long-presses a message.
 * Displays a horizontal row of frequently-used emojis.
 *
 * Props:
 *  - onSelect: called with the chosen emoji string
 *  - onClose:  called when the picker is dismissed
 */

import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, Pressable,
} from 'react-native';
import { colors, spacing, borderRadius, shadows } from '@/theme';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥'];

interface ReactionPickerProps {
  visible:  boolean;
  onSelect: (emoji: string) => void;
  onClose:  () => void;
}

export function ReactionPicker({ visible, onSelect, onClose }: ReactionPickerProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.picker}>
          {QUICK_REACTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={styles.reactionBtn}
              onPress={() => { onSelect(emoji); onClose(); }}
              activeOpacity={0.7}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  picker:      { flexDirection: 'row', backgroundColor: colors.cardElevated, borderRadius: borderRadius['2xl'], padding: spacing[3], gap: spacing[1], borderWidth: 1, borderColor: colors.glassBorder, ...shadows.lg },
  reactionBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.lg },
  emoji:       { fontSize: 26 },
});
