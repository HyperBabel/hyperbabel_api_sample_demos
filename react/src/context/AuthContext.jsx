/**
 * HyperBabel React Demo — Auth Context
 *
 * Identity + preferences live in React state; the customer JWT pair lives
 * in localStorage so api.js can rotate it on 401 without a round-trip
 * through React.
 *
 * Single mode: Customer Auth pattern B1 (Firebase Direct Exchange).
 * See https://hyperbabel.com/docs#customer-auth for the full architecture.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  STORAGE_KEY_ACCESS_TOKEN,
  STORAGE_KEY_REFRESH_TOKEN,
  STORAGE_KEY_EXPIRES_AT,
} from '../services/api';
import { firebaseSignOut } from '../services/firebaseAuthService';

// ── Identity storage keys ─────────────────────────────────────────────────

const STORAGE_KEY_USER       = 'hb_user';
const STORAGE_KEY_USER_ID    = 'hb_user_id';
const STORAGE_KEY_USERNAME   = 'hb_username';
const STORAGE_KEY_LANG       = 'hb_lang';

// ── Context ───────────────────────────────────────────────────────────────

const AuthContext = createContext(null);

const readIdentity = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  const userId   = localStorage.getItem(STORAGE_KEY_USER_ID);
  const userName = localStorage.getItem(STORAGE_KEY_USERNAME);
  const lang     = localStorage.getItem(STORAGE_KEY_LANG);
  if (!userId) return null;
  return { user_id: userId, display_name: userName ?? userId, preferred_lang_cd: lang ?? 'en' };
};

const hasCustomerSession = () => Boolean(localStorage.getItem(STORAGE_KEY_ACCESS_TOKEN));

// ── Provider ──────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (hasCustomerSession()) {
      setUser(readIdentity());
    }
    setIsReady(true);
  }, []);

  /**
   * Persist a freshly-exchanged customer JWT + identity.
   *
   * @param {object} params
   * @param {string} params.userId           — external user id (Firebase UID)
   * @param {string} params.userName         — display name
   * @param {string} params.langCode         — BCP-47 e.g. 'en'
   * @param {string} params.accessToken
   * @param {string} params.refreshToken
   * @param {number} [params.expiresAt]      — Unix seconds
   */
  const login = useCallback(async ({
    userId, userName, langCode, accessToken, refreshToken, expiresAt,
  }) => {
    localStorage.setItem(STORAGE_KEY_ACCESS_TOKEN,  accessToken);
    localStorage.setItem(STORAGE_KEY_REFRESH_TOKEN, refreshToken);
    if (typeof expiresAt === 'number') {
      localStorage.setItem(STORAGE_KEY_EXPIRES_AT, String(expiresAt));
    } else {
      localStorage.removeItem(STORAGE_KEY_EXPIRES_AT);
    }
    const identity = {
      user_id:           userId,
      display_name:      userName,
      preferred_lang_cd: langCode,
    };
    localStorage.setItem(STORAGE_KEY_USER,     JSON.stringify(identity));
    localStorage.setItem(STORAGE_KEY_USER_ID,  userId);
    localStorage.setItem(STORAGE_KEY_USERNAME, userName);
    localStorage.setItem(STORAGE_KEY_LANG,     langCode);
    setUser(identity);
  }, []);

  const logout = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_USER_ID);
    localStorage.removeItem(STORAGE_KEY_USERNAME);
    localStorage.removeItem(STORAGE_KEY_LANG);
    localStorage.removeItem(STORAGE_KEY_ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEY_REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEY_EXPIRES_AT);
    await firebaseSignOut();
    setUser(null);
  }, []);

  const updateLang = useCallback((langCode) => {
    localStorage.setItem(STORAGE_KEY_LANG, langCode);
    setUser((prev) => (prev ? { ...prev, preferred_lang_cd: langCode } : prev));
  }, []);

  return (
    <AuthContext.Provider value={{ user, isReady, login, logout, updateLang }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
