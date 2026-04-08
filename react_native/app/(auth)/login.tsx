/**
 * HyperBabel Demo — Login Screen
 *
 * Auth flow (same simplified pattern as the React web demo):
 *  1. User enters a User ID and an optional Display Name.
 *  2. User selects their preferred language (BCP-47).
 *  3. User enters the HyperBabel API Key and (optionally) a custom base URL.
 *  4. On "Login", values are saved to SecureStore via AuthContext.login().
 *
 * No real authentication server call is made — this is a demo.
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
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { colors, spacing, textPresets, borderRadius } from '@/theme';

// ── Language options ──────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
];

const DEFAULT_BASE_URL = 'https://api.hyperbabel.com/api/v1';

// ── Component ─────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const { login } = useAuth();

  const [userId,   setUserId]   = useState('');
  const [userName, setUserName] = useState('');
  const [langCode, setLangCode] = useState('en');
  const [apiKey,   setApiKey]   = useState('');
  const [baseUrl,  setBaseUrl]  = useState(DEFAULT_BASE_URL);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async () => {
    const uid    = userId.trim();
    const uname  = userName.trim() || uid;
    const key    = apiKey.trim();
    const url    = baseUrl.trim() || DEFAULT_BASE_URL;

    if (!uid)  { Alert.alert('Required', 'Please enter a User ID.'); return; }
    if (!key)  { Alert.alert('Required', 'Please enter your HyperBabel API Key.'); return; }

    setLoading(true);
    try {
      await login({ userId: uid, userName: uname, langCode, apiKey: key, baseUrl: url });
      router.replace('/(main)/dashboard');
    } catch (err) {
      Alert.alert('Error', 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
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
          {/* Logo */}
          <View style={styles.logoSection}>
            <LinearGradient
              colors={colors.gradientBrand}
              style={styles.logoGradient}
            >
              <Text style={styles.logoText}>HB</Text>
            </LinearGradient>
            <Text style={styles.appName}>HyperBabel Demo</Text>
            <Text style={styles.appSubtitle}>API Integration Sample</Text>
          </View>

          {/* Form card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome</Text>
            <Text style={styles.cardSubtitle}>
              Enter your User ID and API Key to explore all HyperBabel features.
            </Text>

            {/* User ID */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>User ID *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. user_alice"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                value={userId}
                onChangeText={setUserId}
              />
            </View>

            {/* Display Name */}
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

            {/* Language */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Preferred Language</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.langScroll}
              >
                {LANGUAGES.map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.langChip,
                      langCode === lang.code && styles.langChipActive,
                    ]}
                    onPress={() => setLangCode(lang.code)}
                  >
                    <Text
                      style={[
                        styles.langChipText,
                        langCode === lang.code && styles.langChipTextActive,
                      ]}
                    >
                      {lang.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* API Key */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>HyperBabel API Key *</Text>
              <TextInput
                style={styles.input}
                placeholder="hb_live_xxxxxxxxxxxxxxxxxxxx"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                value={apiKey}
                onChangeText={setApiKey}
              />
              <Text style={styles.fieldHint}>
                Get your key from HyperBabel Console → API Keys
              </Text>
            </View>

            {/* Advanced */}
            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => setShowAdvanced((v) => !v)}
            >
              <Text style={styles.advancedToggleText}>
                {showAdvanced ? '▲' : '▼'}  Advanced Settings
              </Text>
            </TouchableOpacity>

            {showAdvanced && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>API Base URL</Text>
                <TextInput
                  style={styles.input}
                  placeholder={DEFAULT_BASE_URL}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={baseUrl}
                  onChangeText={setBaseUrl}
                />
                <Text style={styles.fieldHint}>
                  Leave as-is for production. Use http://localhost:8080/api/v1 for local dev.
                </Text>
              </View>
            )}

            {/* Login button */}
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={colors.gradientBrand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginBtnGradient}
              >
                {loading
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.loginBtnText}>Login</Text>
                }
              </LinearGradient>
            </TouchableOpacity>

            {/* Sign up link */}
            <TouchableOpacity
              style={styles.signupLink}
              onPress={() => router.push('/(auth)/signup')}
            >
              <Text style={styles.signupLinkText}>
                New here?{' '}
                <Text style={styles.signupLinkHighlight}>Create a demo account</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  gradient:       { flex: 1 },
  flex:           { flex: 1 },
  container:      { flexGrow: 1, justifyContent: 'center', padding: spacing[5], paddingBottom: spacing[10] },

  logoSection:    { alignItems: 'center', marginBottom: spacing[8] },
  logoGradient:   { width: 72, height: 72, borderRadius: borderRadius.xl, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[4] },
  logoText:       { ...textPresets.h2, color: colors.white, fontWeight: '800' },
  appName:        { ...textPresets.h3, color: colors.text, marginBottom: spacing[1] },
  appSubtitle:    { ...textPresets.label, color: colors.textMuted },

  card:           { backgroundColor: colors.card, borderRadius: borderRadius['2xl'], padding: spacing[6], borderWidth: 1, borderColor: colors.glassBorder },
  cardTitle:      { ...textPresets.h3, color: colors.text, marginBottom: spacing[1] },
  cardSubtitle:   { ...textPresets.label, color: colors.textSecondary, marginBottom: spacing[6] },

  field:          { marginBottom: spacing[4] },
  fieldLabel:     { ...textPresets.caption, color: colors.textSecondary, marginBottom: spacing[2], fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldHint:      { ...textPresets.caption, color: colors.textMuted, marginTop: spacing[2] },
  input:          {
    backgroundColor:  colors.surface,
    borderRadius:     borderRadius.lg,
    borderWidth:      1,
    borderColor:      colors.border,
    paddingHorizontal: spacing[4],
    paddingVertical:  spacing[3],
    color:            colors.text,
    ...textPresets.body,
  },

  langScroll:     { gap: spacing[2], paddingVertical: spacing[1] },
  langChip:       { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: borderRadius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  langChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langChipText:   { ...textPresets.label, color: colors.textSecondary },
  langChipTextActive: { color: colors.white, fontWeight: '600' },

  advancedToggle: { marginBottom: spacing[4] },
  advancedToggleText: { ...textPresets.label, color: colors.primary },

  loginBtn:       { marginTop: spacing[2], borderRadius: borderRadius.xl, overflow: 'hidden' },
  loginBtnGradient: { paddingVertical: spacing[4], alignItems: 'center', justifyContent: 'center' },
  loginBtnText:   { ...textPresets.bodyMd, color: colors.white, fontWeight: '700' },

  signupLink:     { marginTop: spacing[4], alignItems: 'center' },
  signupLinkText: { ...textPresets.label, color: colors.textMuted },
  signupLinkHighlight: { color: colors.primaryLight, fontWeight: '600' },
});
