/**
 * HyperBabel React Demo — Live Stream Page
 *
 * Actual real-time audio/video broadcast using HyperBabel's Stream API
 * and RTC infrastructure.
 *
 * HOST mode:
 *  1. Call Stream API to create a session (`POST /stream/sessions`)
 *  2. Receive the session ID (share with viewers)
 *  3. Join as RTC publisher via HyperBabel's token endpoint
 *  4. Publish camera + mic tracks
 *  5. Start the broadcast (`POST /stream/sessions/:id/start`)
 *  6. Host can see viewer count and use live chat
 *
 * VIEWER mode:
 *  1. Receive session ID from host (via link or QR)
 *  2. Get a viewer token (`POST /stream/sessions/:id/viewer-token`)
 *  3. Join as RTC subscriber via HyperBabel's token endpoint
 *  4. Remote stream is rendered automatically when host publishes
 *  5. Viewer can participate in live chat (auto-translated)
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import Header from '../components/Header';
import ChatMessageList from '../components/ChatMessageList';
import ChatInput from '../components/ChatInput';
import * as streamService from '../services/streamService';
import * as chatService from '../services/chatService';
import rtcService from '../services/rtcService';

// Permission status enum for host camera/mic pre-check
const PERM = { IDLE: 'idle', GRANTED: 'granted', DENIED: 'denied', UNAVAILABLE: 'unavailable' };

export default function LiveStreamPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');

  const isHost = !sessionId;

  // ── State ──
  const [session, setSession] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [streamTitle, setStreamTitle] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
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

  useEffect(() => {
    if (!user.user_id) { navigate('/login'); return; }

    // For host mode, check camera/mic permission before allowing stream creation
    if (isHost) checkMediaPermissions();

    if (!isHost && sessionId) {
      joinAsViewer();
    }

    return () => {
      clearInterval(chatPollRef.current);
      hostSessionRef.current?.leave().catch(() => {});
      viewerSessionRef.current?.leave().catch(() => {});
    };
  }, [sessionId]);

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

  // ── NUMERIC UID for RTC ───────────────────────────────────────────────

  const getUid = (userId) => {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 100000;
  };

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
      });

      const streamSession = result.session || result;
      setSession(streamSession);

      // Step 2: Create a chat channel for this stream
      const channelId = `stream-${streamSession.id}`;
      setChatChannelId(channelId);
      try {
        await chatService.createChannel({ channel_name: channelId, channel_type: 'group' });
      } catch { /* May already exist */ }

      // Step 3: Join RTC as publisher (host)
      // HyperBabel issues the RTC credential via /rtm/rtc/token
      setStatusText('Joining broadcast channel...');
      const uid = getUid(user.user_id);
      const hostRtcSession = await rtcService.joinAsHost(streamSession.id, uid, {
        externalUserId: user.user_id,
        userName: user.display_name,
        preferredLangCd: user.preferred_lang_cd,
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

      // Step 1: Get a viewer token from HyperBabel Stream API
      const tokenResult = await streamService.getViewerToken(sessionId, {
        user_id: user.user_id,
        viewer_display_name: user.display_name,
        viewer_preferred_lang_cd: user.preferred_lang_cd,
      });

      setSession({ id: sessionId, ...tokenResult });
      setChatChannelId(`stream-${sessionId}`);

      // Step 2: Join as RTC subscriber
      // When the host publishes, the tracks are surfaced via the callback
      setStatusText('Connecting to stream...');
      const uid = getUid(user.user_id) + 50000; // Offset to avoid colliding with host UID

      const viewerRtcSession = await rtcService.joinAsViewer(
        sessionId,
        uid,
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
      const data = await chatService.getMessages(chatChannelId, { limit: 50 });
      const msgs = data.messages || data || [];
      setChatMessages(msgs);

      // Auto-translate messages from others
      if (msgs.length > 0 && user.preferred_lang_cd) {
        const otherIds = msgs
          .filter((m) => m.sender_id !== user.user_id && !m.translated_content)
          .map((m) => m.id);

        if (otherIds.length > 0) {
          chatService
            .batchTranslateMessages(chatChannelId, otherIds, user.preferred_lang_cd)
            .then((translated) => {
              if (!Array.isArray(translated)) return;
              setChatMessages((prev) =>
                prev.map((msg) => {
                  const t = translated.find((tr) => tr.id === msg.id);
                  return t ? { ...msg, translated_content: t.translated_content } : msg;
                })
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
                    value={`${window.location.origin}/live-stream/viewer/${session.id}`}
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
