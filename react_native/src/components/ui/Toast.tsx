/**
 * HyperBabel Demo — Toast Component
 *
 * Animated slide-in notification toast (shown from top of screen).
 * Used for push notification foreground display and error feedback.
 *
 * Usage:
 *   import { useToast } from '@/components/ui/Toast';
 *   const { show } = useToast();
 *   show({ title: 'Message received', message: 'Alice: Hello!', type: 'success' });
 */

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, SafeAreaView } from 'react-native';
import { colors, spacing, textPresets, borderRadius, shadows } from '@/theme';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id:       number;
  title:    string;
  message?: string;
  type:     ToastType;
}

interface ToastContextValue {
  show: (params: { title: string; message?: string; type?: ToastType }) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

const TYPE_COLOR: Record<ToastType, string> = {
  success: colors.success,
  error:   colors.error,
  info:    colors.primary,
  warning: colors.warning,
};

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const translateY = useRef(new Animated.Value(-80)).current;

  React.useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();

    const timer = setTimeout(() => {
      Animated.timing(translateY, { toValue: -80, duration: 200, useNativeDriver: true }).start(onDismiss);
    }, 3500);

    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View style={[styles.toast, { transform: [{ translateY }] }]}>
      <View style={[styles.accent, { backgroundColor: TYPE_COLOR[item.type] }]} />
      <View style={styles.toastContent}>
        <Text style={styles.toastTitle} numberOfLines={1}>{item.title}</Text>
        {item.message && <Text style={styles.toastMessage} numberOfLines={2}>{item.message}</Text>}
      </View>
      <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.dismiss}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback(({ title, message, type = 'info' }: { title: string; message?: string; type?: ToastType }) => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-2), { id, title, message, type }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </SafeAreaView>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

// Named export alias for the barrel
export const Toast = ToastProvider;

const styles = StyleSheet.create({
  overlay:       { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999, pointerEvents: 'box-none' },
  toast:         { flexDirection: 'row', alignItems: 'center', margin: spacing[4], backgroundColor: colors.cardElevated, borderRadius: borderRadius.xl, overflow: 'hidden', ...shadows.md, borderWidth: 1, borderColor: colors.border },
  accent:        { width: 4, alignSelf: 'stretch' },
  toastContent:  { flex: 1, padding: spacing[4] },
  toastTitle:    { ...textPresets.label, color: colors.text, fontWeight: '700' },
  toastMessage:  { ...textPresets.caption, color: colors.textSecondary, marginTop: 2 },
  dismiss:       { color: colors.textMuted, paddingRight: spacing[4], fontSize: 14 },
});
