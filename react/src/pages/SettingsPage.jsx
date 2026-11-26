/**
 * HyperBabel React Demo — Settings Page
 *
 * Provides configuration and monitoring panels:
 * - Push notification token management
 * - Language detection — needs your backend (explained on the page)
 *
 * Webhooks are managed in the HyperBabel Console (https://console.hyperbabel.com),
 * not from this demo, because webhook CRUD is a tenant-admin operation that
 * requires a Console session and is not exposed to API keys.
 *
 * Organization usage and plan data are not shown: they are business data for
 * your backend, read with the organization API key, and are not available to
 * end-user apps.
 *
 * API Integration:
 * - Push API: register/unregister tokens, list tokens
 * - Translation API (`/translate/detect`, `/translate/languages`): NOT called —
 *   it authenticates with the organization API key, so it belongs on your
 *   backend. With the end-user token it answers 401, and every 401 also
 *   costs a token refresh.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import * as pushService from '../services/pushService';

export default function SettingsPage() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');

  // ── State ──
  const [pushTokens, setPushTokens] = useState([]);

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
    try {
      const result = await pushService.getTokens(user.user_id);
      setPushTokens(result?.tokens || result || []);
    } catch {
      // Leave the list empty — the card shows the "no tokens" hint.
    }
  };

  return (
    <>
      <Header />
      <div className="page-container animate-fade">
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '32px' }}>
          ⚙️ Settings
        </h1>

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
                Use <code>pushService.registerToken()</code> to register FCM registration
                tokens — on every platform, iOS included.
              </div>
            )}
          </div>
        </div>

        {/* ══════════ LANGUAGE DETECTION ══════════ */}
        <div className="settings-section">
          <h2 className="settings-section-title">🔍 Language Detection ⚠️ needs your backend</h2>
          <div className="settings-card glass-card text-muted" style={{ lineHeight: 1.6 }}>
            <code>POST /translate/detect</code> and <code>GET /translate/languages</code>{' '}
            authenticate with your organization API key, which never ships in a browser
            bundle — so this demo does not call them. Expose a thin endpoint on your own
            server that calls them (request shapes in{' '}
            <code>src/services/translateService.js</code>).
            Chat messages are still translated in-app via United Chat batch-translate.
          </div>
        </div>
      </div>

    </>
  );
}
