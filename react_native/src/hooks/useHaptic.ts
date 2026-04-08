/**
 * HyperBabel Demo — useHaptic Hook
 *
 * Wraps expo-haptics for consistent haptic feedback across the app.
 * Falls back gracefully on devices with no haptic engine.
 */

import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';

export function useHaptic() {
  const light = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const medium = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  const heavy = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }, []);

  const success = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const error = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, []);

  const selection = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);

  return { light, medium, heavy, success, error, selection };
}
