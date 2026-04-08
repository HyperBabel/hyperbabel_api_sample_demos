/**
 * HyperBabel Demo — Auth Group Layout
 *
 * Simple stack layout for authentication screens.
 * No header shown — auth screens manage their own chrome.
 */

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
