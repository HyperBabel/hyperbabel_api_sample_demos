/**
 * HyperBabel React Demo — Dashboard / Sandbox Hub Page
 *
 * The central hub for the demo application. Provides quick access to:
 * - Unified Chat Hub (1:1, Group, Open chat rooms)
 * - Live Stream (Host / Viewer)
 * - Translation playground
 * - API Usage monitoring
 * - Webhook management
 *
 * This page demonstrates how developers can build a dashboard
 * that integrates multiple HyperBabel API features.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import * as authService from '../services/authService';
import * as translateService from '../services/translateService';
import * as presenceService from '../services/presenceService';
import * as streamService from '../services/streamService';
import firebaseService from '../services/firebaseService';

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');

  // State for API usage stats
  const [usage, setUsage] = useState(null);
  // State for the translation playground
  const [translateInput, setTranslateInput] = useState('');
  const [translateLang, setTranslateLang] = useState('ko');
  const [translateResult, setTranslateResult] = useState('');
  const [translating, setTranslating] = useState(false);
  // Push notification registration status
  const [pushStatus, setPushStatus] = useState(null); // null | 'granted' | 'denied' | 'unavailable'
  // Live stream discovery list — polls GET /stream/sessions?status=live every 10 seconds
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

    // Fetch API usage stats on mount
    authService.getUsage()
      .then(setUsage)
      .catch(() => setUsage(null));

    // Register for push notifications via HyperBabel Push API
    firebaseService
      .registerForPushNotifications(user.user_id, 'web')
      .then((token) => { setPushStatus(token ? 'granted' : 'unavailable'); })
      .catch(() => setPushStatus('denied'));

    // Poll live stream list every 10 seconds
    // Shows currently active broadcasts so viewers can join by clicking
    const fetchLiveStreams = () => {
      streamService.listSessions({ status: 'live', limit: 20 })
        .then((data) => setLiveStreams(data.sessions || []))
        .catch(() => {}); // Silently ignore if endpoint not yet available
    };
    fetchLiveStreams();
    const streamsPoll = setInterval(fetchLiveStreams, 10000);

    return () => {
      clearInterval(heartbeatInterval);
      clearInterval(streamsPoll);
    };
  }, []);

  /**
   * Demonstrate the Translation API — translate user input text.
   */
  const handleTranslate = async () => {
    if (!translateInput.trim()) return;
    setTranslating(true);
    try {
      const result = await translateService.translateText(
        translateInput,
        translateLang
      );
      setTranslateResult(result.translated_text || JSON.stringify(result));
    } catch (err) {
      setTranslateResult(`Error: ${err.message}`);
    } finally {
      setTranslating(false);
    }
  };

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
              auto-translated to the recipient's language.
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
            <div className="dashboard-card-title">Settings & Webhooks</div>
            <div className="dashboard-card-desc">
              View API usage stats, manage webhook endpoints, and configure push notification settings.
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
            <div className="glass-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--hb-text-muted)', fontSize: '0.9rem' }}>
              No live streams right now. <span
                style={{ color: 'var(--hb-accent)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => navigate('/live-stream/host')}
              >Start one?</span>
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

        {/* ── Translation Playground ── */}
        <div style={{ marginTop: '40px' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '16px' }}>
            🌐 Translation Playground
          </h2>
          <div className="glass-card" style={{ padding: '24px' }}>
            <div className="flex gap-md" style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label className="input-label">Input Text</label>
                <textarea
                  className="input-field"
                  placeholder="Type any text to translate..."
                  value={translateInput}
                  onChange={(e) => setTranslateInput(e.target.value)}
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div style={{ minWidth: '150px' }}>
                <label className="input-label">Target Language</label>
                <select
                  className="input-field"
                  value={translateLang}
                  onChange={(e) => setTranslateLang(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="ko">Korean</option>
                  <option value="ja">Japanese</option>
                  <option value="zh">Chinese</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="pt">Portuguese</option>
                  <option value="ar">Arabic</option>
                  <option value="hi">Hindi</option>
                </select>
                <button
                  className="btn btn-primary"
                  onClick={handleTranslate}
                  disabled={translating || !translateInput.trim()}
                  style={{ width: '100%', marginTop: '12px' }}
                >
                  {translating ? '⏳ Translating...' : '🔄 Translate'}
                </button>
              </div>
            </div>
            {translateResult && (
              <div style={{
                marginTop: '16px',
                padding: '16px',
                background: 'var(--hb-surface-alt)',
                borderRadius: 'var(--hb-radius-sm)',
                borderLeft: '3px solid var(--hb-accent)',
              }}>
                <div className="text-sm text-muted" style={{ marginBottom: '4px' }}>
                  Translation Result:
                </div>
                <div style={{ fontSize: '1rem' }}>{translateResult}</div>
              </div>
            )}
          </div>
        </div>

        {/* ── API Usage Stats ── */}
        {usage && (
          <div style={{ marginTop: '40px' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '16px' }}>
              📊 API Usage — {usage.period || 'Current Month'}
            </h2>
            <div className="glass-card" style={{ padding: '24px' }}>
              <div style={{ marginBottom: '12px' }}>
                <span className="badge badge-primary" style={{ fontSize: '0.8rem' }}>
                  Plan: {usage.plan || 'Free'}
                </span>
              </div>
              <div className="usage-grid">
                {usage.usage && Object.entries(usage.usage).map(([key, val]) => (
                  <div key={key} className="usage-item">
                    <div className="usage-value">{typeof val === 'number' ? val.toLocaleString() : val}</div>
                    <div className="usage-label">{key.replace(/_/g, ' ')}</div>
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
