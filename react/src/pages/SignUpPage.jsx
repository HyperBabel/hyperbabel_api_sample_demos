/**
 * HyperBabel React Demo — Sign Up Page
 *
 * Registration page for the demo application. Collects user identity
 * information needed to interact with HyperBabel APIs.
 *
 * In production, developers would register through the HyperBabel Console
 * at console.hyperbabel.com. This page simulates that flow.
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function SignUpPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    user_id: '',
    display_name: '',
    email: '',
    preferred_lang_cd: 'en',
  });
  const [errorMsg, setErrorMsg] = useState('');

  /**
   * Handle registration — save user data and navigate to dashboard.
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    const userId = formData.user_id.trim();
    if (!userId || !formData.email.trim()) return;

    // Validate USER ID format
    const userIdRegex = /^[a-zA-Z0-9_-]+$/;
    if (!userIdRegex.test(userId)) {
      setErrorMsg('USER ID can only contain letters, numbers, hyphens (-), and underscores (_).');
      return;
    }
    setErrorMsg('');

    // Persist user identity for the demo session
    localStorage.setItem('hb_user', JSON.stringify({
      user_id: userId,
      display_name: formData.display_name.trim() || userId,
      preferred_lang_cd: formData.preferred_lang_cd,
      email: formData.email.trim(),
    }));

    navigate('/dashboard');
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
        <h1 className="auth-title">Create Account</h1>
        <p className="auth-subtitle">
          Start building with HyperBabel API Platform
        </p>

        {/* ── Registration Form ── */}
        <form onSubmit={handleSubmit}>
          {errorMsg && (
            <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '16px', fontWeight: 500, backgroundColor: 'rgba(239,68,68,0.1)', padding: '8px 12px', borderRadius: '6px' }}>
              ⚠️ {errorMsg}
            </div>
          )}

          <div className="input-group">
            <label className="input-label">
              User ID 
              <span style={{fontSize: '0.8em', color: 'var(--hb-text-muted)', fontWeight: 'normal', marginLeft: '6px'}}>
                (Letters, numbers, -, _ only)
              </span>
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g., developer-001"
              value={formData.user_id}
              onChange={(e) => {
                setFormData({ ...formData, user_id: e.target.value });
                setErrorMsg('');
              }}
              required
              autoFocus
            />
          </div>

          <div className="input-group">
            <label className="input-label">Display Name</label>
            <input
              type="text"
              className="input-field"
              placeholder="Your display name"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Email</label>
            <input
              type="email"
              className="input-field"
              placeholder="developer@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label">Preferred Language</label>
            <select
              className="input-field"
              value={formData.preferred_lang_cd}
              onChange={(e) => setFormData({ ...formData, preferred_lang_cd: e.target.value })}
            >
              <option value="en">English</option>
              <option value="ko">한국어 (Korean)</option>
              <option value="ja">日本語 (Japanese)</option>
              <option value="zh">中文 (Chinese)</option>
              <option value="es">Español (Spanish)</option>
              <option value="fr">Français (French)</option>
              <option value="de">Deutsch (German)</option>
              <option value="pt">Português (Portuguese)</option>
              <option value="ar">العربية (Arabic)</option>
              <option value="hi">हिन्दी (Hindi)</option>
              <option value="vi">Tiếng Việt (Vietnamese)</option>
              <option value="th">ไทย (Thai)</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: '8px' }}>
            Create Account →
          </button>
        </form>

        {/* ── Login Link ── */}
        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.85rem', color: 'var(--hb-text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
