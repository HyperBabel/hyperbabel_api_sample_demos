/**
 * HyperBabel React Demo — Settings Page
 *
 * Provides configuration and monitoring panels:
 * - API Usage statistics (monthly breakdown by service)
 * - Push notification token management
 * - Language detection playground
 *
 * Webhooks are managed in the HyperBabel Console (https://console.hyperbabel.com),
 * not from this demo, because webhook CRUD is a tenant-admin operation that
 * requires a Console session and is not exposed to API keys.
 *
 * API Integration:
 * - Auth API: getUsage
 * - Push API: register/unregister tokens, list tokens
 * - Translation API: detectLanguage, getSupportedLanguages
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import * as authService from '../services/authService';
import * as pushService from '../services/pushService';
import * as translateService from '../services/translateService';

export default function SettingsPage() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');

  // ── State ──
  const [usage, setUsage] = useState(null);
  const [pushTokens, setPushTokens] = useState([]);
  const [supportedLangs, setSupportedLangs] = useState([]);
  const [detectInput, setDetectInput] = useState('');
  const [detectResult, setDetectResult] = useState(null);

  useEffect(() => {
    if (!user.user_id) {
      navigate('/login');
      return;
    }
    loadData();
  }, []);

  /**
   * Load all settings data on mount.
   */
  const loadData = async () => {
    // Fetch all data in parallel for faster page load
    const results = await Promise.allSettled([
      authService.getUsage(),
      pushService.getTokens(user.user_id),
      translateService.getSupportedLanguages(),
    ]);

    if (results[0].status === 'fulfilled') setUsage(results[0].value);
    if (results[1].status === 'fulfilled') setPushTokens(results[1].value?.tokens || results[1].value || []);
    if (results[2].status === 'fulfilled') setSupportedLangs(results[2].value?.languages || results[2].value || []);
  };

  /**
   * Detect the language of user-provided text.
   */
  const handleDetectLanguage = async () => {
    if (!detectInput.trim()) return;
    try {
      const result = await translateService.detectLanguage(detectInput);
      setDetectResult(result);
    } catch (err) {
      setDetectResult({ error: err.message });
    }
  };

  return (
    <>
      <Header />
      <div className="page-container animate-fade">
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '32px' }}>
          ⚙️ Settings
        </h1>

        {/* ══════════ API USAGE ══════════ */}
        <div className="settings-section">
          <h2 className="settings-section-title">📊 API Usage</h2>
          <div className="settings-card glass-card">
            {usage ? (
              <>
                <div style={{ marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span className="badge badge-primary">Period: {usage.period || 'N/A'}</span>
                  <span className="badge badge-success">Plan: {usage.plan || 'Free'}</span>
                </div>
                <div className="usage-grid">
                  {usage.usage && Object.entries(usage.usage).map(([key, val]) => (
                    <div key={key} className="usage-item">
                      <div className="usage-value">
                        {typeof val === 'number' ? val.toLocaleString() : val}
                      </div>
                      <div className="usage-label">{key.replace(/_/g, ' ')}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-muted">
                Connect your API key to view usage statistics.
              </div>
            )}
          </div>
        </div>

        {/* ══════════ PUSH TOKENS ══════════ */}
        <div className="settings-section">
          <h2 className="settings-section-title">🔔 Push Notification Tokens</h2>
          <div className="settings-card glass-card">
            {pushTokens.length > 0 ? (
              <div>
                {pushTokens.map((token, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 0', borderBottom: '1px solid var(--hb-border-light)',
                    }}
                  >
                    <div>
                      <span className="badge badge-primary" style={{ marginRight: '8px' }}>
                        {token.platform}
                      </span>
                      <code className="text-sm">{(token.token || '').slice(0, 30)}...</code>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted text-center" style={{ padding: '24px' }}>
                No push tokens registered for this user.
                Use <code>pushService.registerToken()</code> to register FCM/APNs tokens.
              </div>
            )}
          </div>
        </div>

        {/* ══════════ LANGUAGE DETECTION ══════════ */}
        <div className="settings-section">
          <h2 className="settings-section-title">🔍 Language Detection</h2>
          <div className="settings-card glass-card">
            <div className="flex gap-md">
              <input
                type="text"
                className="input-field"
                placeholder="Type text to detect its language..."
                value={detectInput}
                onChange={(e) => setDetectInput(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={handleDetectLanguage}>
                Detect
              </button>
            </div>
            {detectResult && (
              <div style={{ marginTop: '12px', padding: '12px', background: 'var(--hb-surface-alt)', borderRadius: 'var(--hb-radius-sm)' }}>
                {detectResult.error ? (
                  <span className="text-muted">Error: {detectResult.error}</span>
                ) : (
                  <span>
                    Detected: <strong>{detectResult.language}</strong>
                    {detectResult.confidence && ` (${(detectResult.confidence * 100).toFixed(1)}% confidence)`}
                  </span>
                )}
              </div>
            )}

            {/* Supported Languages List */}
            {supportedLangs.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div className="text-sm text-muted" style={{ marginBottom: '8px' }}>
                  Supported Languages ({supportedLangs.length}):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {supportedLangs.slice(0, 30).map((lang) => (
                    <span key={typeof lang === 'string' ? lang : lang.code} className="badge badge-primary">
                      {typeof lang === 'string' ? lang : lang.code}
                    </span>
                  ))}
                  {supportedLangs.length > 30 && (
                    <span className="badge" style={{ background: 'var(--hb-surface-alt)', color: 'var(--hb-text-muted)' }}>
                      +{supportedLangs.length - 30} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </>
  );
}
