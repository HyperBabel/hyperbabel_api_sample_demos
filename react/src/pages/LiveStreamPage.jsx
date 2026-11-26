/**
 * HyperBabel React Demo — Live Stream Page
 *
 * ⚠️ THIS PAGE NEEDS A BACKEND — IT DOES NOT RUN FROM THE BROWSER ALONE.
 *
 *   Every `/stream/*` endpoint authenticates with your ORGANIZATION API KEY
 *   (`Authorization: Bearer hb_live_…`). A request carrying anything else is
 *   rejected before it reaches the handler:
 *
 *       POST /api/v1/stream/sessions
 *       → 401 { "error": { "code": "invalid_api_key_format" } }
 *
 *   That is deliberate. Creating a broadcast allocates paid capacity and is
 *   metered against your organization, so the caller has to be YOU, not a
 *   signed-in end user. This demo only ever holds a customer JWT — `api.js`
 *   refuses to put an org key in a browser bundle — so the calls below fail
 *   here by design.
 *
 *   The live chat on this page is backend-only too. It uses the low-level
 *   `/chat/*` API (services/chatService.js), which needs the organization API
 *   key as well and rejects end-user tokens with
 *   403 { "error": { "code": "forbidden" } }.
 *
 *   To run live streaming for real, put these calls in your own server and
 *   expose a thin endpoint your app can call:
 *
 *       browser  →  your backend (holds hb_live_…)  →  HyperBabel /stream/*, /chat/*
 *
 *   Keep reading this file for the call sequence and payloads — that part is
 *   accurate and is what your backend should implement.
 *
 * Actual real-time audio/video broadcast using HyperBabel's Stream API
 * and RTC infrastructure.
 *
 * HOST mode:
 *  1. Call Stream API to create a session (`POST /stream/sessions`)
 *     → { session: { id, channel_name, app_id, host: { uid, rtc_token, … }, … } }
 *  2. Create the stream's chat channel (`POST /chat/channels`) and keep the
 *     returned `channel.id` (a UUID) — every /chat/channels/:channelId call
 *     needs that id, not the channel NAME. The stream session does not carry
 *     a chat id, so your backend stores it next to the session.
 *  3. Join as RTC publisher with `session.host.rtc_token` / `session.host.uid`
 *  4. Publish camera + mic tracks
 *  5. Start the broadcast (`POST /stream/sessions/:id/start`)
 *  6. Share the viewer link (session id + chat channel id)
 *
 * VIEWER mode:
 *  1. Receive the session ID (and chat channel ID) from the host's link / QR
 *  2. Get a viewer token (`POST /stream/sessions/:id/viewer-token`)
 *     → flat { channel_name, uid, token, app_id, host_display_name, title, … }
 *  3. Join as RTC subscriber with that `token` / `uid`
 *  4. Remote stream is rendered automatically when host publishes
 *  5. Viewer can participate in live chat (auto-translated)
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import Header from '../components/Header';
import ChatMessageList from '../components/ChatMessageList';
import ChatInput from '../components/ChatInput';
import * as streamService from '../services/streamService';
import { declaredQuality, publishResolutionFor } from '../services/videoQuality';
import * as chatService from '../services/chatService';
import rtcService from '../services/rtcService';

// Permission status enum for host camera/mic pre-check
const PERM = { IDLE: 'idle', GRANTED: 'granted', DENIED: 'denied', UNAVAILABLE: 'unavailable' };

export default function LiveStreamPage() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');
  // Viewer: the stream's chat channel id (UUID) arrives in the share link
  // (`?chat=`). In production your backend would hand it out with the session.
  const viewerChatId = searchParams.get('chat');

  const isHost = !sessionId;

  // ── State ──
  const [session, setSession] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [streamTitle, setStreamTitle] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  // The badge under the title displays this; presence subscription wiring
  // would update it, but is left as an extension exercise.
  // eslint-disable-next-line no-unused-vars
  const [viewerCount, setViewerCount] = useState(0);
  const [chatChannelId, setChatChannelId] = useState(null);
  const [statusText, setStatusText] = useState('');
  // Camera/mic permission state (host only — viewers skip this check)
  const [permStatus, setPermStatus] = useState(isHost ? PERM.IDLE : PERM.GRANTED);

  // Refs
  const localVideoRef = useRef(null);   // Host's local camera preview
  const remoteVideoRef = useRef(null);  // Viewer's remote stream display
  const hostSessionRef = useRef(null);  // RTC host session
  const viewerSessionRef = useRef(null); // RTC viewer session
  const chatPollRef = useRef(null);
  const heartbeatRef = useRef(null);

  useEffect(() => {
    if (!user.user_id) { navigate('/login'); return; }

    // For host mode, check camera/mic permission before allowing stream creation
    if (isHost) checkMediaPermissions();

    if (!isHost && sessionId) {
      joinAsViewer();
    }

    return () => {
      clearInterval(chatPollRef.current);
      clearInterval(heartbeatRef.current);
      hostSessionRef.current?.leave().catch(() => {});
      viewerSessionRef.current?.leave().catch(() => {});
    };
  }, [sessionId]);

  // Host heartbeat — POST every 30s while live so the server can detect a
  // crash within minutes and bill only the actual stream time. Without this,
  // a host that closes the tab without calling endSession leaves the session
  // marked `live` and the wall-clock fallback bills up to 8h of phantom time.
  useEffect(() => {
    if (!isHost || !isLive || !session?.id) return;
    const fire = () => streamService.heartbeat(session.id).catch(() => {});
    fire();
    heartbeatRef.current = setInterval(fire, 30000);
    return () => clearInterval(heartbeatRef.current);
  }, [isHost, isLive, session?.id]);

  /**
   * Check camera and microphone access for the host.
   * Viewers don't need camera/mic, so this only runs in host mode.
   */
  const checkMediaPermissions = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermStatus(PERM.UNAVAILABLE);
      return;
    }
    try {
      if (navigator.permissions?.query) {
        const [cam, mic] = await Promise.all([
          navigator.permissions.query({ name: 'camera' }),
          navigator.permissions.query({ name: 'microphone' }),
        ]);
        if (cam.state === 'denied' || mic.state === 'denied') {
          setPermStatus(PERM.DENIED);
          return;
        }
      }
      setPermStatus(PERM.GRANTED);
    } catch {
      setPermStatus(PERM.GRANTED); // Proceed optimistically if query not supported
    }
  };

  // Poll chat when channel is ready
  useEffect(() => {
    if (!chatChannelId) return;
    loadChatMessages();
    chatPollRef.current = setInterval(loadChatMessages, 3000);
    return () => clearInterval(chatPollRef.current);
  }, [chatChannelId]);

  /*
   * ── NUMERIC UID for RTC — no longer derived on the client ──────────────
   *
   * HyperBabel assigns the uid: the host's comes with `POST /stream/sessions`,
   * the viewer's with `POST /stream/sessions/:id/viewer-token`. Hashing a user
   * id locally used to produce collisions between viewers and needed a manual
   * +50000 offset to stay clear of the host — the server has no such problem
   * because it allocates from one place.
   */

  // ── HOST: Create stream session ────────────────────────────────────────

  const handleCreateStream = async () => {
    if (!streamTitle.trim()) { alert('Please enter a stream title.'); return; }

    try {
      setStatusText('Creating stream session...');

      // Step 1: Create session via HyperBabel Stream API
      const result = await streamService.createSession({
        host_user_id: user.user_id,
        title: streamTitle,
        host_display_name: user.display_name,
        host_preferred_lang_cd: user.preferred_lang_cd,
        // Billing tier for this broadcast — see services/videoQuality.js.
        quality: declaredQuality(),
        // Optional self-check. A viewer subscribes to the host stream only, so
        // a broadcast's aggregate is this resolution itself — pass 1.
        publish_resolution: publishResolutionFor(1),
      });

      const streamSession = result.session || result;
      setSession(streamSession);

      // Step 2: Create a chat channel for this stream. The NAME is yours to
      // choose (lowercase letters, digits, '-' and ':'); every later call is
      // addressed by the returned channel ID (a UUID). A name that is taken
      // answers 409 `channel_exists` — keep the id from the first creation.
      try {
        const created = await chatService.createChannel({
          channel_name: `stream-${streamSession.id}`,
          channel_type: 'broadcast',
        });
        if (created?.channel?.id) setChatChannelId(created.channel.id);
      } catch (err) {
        console.warn('Live chat unavailable:', err.message);
      }

      // Step 3: Join RTC as publisher (host).
      // The create response already carries a 24-hour host token plus the
      // channel name and uid — join with those. Deriving a channel name on the
      // client (e.g. from the session id) puts the broadcast on a channel the
      // server does not know about, which is also a channel it cannot meter.
      setStatusText('Joining broadcast channel...');
      const hostRtcSession = await rtcService.joinAsHost({
        appId: streamSession.app_id,
        channelName: streamSession.channel_name,
        token: streamSession.host?.rtc_token,
        uid: streamSession.host?.uid,
      });
      hostSessionRef.current = hostRtcSession;

      // Publish camera + mic and show local preview
      await hostRtcSession.startBroadcast(localVideoRef.current);

      setStatusText('Ready to go live!');
    } catch (err) {
      alert(`Failed to create stream: ${err.message}`);
      setStatusText('');
    }
  };

  // ── HOST: Start broadcast ─────────────────────────────────────────────

  const handleStartStream = async () => {
    if (!session) return;
    try {
      await streamService.startSession(session.id);
      setIsLive(true);
      setStatusText('');
    } catch (err) {
      alert(`Failed to start stream: ${err.message}`);
    }
  };

  // ── HOST: End broadcast ───────────────────────────────────────────────

  const handleEndStream = async () => {
    if (!session) return;
    try {
      await hostSessionRef.current?.leave().catch(() => {});
      await streamService.endSession(session.id);
      setIsLive(false);
      navigate('/dashboard');
    } catch (err) {
      alert(`Failed to end stream: ${err.message}`);
    }
  };

  // ── VIEWER: Join stream ───────────────────────────────────────────────

  const joinAsViewer = async () => {
    try {
      setStatusText('Getting viewer access...');

      // Step 1: Get a viewer token from HyperBabel Stream API. The response
      // is FLAT (not wrapped in `session`) and session-scoped: the real
      // channel name, a uid that cannot collide with the host's, and a
      // subscriber `token`. Nothing is derived on the client.
      const vt = await streamService.getViewerToken(sessionId, {
        user_id: user.user_id,
        viewer_display_name: user.display_name,
        viewer_preferred_lang_cd: user.preferred_lang_cd,
      });

      setSession({ id: sessionId, ...vt });
      if (viewerChatId) setChatChannelId(viewerChatId);

      // Step 2: Join as RTC subscriber
      // When the host publishes, the tracks are surfaced via the callback
      setStatusText('Connecting to stream...');
      const viewerRtcSession = await rtcService.joinAsViewer(
        {
          appId: vt.app_id,
          channelName: vt.channel_name,
          token: vt.token,
          uid: vt.uid,
        },
        ({ videoTrack, audioTrack, mediaType }) => {
          // Render the host's video track in the viewer element
          if (mediaType === 'video' && videoTrack && remoteVideoRef.current) {
            videoTrack.play(remoteVideoRef.current);
          }
          if (mediaType === 'audio' && audioTrack) {
            audioTrack.play();
          }
          setIsLive(true);
          setStatusText('');
        },
        { externalUserId: user.user_id, userName: user.display_name, preferredLangCd: user.preferred_lang_cd }
      );

      viewerSessionRef.current = viewerRtcSession;
      setIsLive(true);
      setStatusText('Waiting for host...');
    } catch (err) {
      setStatusText(`Connection failed: ${err.message}`);
    }
  };

  // ── Chat ──────────────────────────────────────────────────────────────

  const loadChatMessages = async () => {
    if (!chatChannelId) return;
    try {
      // `chatChannelId` is the channel's UUID (see Step 2), never its name.
      const data = await chatService.getMessages(chatChannelId, { limit: 50 });
      // History comes newest first — reverse to render oldest → newest.
      const msgs = [...(data.messages || [])].reverse();
      setChatMessages(msgs);

      // Auto-translate messages from others
      if (msgs.length > 0 && user.preferred_lang_cd) {
        const myLang = user.preferred_lang_cd.split('-')[0];
        const otherIds = msgs
          .filter((m) => m.sender_id !== user.user_id && !m.translated_content?.[myLang])
          .map((m) => m.id);

        if (otherIds.length > 0) {
          chatService
            .batchTranslateMessages(chatChannelId, otherIds, user.preferred_lang_cd)
            // Response: { translations: { [messageId]: text }, limited?: true }
            .then((res) => {
              const map = res?.translations;
              if (!map || typeof map !== 'object') return;
              setChatMessages((prev) =>
                prev.map((msg) => (map[msg.id] ? { ...msg, translated_content: map[msg.id] } : msg))
              );
            })
            .catch(() => {});
        }
      }
    } catch { /* Ignore polling errors */ }
  };

  const handleSendMessage = async (content) => {
    if (!chatChannelId) return;
    try {
      await chatService.sendMessage(chatChannelId, {
        sender_id: user.user_id,
        content,
        message_type: 'text',
      });
      setChatMessages((prev) => [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          sender_id: user.user_id,
          sender_name: user.display_name,
          content,
          message_type: 'text',
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error('Chat send failed:', err);
    }
  };

  return (
    <>
      <Header />

      {/*
        Say it on screen, not just in the source. Without this the page looks
        broken: the calls 401 and the UI simply never leaves "Connecting…".
      */}
      <div
        style={{
          margin: '12px 16px', padding: '12px 14px', borderRadius: '8px',
          border: '1px solid var(--hb-warning, #b45309)',
          background: 'rgba(180, 83, 9, 0.08)', fontSize: '0.85rem', lineHeight: 1.5,
        }}
      >
        <strong>⚠️ Backend required — this page cannot work from the browser.</strong>
        <div style={{ marginTop: '4px' }}>
          The <code>/stream/*</code> endpoints authenticate with your{' '}
          <strong>organization API key</strong>, which must never ship in a browser bundle.
          This demo holds only an end-user token, so the calls return{' '}
          <code>401 invalid_api_key_format</code>. The <strong>live chat</strong> on this page
          uses <code>/chat/*</code>, which needs that key too and answers end-user tokens with{' '}
          <code>403 forbidden</code>. Move both to your own server and let the browser call
          that: <code>browser → your backend → HyperBabel /stream/*, /chat/*</code>.
          The chat hub, video call and messaging pages in this demo are end-user surfaces and do run as-is.
        </div>
      </div>

      {/* ── Camera/mic permission error screens (host only) ── */}
      {isHost && permStatus === PERM.UNAVAILABLE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 60px)', flexDirection: 'column', gap: '16px', textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '3rem' }}>🚫</div>
          <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>WebRTC Not Supported</div>
          <div className="text-muted" style={{ maxWidth: '400px' }}>Your browser does not support camera/microphone access needed for live streaming.</div>
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>Go Back</button>
        </div>
      )}
      {isHost && permStatus === PERM.DENIED && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 60px)', flexDirection: 'column', gap: '16px', textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '3rem' }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>Camera / Microphone Blocked</div>
          <div className="text-muted" style={{ maxWidth: '400px' }}>Please allow camera and microphone access in your browser settings, then retry.</div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-primary" onClick={checkMediaPermissions}>Retry</button>
            <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>Go Back</button>
          </div>
        </div>
      )}

      {/* ── Main stream layout (shown once permission granted or viewer) ── */}
      {(permStatus === PERM.GRANTED || !isHost) && (
        <div className="stream-layout">
          {/* ══════════ STREAM VIDEO ══════════ */}
          <div className="stream-main">
          {/* HOST: pre-creation setup */}
          {isHost && !session && (
            <div className="stream-video" style={{ flexDirection: 'column', gap: '24px' }}>
              <div className="empty-state">
                <div className="empty-state-icon">📡</div>
                <div className="empty-state-title">Start a Live Stream</div>
                <div className="empty-state-desc" style={{ marginBottom: '24px' }}>
                  Enter a title, create your session, then go live. Share the Session ID with viewers.
                </div>
                <div style={{ width: '340px' }}>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Stream title (e.g., Live Q&A)"
                    value={streamTitle}
                    onChange={(e) => setStreamTitle(e.target.value)}
                    style={{ marginBottom: '12px' }}
                  />
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={handleCreateStream}
                    style={{ width: '100%' }}
                    disabled={!!statusText}
                  >
                    {statusText || '📡 Create Stream'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* HOST: session created, camera preview + QR code for sharing */}
          {isHost && session && !isLive && (
            <div className="stream-video" style={{ flexDirection: 'column', gap: '20px', padding: '20px', overflowY: 'auto' }}>
              {/* Local camera preview */}
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                style={{
                  width: '100%',
                  maxHeight: '300px',
                  objectFit: 'contain',
                  background: '#000',
                  borderRadius: 'var(--hb-radius)',
                  flexShrink: 0,
                }}
              />

              {/* QR Code — viewers scan this to join the stream instantly */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: '12px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--hb-text-muted)' }}>
                  📲 Share this QR code with viewers
                </div>
                <div style={{
                  display: 'inline-block',
                  padding: '16px',
                  background: '#fff',
                  borderRadius: 'var(--hb-radius)',
                  boxShadow: 'var(--hb-shadow)',
                }}>
                  {/* QR encodes the viewer URL — scanning opens the stream directly */}
                  <QRCodeSVG
                    value={`${window.location.origin}/live-stream/viewer/${session.id}${chatChannelId ? `?chat=${encodeURIComponent(chatChannelId)}` : ''}`}
                    size={180}
                    bgColor="#ffffff"
                    fgColor="#1a1a2e"
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <div style={{ marginTop: '10px' }}>
                  <code
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--hb-accent)',
                      userSelect: 'all',
                      wordBreak: 'break-all',
                      cursor: 'pointer',
                    }}
                    title="Click to copy"
                    onClick={() => navigator.clipboard?.writeText(session.id)}
                  >
                    ID: {session.id}
                  </code>
                  <div className="text-xs text-muted" style={{ marginTop: '4px' }}>Click ID to copy</div>
                </div>
              </div>

              <button
                className="btn btn-danger btn-lg"
                onClick={handleStartStream}
                style={{ alignSelf: 'center', minWidth: '180px' }}
              >
                🔴 Go Live
              </button>
            </div>
          )}

          {/* LIVE state — Host */}
          {isHost && session && isLive && (
            <>
              <div className="stream-video" style={{ position: 'relative' }}>
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div className="stream-info-overlay">
                  <div className="stream-live-badge">LIVE</div>
                  <div className="stream-viewer-count">👁️ {viewerCount}</div>
                </div>
              </div>
              <div className="stream-controls">
                <span style={{ color: 'var(--hb-text-muted)', fontSize: '0.85rem' }}>
                  🎬 {session?.title || 'Live Stream'}
                </span>
                <button
                  className="video-control-btn end-call"
                  onClick={handleEndStream}
                  title="End broadcast"
                >
                  ⏹
                </button>
              </div>
            </>
          )}

          {/* VIEWER state */}
          {!isHost && (
            <>
              <div className="stream-video" style={{ position: 'relative', background: '#000' }}>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
                {!isLive && statusText && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: '12px',
                  }}>
                    <div className="animate-pulse" style={{ fontSize: '3rem' }}>📺</div>
                    <div className="text-muted">{statusText}</div>
                  </div>
                )}
                {isLive && (
                  <div className="stream-info-overlay">
                    <div className="stream-live-badge">LIVE</div>
                  </div>
                )}
              </div>
              <div className="stream-controls">
                <span style={{ color: 'var(--hb-text-muted)', fontSize: '0.85rem' }}>
                  Watching stream: {sessionId?.slice(0, 12)}...
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate('/dashboard')}>
                  Leave
                </button>
              </div>
            </>
          )}
        </div>

        {/* ══════════ LIVE CHAT SIDEBAR ══════════ */}
        <div className="stream-chat-sidebar">
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--hb-border-light)',
            fontWeight: 700,
            fontSize: '0.9rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>💬 Live Chat</span>
            {session && (
              <span className="text-xs text-muted">ID: {session.id?.slice(0, 8)}</span>
            )}
          </div>

          <ChatMessageList messages={chatMessages} currentUserId={user.user_id} />
          <ChatInput onSendMessage={handleSendMessage} placeholder="Say something..." />
        </div>
        </div>
      )}
    </>
  );
}
