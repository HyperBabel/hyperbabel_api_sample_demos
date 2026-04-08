/**
 * HyperBabel React Demo — Settings Page
 *
 * Provides configuration and monitoring panels:
 * - API Usage statistics (monthly breakdown by service)
 * - Webhook management (create, list, update, delete, regenerate secret)
 * - Push notification token management
 * - Language detection playground
 *
 * API Integration:
 * - Auth API: getUsage
 * - Auth Webhooks API: full CRUD + logs
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
  const [webhooks, setWebhooks] = useState([]);
  const [webhookLogs, setWebhookLogs] = useState([]);
  const [pushTokens, setPushTokens] = useState([]);
  const [supportedLangs, setSupportedLangs] = useState([]);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [newWebhook, setNewWebhook] = useState({ url: '', events: '', description: '' });
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
      authService.listWebhooks(),
      authService.getWebhookLogs({ limit: 10 }),
      pushService.getTokens(user.user_id),
      translateService.getSupportedLanguages(),
    ]);

    if (results[0].status === 'fulfilled') setUsage(results[0].value);
    if (results[1].status === 'fulfilled') setWebhooks(results[1].value?.webhooks || results[1].value || []);
    if (results[2].status === 'fulfilled') setWebhookLogs(results[2].value?.logs || results[2].value || []);
    if (results[3].status === 'fulfilled') setPushTokens(results[3].value?.tokens || results[3].value || []);
    if (results[4].status === 'fulfilled') setSupportedLangs(results[4].value?.languages || results[4].value || []);
  };

  /**
   * Register a new webhook endpoint.
   */
  const handleCreateWebhook = async () => {
    if (!newWebhook.url.trim()) return;
    try {
      const result = await authService.createWebhook({
        url: newWebhook.url,
        events: newWebhook.events.split(',').map((e) => e.trim()).filter(Boolean),
        description: newWebhook.description || undefined,
      });

      // Show the one-time secret to the user
      if (result.secret) {
        alert(`⚠️ SAVE THIS SECRET — it will only be shown once!\n\nSecret: ${result.secret}`);
      }

      setShowWebhookModal(false);
      setNewWebhook({ url: '', events: '', description: '' });
      loadData();
    } catch (err) {
      alert(`Failed to create webhook: ${err.message}`);
    }
  };

  /**
   * Delete a webhook endpoint.
   */
  const handleDeleteWebhook = async (id) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;
    try {
      await authService.deleteWebhook(id);
      loadData();
    } catch (err) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  /**
   * Regenerate the signing secret for a webhook.
   */
  const handleRegenerateSecret = async (id) => {
    try {
      const result = await authService.regenerateWebhookSecret(id);
      if (result.secret) {
        alert(`⚠️ New secret (shown only once!):\n\n${result.secret}`);
      }
    } catch (err) {
      alert(`Failed to regenerate: ${err.message}`);
    }
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

        {/* ══════════ WEBHOOKS ══════════ */}
        <div className="settings-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 className="settings-section-title" style={{ marginBottom: 0 }}>🔗 Webhooks</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowWebhookModal(true)}>
              + Add Webhook
            </button>
          </div>

          <div className="settings-card glass-card">
            {webhooks.length > 0 ? (
              <table className="webhook-table">
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>Events</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {webhooks.map((wh) => (
                    <tr key={wh.id}>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {wh.url}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {(wh.events || []).map((ev) => (
                            <span key={ev} className="badge badge-primary">{ev}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${wh.is_active ? 'badge-success' : 'badge-danger'}`}>
                          {wh.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-sm">
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleRegenerateSecret(wh.id)}
                            title="Regenerate secret"
                          >
                            🔑
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleDeleteWebhook(wh.id)}
                            title="Delete webhook"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-muted text-center" style={{ padding: '24px' }}>
                No webhooks registered. Add one to receive real-time event notifications.
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

      {/* ══════════ CREATE WEBHOOK MODAL ══════════ */}
      {showWebhookModal && (
        <div className="modal-overlay" onClick={() => setShowWebhookModal(false)}>
          <div className="modal animate-slide" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Register Webhook</h3>

            <div className="input-group">
              <label className="input-label">Endpoint URL (HTTPS)</label>
              <input
                type="url"
                className="input-field"
                placeholder="https://your-server.com/webhooks/hyperbabel"
                value={newWebhook.url}
                onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label">Events (comma-separated)</label>
              <input
                type="text"
                className="input-field"
                placeholder="video.session.started, video.session.ended, chat.message.sent"
                value={newWebhook.events}
                onChange={(e) => setNewWebhook({ ...newWebhook, events: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Description (optional)</label>
              <input
                type="text"
                className="input-field"
                placeholder="Production webhook endpoint"
                value={newWebhook.description}
                onChange={(e) => setNewWebhook({ ...newWebhook, description: e.target.value })}
              />
            </div>

            <div className="flex gap-sm" style={{ justifyContent: 'flex-end', marginTop: '24px' }}>
              <button className="btn btn-secondary" onClick={() => setShowWebhookModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreateWebhook}>
                Register Webhook
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
