/**
 * HyperBabel Demo — Auth Context
 *
 * Stores the current user's identity and preferences in memory
 * and persisted in expo-secure-store.
 *
 * Auth flow (simplified, same pattern as the React web demo):
 *  1. User enters a User ID and preferred language on the Login screen.
 *  2. The app stores these in SecureStore and updates this context.
 *  3. All API calls use the API key configured on the Login screen.
 *
 * There is no real authentication server call — this is a demo.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEY_API_KEY, STORAGE_KEY_BASE_URL } from '@/services/api';

// ── Storage keys ─────────────────────────────────────────────────────────

const STORAGE_KEY_USER_ID  = 'hb_user_id';
const STORAGE_KEY_LANG     = 'hb_lang';
const STORAGE_KEY_USERNAME = 'hb_username';

// ── Types ─────────────────────────────────────────────────────────────────

export interface AuthUser {
  userId:    string;
  userName:  string;
  langCode:  string;  // BCP-47 (e.g. 'en', 'ko', 'ja')
  apiKey:    string;
  baseUrl:   string;
}

interface AuthContextValue {
  user:    AuthUser | null;
  isReady: boolean;  // true once persisted data has been loaded
  login:   (params: { userId: string; userName: string; langCode: string; apiKey: string; baseUrl: string }) => Promise<void>;
  logout:  () => Promise<void>;
  updateLang: (langCode: string) => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Restore persisted session on app start
  useEffect(() => {
    (async () => {
      const [userId, userName, langCode, apiKey, baseUrl] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_KEY_USER_ID),
        SecureStore.getItemAsync(STORAGE_KEY_USERNAME),
        SecureStore.getItemAsync(STORAGE_KEY_LANG),
        SecureStore.getItemAsync(STORAGE_KEY_API_KEY),
        SecureStore.getItemAsync(STORAGE_KEY_BASE_URL),
      ]);

      if (userId && apiKey) {
        setUser({
          userId,
          userName:  userName  ?? userId,
          langCode:  langCode  ?? 'en',
          apiKey,
          baseUrl:   baseUrl   ?? 'https://api.hyperbabel.com/api/v1',
        });
      }
      setIsReady(true);
    })();
  }, []);

  const login = useCallback(async (params: {
    userId: string;
    userName: string;
    langCode: string;
    apiKey: string;
    baseUrl: string;
  }) => {
    await Promise.all([
      SecureStore.setItemAsync(STORAGE_KEY_USER_ID,  params.userId),
      SecureStore.setItemAsync(STORAGE_KEY_USERNAME, params.userName),
      SecureStore.setItemAsync(STORAGE_KEY_LANG,     params.langCode),
      SecureStore.setItemAsync(STORAGE_KEY_API_KEY,  params.apiKey),
      SecureStore.setItemAsync(STORAGE_KEY_BASE_URL, params.baseUrl),
    ]);
    setUser(params);
  }, []);

  const logout = useCallback(async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(STORAGE_KEY_USER_ID),
      SecureStore.deleteItemAsync(STORAGE_KEY_USERNAME),
      SecureStore.deleteItemAsync(STORAGE_KEY_LANG),
      SecureStore.deleteItemAsync(STORAGE_KEY_API_KEY),
      SecureStore.deleteItemAsync(STORAGE_KEY_BASE_URL),
    ]);
    setUser(null);
  }, []);

  const updateLang = useCallback(async (langCode: string) => {
    await SecureStore.setItemAsync(STORAGE_KEY_LANG, langCode);
    setUser((prev) => prev ? { ...prev, langCode } : prev);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isReady, login, logout, updateLang }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
