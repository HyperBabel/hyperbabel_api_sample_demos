/**
 * HyperBabel Demo — 404 Not Found Screen
 * Caught by Expo Router for any unmatched route.
 */

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing, textPresets, borderRadius } from '@/theme';

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.code}>404</Text>
      <Text style={styles.title}>Page Not Found</Text>
      <Text style={styles.subtitle}>The screen you&apos;re looking for doesn&apos;t exist.</Text>
      <TouchableOpacity style={styles.btn} onPress={() => router.replace('/')}>
        <Text style={styles.btnText}>Go Home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing[8] },
  code:      { fontSize: 72, fontWeight: '800', color: colors.primary, marginBottom: spacing[3] },
  title:     { ...textPresets.h3, color: colors.text, marginBottom: spacing[2] },
  subtitle:  { ...textPresets.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing[8] },
  btn:       { backgroundColor: colors.primary, paddingHorizontal: spacing[8], paddingVertical: spacing[4], borderRadius: borderRadius.xl },
  btnText:   { ...textPresets.label, color: colors.white, fontWeight: '700' },
});
