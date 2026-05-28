/**
 * HyperBabel Demo — Sign Up Screen
 *
 * Creates a brand-new Firebase user with email + password, then exchanges
 * the resulting ID token for a HyperBabel customer JWT (pattern B1). The
 * matching `com_users` row is created automatically on the server side
 * during exchange — no extra "create user" call needed.
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import {
  isFirebaseReady,
  signUpWithEmailAndExchange,
} from '@/services/firebaseAuthService';
import { colors, spacing, textPresets, borderRadius } from '@/theme';

const PROD_BASE_URL =
  process.env.EXPO_PUBLIC_HB_API_URL ?? 'https://api.hyperbabel.com/api/v1';

const isValidEmail = (s: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export default function SignUpScreen() {
  const { login } = useAuth();
  const firebaseReady = useMemo(() => isFirebaseReady(), []);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [userName, setUserName] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleCreate = async () => {
    setErrorMsg('');
    const e = email.trim();
    const p = password;

    if (!e || !isValidEmail(e)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (p.length < 6) {
      setErrorMsg('Password must be at least 6 characters (Firebase minimum).');
      return;
    }

    setLoading(true);
    try {
      const result = await signUpWithEmailAndExchange(e, p);
      const resolvedName = userName.trim()
        || result.external_user_id.slice(0, 8);
      await login({
        userId:       result.external_user_id,
        userName:     resolvedName,
        langCode:     result.preferred_lang_cd ?? 'en',
        baseUrl:      PROD_BASE_URL,
        accessToken:  result.access_token,
        refreshToken: result.refresh_token,
        expiresAt:    result.expires_at,
      });
      router.replace('/(main)/dashboard');
    } catch (err: any) {
      setErrorMsg(err?.message ?? String(err));
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
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.heading}>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>
              We use Firebase Auth on device, then exchange the ID token for
              a short-lived HyperBabel customer JWT. No HyperBabel API key
              is ever stored on this phone.
            </Text>
          </View>

          <View style={styles.card}>
            {!firebaseReady ? (
              <View style={styles.warningBanner}>
                <Text style={styles.warningTitle}>Firebase config missing</Text>
                <Text style={styles.warningBody}>
                  Add google-services.json and GoogleService-Info.plist to the
                  firebase/ folder before creating an account. See
                  firebase/README.md for the full setup path.
                </Text>
              </View>
            ) : (
              <>
                {!!errorMsg && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                )}

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
                    onChangeText={(val) => { setEmail(val); setErrorMsg(''); }}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Password *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="At least 6 characters"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    value={password}
                    onChangeText={(val) => { setPassword(val); setErrorMsg(''); }}
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

                <TouchableOpacity
                  style={styles.createBtn}
                  onPress={handleCreate}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={colors.gradientBrand}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.createBtnGradient}
                  >
                    {loading
                      ? <ActivityIndicator color={colors.white} />
                      : <Text style={styles.createBtnText}>Create account</Text>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
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
  subtitle:        { ...textPresets.body, color: colors.textSecondary, lineHeight: 20 },

  card:            { backgroundColor: colors.card, borderRadius: borderRadius['2xl'], padding: spacing[6], borderWidth: 1, borderColor: colors.glassBorder },
  field:           { marginBottom: spacing[4] },
  fieldLabel:      { ...textPresets.caption, color: colors.textSecondary, marginBottom: spacing[2], fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
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

  warningBanner:   {
    backgroundColor:  'rgba(245, 158, 11, 0.10)',
    borderColor:      '#f59e0b',
    borderWidth:      1,
    borderRadius:     borderRadius.lg,
    padding:          spacing[4],
  },
  warningTitle:    { ...textPresets.label, color: '#fcd34d', fontWeight: '700', marginBottom: spacing[2] },
  warningBody:     { ...textPresets.caption, color: '#fde68a', lineHeight: 18 },

  errorBox:        { backgroundColor: 'rgba(239, 68, 68, 0.10)', padding: spacing[3], borderRadius: borderRadius.md, marginBottom: spacing[4], borderWidth: 1, borderColor: '#dc2626' },
  errorText:       { ...textPresets.caption, color: '#fca5a5', fontWeight: '600' },

  createBtn:          { marginTop: spacing[2], borderRadius: borderRadius.xl, overflow: 'hidden' },
  createBtnGradient:  { paddingVertical: spacing[4], alignItems: 'center', justifyContent: 'center' },
  createBtnText:      { ...textPresets.bodyMd, color: colors.white, fontWeight: '700' },
});
