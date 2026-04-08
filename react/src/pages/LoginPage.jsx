/**
 * HyperBabel React Demo — Login Page
 *
 * Simulated authentication page for the demo application.
 * In production, developers would use HyperBabel's console for account
 * management. This page simulates a developer user entering their
 * credentials to interact with the demo.
 *
 * Stores user identity in localStorage for subsequent API calls.
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function LoginPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    user_id: '',
    display_name: '',
    preferred_lang_cd: 'en',
  });

  /**
   * Handle form submission — save user data and navigate to dashboard.
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.user_id.trim()) return;

    // Persist user identity for the demo session
    localStorage.setItem('hb_user', JSON.stringify({
      user_id: formData.user_id.trim(),
      display_name: formData.display_name.trim() || formData.user_id.trim(),
      preferred_lang_cd: formData.preferred_lang_cd,
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
        <h1 className="auth-title">Welcome Back</h1>
        <p className="auth-subtitle">
          Sign in to explore the HyperBabel API Demo
        </p>

        {/* ── Login Form ── */}
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">User ID</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g., developer-001"
              value={formData.user_id}
              onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div className="input-group">
            <label className="input-label">Display Name</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g., Alice Kim"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
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
            Sign In →
          </button>
        </form>

        {/* ── Sign Up Link ── */}
        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.85rem', color: 'var(--hb-text-muted)' }}>
          New to HyperBabel?{' '}
          <Link to="/signup" style={{ fontWeight: 600 }}>Create an account</Link>
        </p>
      </div>
    </div>
  );
}
