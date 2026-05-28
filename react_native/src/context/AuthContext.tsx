/**
 * HyperBabel Demo — Auth Context
 *
 * Identity + preferences live in React state; the customer JWT pair lives
 * in expo-secure-store so the HTTP client can rotate it on 401 without a
 * round-trip through React.
 *
 * Single mode: Customer Auth pattern B1 (Firebase Direct Exchange).
 * See https://hyperbabel.com/docs#customer-auth for the full architecture.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  STORAGE_KEY_BASE_URL,
  STORAGE_KEY_ACCESS_TOKEN,
  STORAGE_KEY_REFRESH_TOKEN,
  STORAGE_KEY_EXPIRES_AT,
} from '@/services/api';
import { firebaseSignOut } from '@/services/firebaseAuthService';

// ── Storage keys (identity-only) ─────────────────────────────────────────

const STORAGE_KEY_USER_ID  = 'hb_user_id';
const STORAGE_KEY_LANG     = 'hb_lang';
const STORAGE_KEY_USERNAME = 'hb_username';

// ── Types ─────────────────────────────────────────────────────────────────

export interface AuthUser {
  userId:    string;
  userName:  string;
  langCode:  string;  // BCP-47 (e.g. 'en', 'ko', 'ja')
  baseUrl:   string;
}

export interface LoginParams {
  userId:       string;
  userName:     string;
  langCode:     string;
  baseUrl:      string;
  accessToken:  string;
  refreshToken: string;
  expiresAt?:   number;
}

interface AuthContextValue {
  user:       AuthUser | null;
  isReady:    boolean;
  login:      (params: LoginParams) => Promise<void>;
  logout:     () => Promise<void>;
  updateLang: (langCode: string) => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_BASE_URL = 'https://api.hyperbabel.com/api/v1';

// ── Provider ──────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Restore persisted session on app start.
  useEffect(() => {
    (async () => {
      const [userId, userName, langCode, baseUrl, accessToken] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_KEY_USER_ID),
        SecureStore.getItemAsync(STORAGE_KEY_USERNAME),
        SecureStore.getItemAsync(STORAGE_KEY_LANG),
        SecureStore.getItemAsync(STORAGE_KEY_BASE_URL),
        SecureStore.getItemAsync(STORAGE_KEY_ACCESS_TOKEN),
      ]);

      if (userId && accessToken) {
        setUser({
          userId,
          userName:  userName  ?? userId,
          langCode:  langCode  ?? 'en',
          baseUrl:   baseUrl   ?? DEFAULT_BASE_URL,
        });
      }
      setIsReady(true);
    })();
  }, []);

  const login = useCallback(async (params: LoginParams) => {
    const writes: Array<Promise<void>> = [
      SecureStore.setItemAsync(STORAGE_KEY_USER_ID,       params.userId),
      SecureStore.setItemAsync(STORAGE_KEY_USERNAME,      params.userName),
      SecureStore.setItemAsync(STORAGE_KEY_LANG,          params.langCode),
      SecureStore.setItemAsync(STORAGE_KEY_BASE_URL,      params.baseUrl),
      SecureStore.setItemAsync(STORAGE_KEY_ACCESS_TOKEN,  params.accessToken),
      SecureStore.setItemAsync(STORAGE_KEY_REFRESH_TOKEN, params.refreshToken),
    ];

    if (typeof params.expiresAt === 'number') {
      writes.push(SecureStore.setItemAsync(STORAGE_KEY_EXPIRES_AT, String(params.expiresAt)));
    } else {
      writes.push(SecureStore.deleteItemAsync(STORAGE_KEY_EXPIRES_AT));
    }

    await Promise.all(writes);
    setUser({
      userId:   params.userId,
      userName: params.userName,
      langCode: params.langCode,
      baseUrl:  params.baseUrl,
    });
  }, []);

  const logout = useCallback(async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(STORAGE_KEY_USER_ID),
      SecureStore.deleteItemAsync(STORAGE_KEY_USERNAME),
      SecureStore.deleteItemAsync(STORAGE_KEY_LANG),
      SecureStore.deleteItemAsync(STORAGE_KEY_BASE_URL),
      SecureStore.deleteItemAsync(STORAGE_KEY_ACCESS_TOKEN),
      SecureStore.deleteItemAsync(STORAGE_KEY_REFRESH_TOKEN),
      SecureStore.deleteItemAsync(STORAGE_KEY_EXPIRES_AT),
    ]);
    // Also drop the Firebase session so the next sign-in flows fresh.
    await firebaseSignOut();
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
