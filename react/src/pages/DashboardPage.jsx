/**
 * HyperBabel React Demo — Dashboard / Sandbox Hub Page
 *
 * The central hub for the demo application. Provides quick access to:
 * - Unified Chat Hub (1:1, Group, Open chat rooms)
 * - Live Stream (Host / Viewer) — needs your backend
 * - Standalone translation — needs your backend (chat translation does not)
 * - API Usage monitoring
 *
 * This page demonstrates how developers can build a dashboard
 * that integrates multiple HyperBabel API features.
 *
 * Endpoints that authenticate with the organization API key (`/stream/*`,
 * `/translate/*`) are deliberately NOT called from here: the browser only
 * holds an end-user token, so they answer 401 — and every 401 also makes the
 * HTTP client spend a token refresh. Call them from your own server.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import * as authService from '../services/authService';
import * as presenceService from '../services/presenceService';
import firebaseService from '../services/firebaseService';

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');

  // State for API usage stats
  const [usage, setUsage] = useState(null);
  // Push notification registration status
  const [pushStatus, setPushStatus] = useState(null); // null | 'granted' | 'denied' | 'unavailable'
  // Live stream discovery list. Fill it from YOUR backend, which can call
  // GET /stream/sessions?status=live with the organization API key — the
  // browser cannot (see the note in the effect below).
  // eslint-disable-next-line no-unused-vars
  const [liveStreams, setLiveStreams] = useState([]);

  // Redirect to login if no user is stored
  useEffect(() => {
    if (!user.user_id) {
      navigate('/login');
      return;
    }

    // Start presence heartbeat — notifies the platform that this user is online
    const heartbeatInterval = setInterval(() => {
      presenceService.heartbeat(user.user_id, 'web').catch(() => {});
    }, 30000); // Every 30 seconds as recommended by the API

    // Send initial heartbeat immediately
    presenceService.heartbeat(user.user_id, 'web').catch(() => {});

    // Fetch API usage stats on mount (404 when the organization has no
    // active subscription — the card is simply not shown then)
    authService.getUsage()
      .then(setUsage)
      .catch(() => setUsage(null));

    // Register for push notifications via HyperBabel Push API
    firebaseService
      .registerForPushNotifications(user.user_id, 'web')
      .then((token) => { setPushStatus(token ? 'granted' : 'unavailable'); })
      .catch(() => setPushStatus('denied'));

    // The live stream list is NOT fetched here. `GET /stream/sessions`
    // authenticates with the organization API key; with the end-user token
    // this browser holds it answers 401 `invalid_api_key_format`, and each 401
    // also costs a token refresh — polling it would churn refreshes forever.
    // Proxy it through your own server and call setLiveStreams() with the result.

    return () => {
      clearInterval(heartbeatInterval);
    };
  }, []);

  const usageSummary = usage ? authService.summarizeUsage(usage) : null;

  return (
    <>
      <Header />
      <div className="page-container">
        {/* ── Welcome Section ── */}
        <div style={{ marginBottom: '32px' }} className="animate-fade">
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '8px' }}>
            Sandbox Hub
          </h1>
          <p className="text-muted">
            Welcome, <strong>{user.display_name}</strong>! Explore all HyperBabel API features below.
          </p>
          {/* Push notification status banner */}
          {pushStatus === 'granted' && (
            <div style={{
              marginTop: '10px',
              padding: '8px 14px',
              background: 'rgba(0,230,118,0.08)',
              border: '1px solid rgba(0,230,118,0.3)',
              borderRadius: 'var(--hb-radius-sm)',
              fontSize: '0.8rem',
              color: 'var(--hb-accent-alt)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              🔔 Push notifications registered — HyperBabel will alert you to new messages and calls
            </div>
          )}
          {pushStatus === 'denied' && (
            <div style={{
              marginTop: '10px',
              padding: '8px 14px',
              background: 'rgba(255,85,85,0.08)',
              border: '1px solid rgba(255,85,85,0.2)',
              borderRadius: 'var(--hb-radius-sm)',
              fontSize: '0.8rem',
              color: 'var(--hb-danger)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              🔕 Push notifications blocked — enable them in browser settings to receive alerts
            </div>
          )}
        </div>

        {/* ── Feature Cards Grid ── */}
        <div className="dashboard-grid">
          {/* Unified Chat Hub — Primary Feature */}
          <div
            className="dashboard-card glass-card"
            onClick={() => navigate('/chat')}
            style={{ gridColumn: 'span 2' }}
          >
            <div className="dashboard-card-icon" style={{ background: 'linear-gradient(135deg, var(--hb-primary), var(--hb-accent))' }}>
              💬
            </div>
            <div className="dashboard-card-title">Unified Chat Hub</div>
            <div className="dashboard-card-desc">
              Explore 1:1 Chat, Group Chat, and Open Chat rooms. Video calls are available inside
              1:1 rooms (video call) and group rooms (group video call). All messages are
              auto-translated to the recipient&rsquo;s language.
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <span className="badge badge-primary">1:1 Chat</span>
              <span className="badge badge-primary">Group Chat</span>
              <span className="badge badge-primary">Open Chat</span>
              <span className="badge badge-success">Video Call</span>
              <span className="badge badge-success">Group Video</span>
              <span className="badge badge-warning">Auto-Translation</span>
            </div>
          </div>

          {/* Live Stream — Host */}
          <div
            className="dashboard-card glass-card"
            onClick={() => navigate('/live-stream/host')}
          >
            <div className="dashboard-card-icon" style={{ background: 'linear-gradient(135deg, #FF6B6B, #ee5a5a)' }}>
              📡
            </div>
            <div className="dashboard-card-title">Live Stream — Host</div>
            <div className="dashboard-card-desc">
              Start a live broadcast with real-time chat. Viewers can join via stream ID.
              Chat messages are auto-translated.
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '6px' }}>
              <span className="badge badge-danger">LIVE</span>
              <span className="badge badge-warning">Chat</span>
            </div>
          </div>

          {/* Live Stream — Viewer */}
          <div
            className="dashboard-card glass-card"
            onClick={() => {
              const sessionId = prompt('Enter Stream Session ID to watch:');
              if (sessionId) navigate(`/live-stream/viewer/${sessionId}`);
            }}
          >
            <div className="dashboard-card-icon" style={{ background: 'linear-gradient(135deg, var(--hb-accent), #00B4D8)' }}>
              📺
            </div>
            <div className="dashboard-card-title">Live Stream — Viewer</div>
            <div className="dashboard-card-desc">
              Join an active broadcast as a viewer. Watch the stream and participate in live chat.
            </div>
          </div>

          {/* Settings & Webhooks */}
          <div
            className="dashboard-card glass-card"
            onClick={() => navigate('/settings')}
          >
            <div className="dashboard-card-icon" style={{ background: 'linear-gradient(135deg, #555578, #8888A8)' }}>
              ⚙️
            </div>
            <div className="dashboard-card-title">Settings</div>
            <div className="dashboard-card-desc">
              View API usage stats and the push notification tokens registered for you.
              Webhooks are managed in the HyperBabel Console.
            </div>
          </div>
        </div>

        {/* ── Live Streams Now ── */}
        <div style={{ marginTop: '40px' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            📡 Live Now
            <span className="badge badge-danger" style={{ fontSize: '0.7rem', animation: 'pulse 2s infinite' }}>
              {liveStreams.length > 0 ? `${liveStreams.length} LIVE` : 'No streams'}
            </span>
          </h2>
          {liveStreams.length === 0 ? (
            <div className="glass-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--hb-text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              <div><strong>Live streaming needs a backend.</strong></div>
              <div style={{ marginTop: '4px' }}>
                Listing and creating broadcasts authenticates with your organization API key,
                which never ships in a browser bundle — so this list stays empty here.
                Proxy <code>/stream/*</code> through your own server to light it up.
              </div>
              <div style={{ marginTop: '8px' }}>
                <span
                  style={{ color: 'var(--hb-accent)', cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={() => navigate('/live-stream/host')}
                >See the call sequence →</span>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {liveStreams.map((stream) => (
                <div
                  key={stream.id}
                  className="glass-card"
                  style={{ padding: '20px', cursor: 'pointer', transition: 'var(--hb-transition)' }}
                  onClick={() => navigate(`/live-stream/viewer/${stream.id}`)}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = ''}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                    {/* Host avatar */}
                    <div className="avatar" style={{ background: 'linear-gradient(135deg, #FF6B6B, #ee5a5a)', flexShrink: 0 }}>
                      {(stream.host?.display_name || stream.host_user_id || 'H')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {stream.title || 'Untitled Stream'}
                      </div>
                      <div className="text-muted text-sm">
                        {stream.host?.display_name || stream.host_user_id || 'Unknown host'}
                      </div>
                    </div>
                    <span className="badge badge-danger" style={{ flexShrink: 0 }}>LIVE</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--hb-text-muted)' }}>
                    <span>👁️ {stream.viewer_count ?? 0} viewers</span>
                    <span className="btn btn-primary btn-sm" style={{ padding: '4px 12px' }}>Watch →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Translation ── */}
        <div style={{ marginTop: '40px' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '16px' }}>
            🌐 Translation
          </h2>
          <div className="glass-card" style={{ padding: '24px', color: 'var(--hb-text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            <div><strong>Chat translation runs right here</strong> — every chat room and the
              in-call chat translate messages into your language with{' '}
              <code>POST /unitedchat/rooms/:roomId/messages/batch-translate</code>, which
              accepts the signed-in user&rsquo;s token.</div>
            <div style={{ marginTop: '8px' }}>
              <strong>Standalone translation needs your backend.</strong>{' '}
              <code>/translate/text</code>, <code>/translate/batch</code>,{' '}
              <code>/translate/detect</code> and <code>/translate/languages</code>{' '}
              authenticate with your organization API key, which never ships in a browser
              bundle. Call them from your own server — see{' '}
              <code>src/services/translateService.js</code> for the request shapes.
            </div>
          </div>
        </div>

        {/* ── API Usage Stats ── */}
        {usageSummary && (
          <div style={{ marginTop: '40px' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '16px' }}>
              📊 API Usage — Current Month
            </h2>
            <div className="glass-card" style={{ padding: '24px' }}>
              <div style={{ marginBottom: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <span className="badge badge-primary" style={{ fontSize: '0.8rem' }}>
                  Plan: {usageSummary.plan}
                </span>
                {usageSummary.periodEnd && (
                  <span className="badge badge-success" style={{ fontSize: '0.8rem' }}>
                    Billing period ends: {new Date(usageSummary.periodEnd).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="usage-grid">
                {usageSummary.items.map((item) => (
                  <div key={item.key} className="usage-item">
                    <div className="usage-value">
                      {item.used.toLocaleString()}
                      <span className="text-muted text-sm">
                        {' / '}{item.limit === null ? 'Unlimited' : item.limit.toLocaleString()}
                      </span>
                    </div>
                    <div className="usage-label">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
