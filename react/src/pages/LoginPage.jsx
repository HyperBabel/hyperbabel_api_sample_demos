/**
 * HyperBabel React Demo — Login Page
 *
 * Single mode: Customer Auth pattern B1 (Firebase Direct Exchange).
 *
 *   1. The user signs in with Firebase Auth (email + password by default;
 *      one-tap "Anonymous" is also exposed for kiosk-style exploration).
 *   2. We exchange the resulting Firebase ID token for a HyperBabel
 *      customer JWT via POST /customer/auth/firebase-exchange.
 *   3. The JWT pair is persisted to localStorage by AuthContext and
 *      attached to every subsequent API request.
 *
 * If VITE_FIREBASE_* env vars are missing the page renders a setup-help
 * banner instead of the sign-in form. See README → Quickstart.
 */

import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  isFirebaseConfigured,
  signInWithEmailAndExchange,
  signInAnonymouslyAndExchange,
} from '../services/firebaseAuthService';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const firebaseReady = useMemo(() => isFirebaseConfigured(), []);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [userName, setUserName] = useState('');
  const [langCode, setLangCode] = useState('en');
  const [loading,  setLoading]  = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const finishLogin = async (result, fallbackName) => {
    const resolvedName = (fallbackName || '').trim()
      || result.external_user_id.slice(0, 8);
    await login({
      userId:       result.external_user_id,
      userName:     resolvedName,
      langCode:     result.preferred_lang_cd || langCode,
      accessToken:  result.access_token,
      refreshToken: result.refresh_token,
      expiresAt:    result.expires_at,
    });
    navigate('/dashboard');
  };

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    const em = email.trim();
    if (!em || !password) {
      setErrorMsg('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const result = await signInWithEmailAndExchange(em, password, langCode);
      await finishLogin(result, userName);
    } catch (err) {
      setErrorMsg(err?.message || 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnonymousSignIn = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      const result = await signInAnonymouslyAndExchange(langCode);
      await finishLogin(result, userName);
    } catch (err) {
      setErrorMsg(err?.message || 'Anonymous sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card glass-card">
        {/* ── Branding ── */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div className="header-logo-icon" style={{ width: '48px', height: '48px', fontSize: '1.5rem', margin: '0 auto 12px', borderRadius: '14px' }}>
            ⚡
          </div>
        </div>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">
          Sign in with Firebase to explore the HyperBabel API
        </p>

        {!firebaseReady ? (
          <div style={{
            background: 'rgba(245,158,11,0.10)',
            border:     '1px solid #f59e0b',
            borderRadius: '12px',
            padding:    '16px',
            marginTop:  '16px',
            fontSize:   '0.9rem',
            lineHeight: 1.5,
          }}>
            <strong style={{ color: '#fcd34d', display: 'block', marginBottom: 6 }}>
              Firebase config missing
            </strong>
            <div style={{ color: '#fde68a' }}>
              Populate <code>VITE_FIREBASE_*</code> in your <code>.env.local</code>
              and allow-list your Firebase project in HyperBabel Console →
              Customer Auth. See the README for the full Quickstart.
            </div>
          </div>
        ) : (
          <>
            {errorMsg && (
              <div style={{
                color: '#fca5a5',
                fontSize: '0.85rem',
                marginBottom: '16px',
                fontWeight: 500,
                background: 'rgba(239,68,68,0.10)',
                border: '1px solid #dc2626',
                padding: '8px 12px',
                borderRadius: '6px',
              }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleEmailSignIn}>
              <div className="input-group">
                <label className="input-label">Email</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
                  required
                  autoFocus
                />
              </div>

              <div className="input-group">
                <label className="input-label">Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMsg(''); }}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label">Display Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Alice (optional)"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Preferred Language</label>
                <select
                  className="input-field"
                  value={langCode}
                  onChange={(e) => setLangCode(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="ko">한국어 (Korean)</option>
                  <option value="ja">日本語 (Japanese)</option>
                  <option value="zh">中文 (Chinese)</option>
                  <option value="es">Español (Spanish)</option>
                  <option value="fr">Français (French)</option>
                  <option value="de">Deutsch (German)</option>
                  <option value="pt">Português (Portuguese)</option>
                </select>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                style={{ width: '100%', marginTop: '8px' }}
                disabled={loading}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            {/* Divider */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              margin: '24px 0 16px',
            }}>
              <div style={{ flex: 1, height: 1, background: 'var(--hb-border, rgba(255,255,255,0.08))' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--hb-text-muted)' }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'var(--hb-border, rgba(255,255,255,0.08))' }} />
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-lg"
              style={{ width: '100%' }}
              onClick={handleAnonymousSignIn}
              disabled={loading}
            >
              Continue anonymously (kiosk mode)
            </button>
          </>
        )}

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.85rem', color: 'var(--hb-text-muted)' }}>
          New here?{' '}
          <Link to="/signup" style={{ fontWeight: 600 }}>Create an account</Link>
        </p>
      </div>
    </div>
  );
}
