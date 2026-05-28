/**
 * HyperBabel React Demo — Sign Up Page
 *
 * Creates a brand-new Firebase user with email + password, then exchanges
 * the resulting ID token for a HyperBabel customer JWT (pattern B1). The
 * matching `com_users` row is created server-side during the exchange —
 * no extra "create user" call is needed.
 */

import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  isFirebaseConfigured,
  signUpWithEmailAndExchange,
} from '../services/firebaseAuthService';

const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export default function SignUpPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const firebaseReady = useMemo(() => isFirebaseConfigured(), []);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [userName, setUserName] = useState('');
  const [langCode, setLangCode] = useState('en');
  const [loading,  setLoading]  = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    const em = email.trim();
    if (!em || !isValidEmail(em)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters (Firebase minimum).');
      return;
    }

    setLoading(true);
    try {
      const result = await signUpWithEmailAndExchange(em, password, langCode);
      const resolvedName = userName.trim() || result.external_user_id.slice(0, 8);
      await login({
        userId:       result.external_user_id,
        userName:     resolvedName,
        langCode:     result.preferred_lang_cd || langCode,
        accessToken:  result.access_token,
        refreshToken: result.refresh_token,
        expiresAt:    result.expires_at,
      });
      navigate('/dashboard');
    } catch (err) {
      setErrorMsg(err?.message || 'Sign-up failed.');
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
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">
          We use Firebase Auth in the browser, then exchange the ID token for
          a short-lived HyperBabel customer JWT. No HyperBabel API key is
          stored in this app.
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
          <form onSubmit={handleSubmit}>
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
                placeholder="At least 6 characters"
                autoComplete="new-password"
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
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.85rem', color: 'var(--hb-text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
