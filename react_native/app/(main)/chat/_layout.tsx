/**
 * HyperBabel Demo — Chat Stack Layout
 * Provides a Stack navigator for:
 *   /chat          → index.tsx  (Room list)
 *   /chat/:roomId  → [roomId].tsx (Chat room)
 */

import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function ChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown:       false,
        contentStyle:      { backgroundColor: colors.background },
        animation:         'slide_from_right',
        animationDuration: 220,
      }}
    />
  );
}
