/**
 * HyperBabel Demo — Login Screen
 *
 * Single mode: Customer Auth pattern B1 (Firebase Direct Exchange).
 *
 *   1. The user signs in with Firebase (email + password by default; we
 *      also expose a one-tap "Anonymous" path for kiosk-style exploration).
 *   2. We exchange the resulting Firebase ID token for a HyperBabel
 *      customer JWT via POST /customer/auth/firebase-exchange.
 *   3. The JWT pair is persisted to SecureStore by AuthContext and
 *      attached to every subsequent API request.
 *
 * The login screen always points at the production base URL; override only
 * with EXPO_PUBLIC_HB_API_URL in .env.local for private HyperBabel deployments.
 *
 * If the Firebase native config files are missing the screen renders a
 * setup-help block instead of the sign-in form — see firebase/README.md.
 */

import React, { useMemo, useState } from 'react';
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
import {
  isFirebaseReady,
  signInWithEmailAndExchange,
  signInAnonymouslyAndExchange,
  type FirebaseExchangeResult,
} from '@/services/firebaseAuthService';
import { colors, spacing, textPresets, borderRadius } from '@/theme';

// ── Language options ──────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어 (Korean)' },
  { code: 'ja', label: '日本語 (Japanese)' },
  { code: 'zh', label: '中文 (Chinese)' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'de', label: 'Deutsch (German)' },
  { code: 'pt', label: 'Português (Portuguese)' },
];

const PROD_BASE_URL =
  process.env.EXPO_PUBLIC_HB_API_URL ?? 'https://api.hyperbabel.com/api/v1';

// ── Component ─────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const { login } = useAuth();
  const firebaseReady = useMemo(() => isFirebaseReady(), []);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [userName, setUserName] = useState('');
  const [langCode, setLangCode] = useState('en');
  const [loading,  setLoading]  = useState(false);

  const finishLogin = async (
    result:         FirebaseExchangeResult,
    fallbackName:   string,
  ) => {
    const resolvedName = fallbackName.trim()
      || result.external_user_id.slice(0, 8);
    await login({
      userId:       result.external_user_id,
      userName:     resolvedName,
      langCode:     result.preferred_lang_cd ?? langCode,
      baseUrl:      PROD_BASE_URL,
      accessToken:  result.access_token,
      refreshToken: result.refresh_token,
      expiresAt:    result.expires_at,
    });
    router.replace('/(main)/dashboard');
  };

  const handleEmailSignIn = async () => {
    const e = email.trim();
    const p = password;
    if (!e)     { Alert.alert('Required', 'Please enter your email.');    return; }
    if (!p)     { Alert.alert('Required', 'Please enter your password.'); return; }

    setLoading(true);
    try {
      const result = await signInWithEmailAndExchange(e, p, langCode);
      await finishLogin(result, userName);
    } catch (err: any) {
      Alert.alert('Sign-in failed', err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAnonymousSignIn = async () => {
    setLoading(true);
    try {
      const result = await signInAnonymouslyAndExchange(langCode);
      await finishLogin(result, userName);
    } catch (err: any) {
      Alert.alert('Anonymous sign-in failed', err?.message ?? String(err));
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
            {!firebaseReady ? (
              <View style={styles.warningBanner}>
                <Text style={styles.warningTitle}>Firebase config missing</Text>
                <Text style={styles.warningBody}>
                  Drop google-services.json (Android) and GoogleService-Info.plist
                  (iOS) into the firebase/ folder, then rebuild. See
                  firebase/README.md for the full setup path, including how to
                  allow-list your Firebase project in HyperBabel Console →
                  Customer Auth.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.cardSubtitle}>
                  Sign in with Firebase. We exchange the ID token for a
                  short-lived HyperBabel customer JWT — your org API key never
                  ships in this binary.
                </Text>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Email *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Password *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                  />
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

                <TouchableOpacity
                  style={styles.loginBtn}
                  onPress={handleEmailSignIn}
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
                      : <Text style={styles.loginBtnText}>Sign in</Text>
                    }
                  </LinearGradient>
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  style={styles.altBtn}
                  onPress={handleAnonymousSignIn}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <Text style={styles.altBtnText}>
                    Continue anonymously (kiosk mode)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.signupLink}
                  onPress={() => router.push('/(auth)/signup')}
                >
                  <Text style={styles.signupLinkText}>
                    New here?{' '}
                    <Text style={styles.signupLinkHighlight}>
                      Create an account
                    </Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}
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
  cardSubtitle:   { ...textPresets.label, color: colors.textSecondary, marginBottom: spacing[5], lineHeight: 18 },

  warningBanner:  {
    backgroundColor:  'rgba(245, 158, 11, 0.10)',
    borderColor:      '#f59e0b',
    borderWidth:      1,
    borderRadius:     borderRadius.lg,
    padding:          spacing[4],
  },
  warningTitle:   { ...textPresets.label, color: '#fcd34d', fontWeight: '700', marginBottom: spacing[2] },
  warningBody:    { ...textPresets.caption, color: '#fde68a', lineHeight: 18 },

  field:          { marginBottom: spacing[4] },
  fieldLabel:     { ...textPresets.caption, color: colors.textSecondary, marginBottom: spacing[2], fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
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

  loginBtn:       { marginTop: spacing[2], borderRadius: borderRadius.xl, overflow: 'hidden' },
  loginBtnGradient: { paddingVertical: spacing[4], alignItems: 'center', justifyContent: 'center' },
  loginBtnText:   { ...textPresets.bodyMd, color: colors.white, fontWeight: '700' },

  dividerRow:     { flexDirection: 'row', alignItems: 'center', marginVertical: spacing[5] },
  dividerLine:    { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText:    { ...textPresets.caption, color: colors.textMuted, paddingHorizontal: spacing[3] },

  altBtn:         {
    paddingVertical:  spacing[3],
    alignItems:       'center',
    borderRadius:     borderRadius.lg,
    borderWidth:      1,
    borderColor:      colors.border,
    backgroundColor:  colors.surface,
  },
  altBtnText:     { ...textPresets.label, color: colors.textSecondary, fontWeight: '600' },

  signupLink:     { marginTop: spacing[5], alignItems: 'center' },
  signupLinkText: { ...textPresets.label, color: colors.textMuted },
  signupLinkHighlight: { color: colors.primaryLight, fontWeight: '600' },
});
