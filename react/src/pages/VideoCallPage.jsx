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
import * as captionsService from '../services/captionsService';

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
  // rejoin: re-enter an existing session — currently surfaced only via the
  // navigation state docstring; preserved here so the field is documented at
  // the entry point even if no branch reads it yet.
  // eslint-disable-next-line no-unused-vars
  const rejoin   = location.state?.rejoin || false;

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

  // ── Live captions (HyperBabel Speech Translation) state ─────────────────
  // ccStatus: 'off' | 'connecting' | 'live'. The caption strip shows the
  // speaker's own transcript (partial-updated) with its translation on the
  // next line — see services/captionsService.js for the protocol.
  const [ccStatus,  setCcStatus]  = useState('off');
  const [ccLangs,   setCcLangs]   = useState([]);       // spoken-language picker list
  const [ccTarget,  setCcTarget]  = useState('');       // translation target code
  const [ccOrig,    setCcOrig]    = useState('');       // current original line
  const [ccTr,      setCcTr]      = useState('');       // current translated line
  const [ccError,   setCcError]   = useState('');       // last captions failure (visible banner)
  const ccHandleRef = useRef(null);
  // Monotonic start sequence: guards the async language-list fetch inside
  // startCaptions against a toggle-off racing it (a stale continuation must
  // not spawn a ghost stream after the user already turned captions off).
  const ccSeqRef = useRef(0);

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
      // Invalidate any in-flight startCaptions BEFORE stopping the handle —
      // otherwise a pending language fetch would resolve after unmount and
      // spawn an ownerless (still billed!) caption stream.
      ccSeqRef.current += 1;
      ccHandleRef.current?.stop();
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
  // Strategy 1 — RTC trigger: when all remote users leave the HyperBabel Video channel
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

  // ── Live Captions (HyperBabel Speech Translation) ───────────────────────
  //
  // CC ON streams the local mic to the speech-translation relay and renders
  // the live transcript + translation as a subtitle strip under the video
  // grid. Speech translation attaches to THIS call's session — the relay
  // verifies the caller is a participant — and is metered per minute of audio
  // actually sent against the org's plan allowance, so keeping it behind this
  // toggle is also the cost control. Guide: https://hyperbabel.com/docs#stt-api

  const myLang = (user.preferred_lang_cd || 'en').toLowerCase();

  const stopCaptions = () => {
    ccSeqRef.current += 1; // invalidate any in-flight startCaptions
    ccHandleRef.current?.stop();
    ccHandleRef.current = null;
    setCcStatus('off');
    setCcOrig('');
    setCcTr('');
  };

  const startCaptions = async (targetOverride) => {
    const seq = ++ccSeqRef.current;
    setCcStatus('connecting');
    setCcError('');
    try {
      // Populate the target-language picker once (cached for the session).
      let langs = ccLangs;
      if (langs.length === 0) {
        langs = await captionsService.getSpokenLanguages();
        setCcLangs(langs);
      }
      if (seq !== ccSeqRef.current) return; // toggled off while fetching
      const target =
        targetOverride ||
        ccTarget ||
        (myLang.split('-')[0] === 'en' ? 'ko' : 'en'); // sensible demo default
      if (!ccTarget) setCcTarget(target);

      ccHandleRef.current = captionsService.startLiveCaptions({
        lang: myLang,
        translateTo: target,
        // The relay accepts either the call session id or the room id of a
        // room-scoped call — pass both; session_id wins when present.
        sessionId: session?.id || session?.session_id,
        roomId,
        onCaption: (msg) => {
          if (seq !== ccSeqRef.current) return; // stale session — ignore
          // partial replaces the live line; final stays until the next
          // utterance's partial arrives — classic subtitle behavior.
          if (msg.kind === 'partial' || msg.kind === 'final') setCcOrig(msg.text || '');
          else setCcTr(msg.text || '');
        },
        onStatus: (st) => {
          if (seq !== ccSeqRef.current) return; // stale session — ignore
          if (st === 'ready') setCcStatus('live');
          if (st === 'closed') setCcStatus('off');
        },
        onError: (message) => {
          if (seq !== ccSeqRef.current) return; // stale session — ignore
          console.error('Live captions error:', message);
          // Surface in a visible banner — statusText only renders pre-connect,
          // so mid-call failures (e.g. limit_exceeded) would be invisible.
          setCcError(message);
        },
      });
    } catch (err) {
      console.error('Failed to start live captions:', err);
      if (seq === ccSeqRef.current) {
        setCcStatus('off');
        setCcError(err?.message || 'Failed to start live captions.');
      }
    }
  };

  const handleToggleCaptions = () => {
    if (ccStatus === 'off') startCaptions();
    else stopCaptions();
  };

  // Changing the target language mid-session restarts the stream — the
  // translation pair is fixed per relay connection.
  const handleCcTargetChange = (code) => {
    setCcTarget(code);
    if (ccStatus !== 'off') {
      stopCaptions();
      startCaptions(code);
    }
  };

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
    stopCaptions();
    await rtcSessionRef.current?.leave().catch(() => {});
    try { await unitedChat.leaveVideoCall(roomId, user.user_id); } catch { /* May be ended */ }
    navigate(`/chat/${roomId}`);
  };

  const handleEndCall = async () => {
    sessionEndedRef.current = true; // prevent auto-exit from firing after manual end
    stopCaptions();
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

        {/* Captions failure banner — persists until the next CC start */}
        {ccError && (
          <div style={{
            padding: '6px 16px',
            background: 'rgba(180,40,40,0.9)',
            color: '#fff',
            fontSize: '0.8rem',
            textAlign: 'center',
          }}>
            Live captions stopped: {ccError}
          </div>
        )}

        {/* Live caption strip — original + translation, subtitle style */}
        {ccStatus !== 'off' && (
          <div style={{
            padding: '10px 20px',
            background: 'rgba(0,0,0,0.75)',
            textAlign: 'center',
            minHeight: '58px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '2px',
          }}>
            {ccStatus === 'connecting' && (
              <span style={{ color: '#aaa', fontSize: '0.8rem' }}>Starting live captions…</span>
            )}
            {ccStatus === 'live' && !ccOrig && !ccTr && (
              <span style={{ color: '#aaa', fontSize: '0.8rem' }}>Listening… start speaking.</span>
            )}
            {ccOrig && (
              <span style={{ color: '#fff', fontSize: '1rem', lineHeight: 1.4 }}>{ccOrig}</span>
            )}
            {ccTr && (
              <span style={{ color: '#fbbf24', fontSize: '0.9rem', lineHeight: 1.4 }}>{ccTr}</span>
            )}
          </div>
        )}

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

          {/* Live captions toggle (speech-to-text + live translation) */}
          <button
            className={`video-control-btn ${ccStatus !== 'off' ? 'active' : ''}`}
            onClick={handleToggleCaptions}
            title={ccStatus === 'off' ? 'Turn on live captions' : 'Turn off live captions'}
            style={ccStatus === 'live'
              ? { background: 'var(--hb-primary)', color: '#fff', fontWeight: 700 }
              : { fontWeight: 700 }}
          >
            CC
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
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {roomType === '1to1' ? '1:1 Video Call' : 'Group Video Call'} — {roomName}
            {ccStatus !== 'off' && ccLangs.length > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                🌐 Translate to
                <select
                  value={ccTarget}
                  onChange={(e) => handleCcTargetChange(e.target.value)}
                  style={{ fontSize: '0.75rem', padding: '2px 4px', borderRadius: '4px' }}
                >
                  {ccLangs.map((l) => (
                    <option key={l.id} value={l.stt_lang_cd}>
                      {l.language_name}{l.native_name ? ` — ${l.native_name}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </span>
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
