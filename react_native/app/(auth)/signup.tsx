/**
 * HyperBabel Demo — Sign Up Screen
 *
 * Demo-only registration screen.
 * In this demo there is no real server-side signup —
 * the user simply picks a User ID and is redirected back to Login.
 * The same simplified flow is used in the React web demo.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { colors, spacing, textPresets, borderRadius } from '@/theme';

export default function SignUpScreen() {
  const [userId,   setUserId]   = useState('');
  const [userName, setUserName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleCreate = () => {
    const uid = userId.trim();
    if (!uid) { 
      setErrorMsg('Please enter a User ID.'); 
      return; 
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(uid)) {
      setErrorMsg('USER ID can only contain letters, numbers, hyphens (-), and underscores (_).');
      return;
    }
    setErrorMsg('');
    // Navigate back to login with the chosen User ID pre-filled
    router.replace({ pathname: '/(auth)/login', params: { prefillUserId: uid, prefillUserName: userName.trim() || uid } });
  };

  return (
    <LinearGradient
      colors={['#0a0a0f', '#12121a', '#1a1a2e']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          {/* Heading */}
          <View style={styles.heading}>
            <Text style={styles.title}>Create Demo Account</Text>
            <Text style={styles.subtitle}>
              Choose a User ID to use throughout the demo. This is not a real account — no password or email required.
            </Text>
          </View>

          {/* Form card */}
          <View style={styles.card}>
            {!!errorMsg && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>
                User ID <Text style={{ textTransform: 'none', color: colors.textMuted, fontSize: 12, fontWeight: '400' }}>(Letters, numbers, -, _ only)</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. user_alice"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                value={userId}
                onChangeText={(val) => {
                  setUserId(val);
                  setErrorMsg('');
                }}
              />
              <Text style={styles.fieldHint}>
                3–32 characters · letters, numbers, _ or -
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Display Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Alice (optional)"
                placeholderTextColor={colors.textMuted}
                autoCorrect={false}
                value={userName}
                onChangeText={setUserName}
              />
            </View>

            <TouchableOpacity
              style={styles.createBtn}
              onPress={handleCreate}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={colors.gradientBrand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.createBtnGradient}
              >
                <Text style={styles.createBtnText}>Create Account</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient:        { flex: 1 },
  flex:            { flex: 1 },
  container:       { flexGrow: 1, padding: spacing[5], paddingTop: spacing[12] },

  back:            { marginBottom: spacing[6] },
  backText:        { ...textPresets.label, color: colors.primary },

  heading:         { marginBottom: spacing[6] },
  title:           { ...textPresets.h3, color: colors.text, marginBottom: spacing[2] },
  subtitle:        { ...textPresets.body, color: colors.textSecondary },

  card:            { backgroundColor: colors.card, borderRadius: borderRadius['2xl'], padding: spacing[6], borderWidth: 1, borderColor: colors.glassBorder },
  field:           { marginBottom: spacing[4] },
  fieldLabel:      { ...textPresets.caption, color: colors.textSecondary, marginBottom: spacing[2], fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldHint:       { ...textPresets.caption, color: colors.textMuted, marginTop: spacing[2] },
  input:           {
    backgroundColor:  colors.surface,
    borderRadius:     borderRadius.lg,
    borderWidth:      1,
    borderColor:      colors.border,
    paddingHorizontal: spacing[4],
    paddingVertical:  spacing[3],
    color:            colors.text,
    ...textPresets.body,
  },

  errorBox:        { backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: spacing[3], borderRadius: borderRadius.md, marginBottom: spacing[4] },
  errorText:       { ...textPresets.caption, color: '#ef4444', fontWeight: '600' },

  createBtn:          { marginTop: spacing[2], borderRadius: borderRadius.xl, overflow: 'hidden' },
  createBtnGradient:  { paddingVertical: spacing[4], alignItems: 'center', justifyContent: 'center' },
  createBtnText:      { ...textPresets.bodyMd, color: colors.white, fontWeight: '700' },
});
