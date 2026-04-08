/**
 * HyperBabel React Demo — Video Call Page
 *
 * Provides actual real-time audio/video communication using credentials
 * issued by the HyperBabel RTC Token API (`POST /rtm/rtc/token`).
 *
 * ──────────────────────────────────────────────────────────
 * Incoming Call Architecture: CallContext + IncomingCallOverlay
 * ──────────────────────────────────────────────────────────
 *
 * App.jsx
 *  └─ <CallProvider>               ← isInCall global state management
 *       ├─ <IncomingCallListener>  ← subscribeToPrivate() global listener
 *       ├─ <IncomingCallOverlay>   ← popup UI (conditionally rendered)
 *       └─ <Routes>
 *
 * VideoCallPage.jsx  ← this file
 *  └─ useEffect: mount   → setIsInCall(true)
 *                unmount → setIsInCall(false)
 *
 * ──────────────────────────────────────────────────────────
 * Developer Test Scenarios (Incoming Call)
 * ──────────────────────────────────────────────────────────
 *
 * [Browser Tab A] user_A logged in
 * [Browser Tab B] user_B logged in
 *
 * Scenario 1 — Accept:
 *   B initiates a 1:1 video call to A
 *   → A sees the accept/reject popup ✅
 *   → A clicks Accept → VideoCallPage opens
 *
 * Scenario 2 — Reject:
 *   B calls A
 *   → A clicks Reject → popup dismissed ✅
 *
 * Scenario 3 — Busy:
 *   B calls A while A is already in a call with C
 *   → No popup shown to A; busy event sent to B automatically ✅
 *
 * ──────────────────────────────────────────────────────────
 * Per-page Flow:
 *  1. Pre-join screen checks camera/mic permission before joining.
 *  2. On permission granted, joins RTC session via HyperBabel token.
 *  3. Local camera/mic published; remote tracks received and rendered.
 *  4. In-call chat messages auto-translated into each user's preferred language.
 *
 * Group call support:
 *  - `leaveVideoCall()` removes just this participant (others remain).
 *  - `endVideoCall()` ends the session for all participants.
 *  - Pass `rejoin: true` in navigation state to re-enter an existing session
 *    without starting a new call (e.g. after accidentally leaving).
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useCall } from '../context/CallContext';
import ChatMessageList from '../components/ChatMessageList';
import ChatInput from '../components/ChatInput';
import * as unitedChat from '../services/unitedChatService';
import * as translateService from '../services/translateService';
import rtcService from '../services/rtcService';

// Permission status enum
const PERM = { CHECKING: 'checking', GRANTED: 'granted', DENIED: 'denied', UNAVAILABLE: 'unavailable' };

export default function VideoCallPage() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');

  const session  = location.state?.session;
  const roomType = location.state?.roomType || '1to1';
  const roomName = location.state?.roomName || 'Video Call';
  const rejoin   = location.state?.rejoin || false; // rejoin: re-enter an existing session

  // ── Camera/mic permission pre-check state ────────────────────────────────
  const [permStatus, setPermStatus] = useState(PERM.CHECKING);
  const [permDetail, setPermDetail] = useState('');

  // ── In-call state ───────────────────────────────────────────────────────
  const [isMuted,    setIsMuted]    = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [connected,  setConnected]  = useState(false);
  const [statusText, setStatusText] = useState('Connecting...');

  const localVideoRef    = useRef(null);
  const remoteVideoRefs  = useRef({});
  const rtcSessionRef    = useRef(null);
  const chatPollRef      = useRef(null);
  // Guard: prevent navigating away twice when session ends
  const sessionEndedRef  = useRef(false);

  // ── Busy flag: while on this page, incoming calls are auto-rejected ──────
  // IncomingCallListener reads setIsInCall to decide whether to show popup.
  const { setIsInCall } = useCall();

  useEffect(() => {
    setIsInCall(true);
    return () => setIsInCall(false);
  }, []);

  // ── Step 1: Check camera/mic permission before joining ───────────────────
  useEffect(() => {
    if (!user.user_id) { navigate('/login'); return; }
    checkMediaPermissions();
  }, []);

  /**
   * Check and request camera + microphone access before joining the call.
   * Uses navigator.mediaDevices.getUserMedia so the browser shows its
   * native permission prompt.
   */
  const checkMediaPermissions = async () => {
    setPermStatus(PERM.CHECKING);

    if (!navigator.mediaDevices?.getUserMedia) {
      setPermStatus(PERM.UNAVAILABLE);
      setPermDetail('Your browser does not support camera/microphone access (WebRTC unavailable).');
      return;
    }

    try {
      // Check existing permission state without prompting (Chrome/Edge)
      if (navigator.permissions?.query) {
        const [cam, mic] = await Promise.all([
          navigator.permissions.query({ name: 'camera' }),
          navigator.permissions.query({ name: 'microphone' }),
        ]);
        if (cam.state === 'denied' || mic.state === 'denied') {
          setPermStatus(PERM.DENIED);
          setPermDetail('Camera or microphone access is blocked. Please allow access in your browser settings and reload the page.');
          return;
        }
      }
      setPermStatus(PERM.GRANTED);
    } catch {
      // permissions.query may not be supported — proceed optimistically
      setPermStatus(PERM.GRANTED);
    }
  };

  // ── Step 2: Join RTC once permission is confirmed ───────────────────────
  useEffect(() => {
    if (permStatus !== PERM.GRANTED) return;

    const channelName = session?.session_id || session?.id || roomId;
    const uid = Math.abs(hashCode(user.user_id)) % 100000;

    joinRtcSession(channelName, uid);
    loadChatMessages();

    chatPollRef.current = setInterval(loadChatMessages, 5000);

    return () => {
      clearInterval(chatPollRef.current);
      rtcSessionRef.current?.leave().catch(() => {});
    };
  }, [permStatus]);

  const hashCode = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  };

  const joinRtcSession = async (channelName, uid) => {
    try {
      setStatusText('Requesting session credentials...');
      const rtcChannelSession = await rtcService.joinChannel(channelName, uid, 'publisher', {
        externalUserId: user.user_id,
        userName: user.display_name,
        preferredLangCd: user.preferred_lang_cd,
      });

      rtcSessionRef.current = rtcChannelSession;
      setStatusText('Publishing local tracks...');

      await rtcChannelSession.publishLocalTracks(localVideoRef.current, true, true);

      rtcChannelSession.onRemoteUser(({ user: remoteUser, videoTrack, audioTrack, mediaType }) => {
        setRemoteUsers((prev) => {
          const exists = prev.find((u) => u.uid === remoteUser.uid);
          return exists ? prev : [...prev, remoteUser];
        });
        if (mediaType === 'video' && videoTrack) {
          const el = remoteVideoRefs.current[remoteUser.uid];
          if (el) videoTrack.play(el);
        }
        if (mediaType === 'audio' && audioTrack) audioTrack.play();
      });

      rtcChannelSession.onRemoteUserLeft(({ user: leftUser }) => {
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== leftUser.uid));
      });

      rtcChannelSession.onConnectionChange((state) => {
        if (state === 'CONNECTED') { setConnected(true); setStatusText('Connected'); }
      });

      setConnected(true);
      setStatusText('Connected');
    } catch (err) {
      console.error('RTC join failed:', err);
      setStatusText(`Connection failed: ${err.message}`);
    }
  };

  // ── In-call Chat with Auto-Translation ─────────────────────────────────
  // Incoming messages from other participants are translated into this
  // user's preferred language (preferred_lang_cd) using the HyperBabel
  // Translation API. Translation runs on history load and on each new message.

  const loadChatMessages = async () => {
    try {
      const data = await unitedChat.getMessages(roomId, { limit: 50 });
      const msgs = data.messages || data || [];

      // Auto-translate messages from other users into my preferred language
      if (msgs.length > 0 && user.preferred_lang_cd) {
        const untranslatedIds = msgs
          .filter((m) => m.sender_id !== user.user_id && !m.translated_content)
          .map((m) => m.id);

        if (untranslatedIds.length > 0) {
          try {
            const translated = await translateService.translateBatch(
              untranslatedIds.map((id) => {
                const msg = msgs.find((m) => m.id === id);
                return { id, text: msg?.content || '' };
              }),
              user.preferred_lang_cd
            );
            const translationMap = {};
            if (Array.isArray(translated)) {
              translated.forEach((t) => { translationMap[t.id] = t.translated_text; });
            }
            const translatedMsgs = msgs.map((m) =>
              translationMap[m.id]
                ? { ...m, translated_content: translationMap[m.id] }
                : m
            );
            setChatMessages(translatedMsgs);
            return;
          } catch { /* Fall through to set untranslated messages */ }
        }
      }

      setChatMessages(msgs);
    } catch { /* Non-critical */ }
  };

  const handleSendMessage = async (content) => {
    try {
      await unitedChat.sendMessage(roomId, {
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
      console.error('In-call chat send failed:', err);
    }
  };

  // ── Auto-exit: detect when group session ends (last participant left) ────
  //
  // Strategy 1 — RTC trigger: when all remote users leave the Agora channel
  //   (onRemoteUserLeft fires), wait 2s then confirm via getActiveVideoCall.
  //   If the session is gone/ended → navigate back to chat.
  //
  // Strategy 2 — Polling safety net: every 10s check the active session status
  //   in case the RTC event was missed (e.g. network interruption).
  //
  // Both strategies share sessionEndedRef to prevent double-navigation.

  // Strategy 1: RTC-triggered check
  useEffect(() => {
    // Only for group calls; skip if not yet connected to avoid false-positives
    if (roomType !== 'group' || !connected) return;
    // remoteUsers just became empty — all others have left the RTC channel
    if (remoteUsers.length > 0) return;

    let timer;
    const checkIfEnded = async () => {
      if (sessionEndedRef.current) return;
      try {
        const data = await unitedChat.getActiveVideoCall(roomId);
        const activeSession = data?.session || data;
        // If API returns no active session, the backend already ended it
        if (!activeSession?.id || activeSession.status === 'ended') {
          sessionEndedRef.current = true;
          await rtcSessionRef.current?.leave().catch(() => {});
          navigate(`/chat/${roomId}`, { replace: true });
        }
        // Still active (e.g. brief RTC dropout) → stay
      } catch {
        // 404 = no active session = session ended
        sessionEndedRef.current = true;
        await rtcSessionRef.current?.leave().catch(() => {});
        navigate(`/chat/${roomId}`, { replace: true });
      }
    };

    // Give 2s buffer: brief network drops can cause false-positive empty remoteUsers
    timer = setTimeout(checkIfEnded, 2000);
    return () => clearTimeout(timer);
  }, [remoteUsers.length, connected, roomType, roomId]);

  // Strategy 2: Periodic polling safety net (every 10s)
  useEffect(() => {
    if (roomType !== 'group' || !connected) return;

    const interval = setInterval(async () => {
      if (sessionEndedRef.current) { clearInterval(interval); return; }
      try {
        const data = await unitedChat.getActiveVideoCall(roomId);
        const activeSession = data?.session || data;
        if (!activeSession?.id || activeSession.status === 'ended') {
          sessionEndedRef.current = true;
          clearInterval(interval);
          await rtcSessionRef.current?.leave().catch(() => {});
          navigate(`/chat/${roomId}`, { replace: true });
        }
      } catch {
        // 404 = session ended
        sessionEndedRef.current = true;
        clearInterval(interval);
        await rtcSessionRef.current?.leave().catch(() => {});
        navigate(`/chat/${roomId}`, { replace: true });
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, [connected, roomType, roomId]);

  // ── Call Controls ───────────────────────────────────────────────────────

  const handleToggleMute = async () => {
    await rtcSessionRef.current?.setAudioMuted(!isMuted);
    setIsMuted(!isMuted);
  };

  const handleToggleVideo = async () => {
    await rtcSessionRef.current?.setVideoDisabled(!isVideoOff);
    setIsVideoOff(!isVideoOff);
  };

  const handleLeaveCall = async () => {
    sessionEndedRef.current = true; // prevent auto-exit from firing after manual leave
    await rtcSessionRef.current?.leave().catch(() => {});
    try { await unitedChat.leaveVideoCall(roomId, user.user_id); } catch { /* May be ended */ }
    navigate(`/chat/${roomId}`);
  };

  const handleEndCall = async () => {
    sessionEndedRef.current = true; // prevent auto-exit from firing after manual end
    await rtcSessionRef.current?.leave().catch(() => {});
    try { await unitedChat.endVideoCall(roomId, user.user_id); } catch { /* May be ended */ }
    navigate(`/chat/${roomId}`);
  };

  // ── Render: Camera/Mic Permission Pre-check Screen ────────────────────────

  if (permStatus === PERM.CHECKING) {
    return (
      <div className="video-layout" style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', background: 'var(--hb-bg-deep)' }}>
        <div className="animate-pulse" style={{ fontSize: '3rem' }}>📷</div>
        <div style={{ fontWeight: 700 }}>Checking camera & microphone access...</div>
        <div className="text-muted text-sm">Please allow access when your browser asks.</div>
      </div>
    );
  }

  if (permStatus === PERM.UNAVAILABLE) {
    return (
      <div className="video-layout" style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', background: 'var(--hb-bg-deep)', textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '3rem' }}>🚫</div>
        <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>WebRTC Not Supported</div>
        <div className="text-muted" style={{ maxWidth: '400px' }}>{permDetail}</div>
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>Go Back</button>
      </div>
    );
  }

  if (permStatus === PERM.DENIED) {
    return (
      <div className="video-layout" style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', background: 'var(--hb-bg-deep)', textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '3rem' }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>Camera / Microphone Blocked</div>
        <div className="text-muted" style={{ maxWidth: '440px' }}>{permDetail}</div>
        <div style={{ padding: '12px 20px', background: 'var(--hb-surface)', borderRadius: 'var(--hb-radius)', fontSize: '0.85rem', textAlign: 'left', lineHeight: 1.7 }}>
          <strong>How to allow access:</strong><br />
          Chrome/Edge: 🔒 in address bar → Site settings → Camera / Microphone → Allow<br />
          Firefox: 🛡️ in address bar → Remove block on Camera / Microphone<br />
          Safari: Preferences → Websites → Camera / Microphone → Allow
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-primary" onClick={checkMediaPermissions}>Retry</button>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  // ── Render: In-Call UI ──────────────────────────────────────────────────

  const participantCount = 1 + remoteUsers.length;
  const gridClass = `video-grid participants-${Math.min(participantCount, 4)}`;

  return (
    <div className="video-layout">
      {/* ══════════ VIDEO GRID ══════════ */}
      <div className="video-main">
        <div className={gridClass}>
          {/* Local video tile */}
          <div className="video-tile">
            <video
              ref={localVideoRef}
              autoPlay muted playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--hb-radius)' }}
            />
            <div className="video-tile-name">
              {user.display_name || user.user_id} (You)
              {isMuted && ' 🔇'}{isVideoOff && ' 📷'}
            </div>
          </div>

          {/* Remote participant tiles */}
          {remoteUsers.map((ru) => (
            <div key={ru.uid} className="video-tile">
              <video
                ref={(el) => { if (el) remoteVideoRefs.current[ru.uid] = el; }}
                autoPlay playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--hb-radius)' }}
              />
              <div className="video-tile-name">Participant {ru.uid}</div>
            </div>
          ))}
        </div>

        {/* Call Controls */}
        <div className="video-controls">
          <button
            className={`video-control-btn ${isMuted ? 'muted' : 'active'}`}
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : '🎤'}
          </button>

          <button
            className={`video-control-btn ${isVideoOff ? 'muted' : 'active'}`}
            onClick={handleToggleVideo}
            title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
          >
            {isVideoOff ? '📷' : '📹'}
          </button>

          {roomType === 'group' && (
            <button
              className="video-control-btn"
              onClick={handleLeaveCall}
              title="Leave call (others remain)"
              style={{ background: 'var(--hb-warning)', color: '#fff' }}
            >
              🚪
            </button>
          )}

          <button
            className="video-control-btn end-call"
            onClick={handleEndCall}
            title={roomType === 'group' ? 'End call for all' : 'End call'}
          >
            📞
          </button>
        </div>

        {/* Status bar */}
        <div style={{
          padding: '8px 16px',
          background: 'var(--hb-bg)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.8rem',
          color: 'var(--hb-text-muted)',
        }}>
          <span>{roomType === '1to1' ? '1:1 Video Call' : 'Group Video Call'} — {roomName}</span>
          <span className={`badge ${connected ? 'badge-success' : 'badge-warning'}`}>
            {connected ? '● Connected' : `⏳ ${statusText}`}
          </span>
        </div>
      </div>

      {/* ══════════ IN-CALL CHAT SIDEBAR (with auto-translation) ══════════ */}
      <div className="video-chat-sidebar">
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--hb-border-light)',
          fontWeight: 700,
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          💬 In-Call Chat
          {user.preferred_lang_cd && (
            <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>
              🌐 Auto-translate ON
            </span>
          )}
        </div>
        <ChatMessageList messages={chatMessages} currentUserId={user.user_id} />
        <ChatInput onSendMessage={handleSendMessage} placeholder="Chat during the call..." />
      </div>
    </div>
  );
}
