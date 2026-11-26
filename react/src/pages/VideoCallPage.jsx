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
 *  4. Once joined: POST /video-call/joined-rtc once, then
 *     POST /video-call/heartbeat every 60 s while on this page, and
 *     POST /video-call/renew-token shortly before the 1-hour RTC token expires.
 *  5. In-call chat messages auto-translated into each user's preferred
 *     language (United Chat batch-translate).
 *  6. Leaving without a button press — call events arrive on the ROOM
 *     real-time channel as `video_call` system messages:
 *     - `call_ended` for this session → leave the screen (no API call).
 *     - CALLER of a 1:1 call, nobody joined yet: `call_rejected` /
 *       `call_missed` / `call_busy` → POST leave, show why, leave the screen.
 *     - CALLER of any call: nobody joined 45 s after the caller is in the
 *       channel → POST leave, "No answer".
 *     - The last other participant left the media channel → POST leave and
 *       leave the screen (a group call carries on while anyone remains).
 *
 * Every call action needs the session id. It arrives in the navigation state
 * as `session.id` on all three ways in: the start-call response (caller), the
 * CALL_INVITE signal (callee) and the active-call lookup (rejoin).
 *
 * Group call support:
 *  - `leaveVideoCall()` removes just this participant (others remain).
 *  - `endVideoCall()` ends the session for all participants — only the
 *    caller, the room owner or a sub-admin may; anyone else falls back to
 *    leaving, which ends the call once one participant or fewer remain.
 *  - Pass `rejoin: true` in navigation state to re-enter an existing session
 *    without starting a new call (e.g. after accidentally leaving). The page
 *    then calls POST …/video-call/accept before joining media again — that
 *    is what makes the server count you as active once more — followed by
 *    joined-rtc and the heartbeat as usual. 410 = the call already ended.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useCall } from '../context/CallContext';
import ChatMessageList from '../components/ChatMessageList';
import ChatInput from '../components/ChatInput';
import * as unitedChat from '../services/unitedChatService';
import rtcService from '../services/rtcService';
import realtimeService from '../services/realtimeService';
import * as captionsService from '../services/captionsService';

// Permission status enum
const PERM = { CHECKING: 'checking', GRANTED: 'granted', DENIED: 'denied', UNAVAILABLE: 'unavailable' };

// The caller gives up when nobody has joined this long after the caller is in
// the call. Matches the callee's ring timeout (IncomingCallOverlay).
const RING_TIMEOUT_MS = 45_000;

// What the caller is told when a 1:1 callee does not pick up.
const DECLINE_NOTICE = {
  call_rejected: 'Declined',
  call_missed:   'No answer',
  call_busy:     'Busy',
};

export default function VideoCallPage() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');

  const session  = location.state?.session;
  // Required by joined-rtc / heartbeat / renew-token / leave / end.
  const sessionId = session?.id;
  const roomType = location.state?.roomType || '1to1';
  const roomName = location.state?.roomName || 'Video Call';
  // rejoin: re-enter an existing session (e.g. after accidentally leaving).
  const rejoin   = location.state?.rejoin || false;
  // The room's real-time channel, where call events arrive. Fetched from
  // GET /unitedchat/rooms/{roomId} when the navigation state lacks it.
  const roomChannel = location.state?.realtimeChannel || null;
  // Did THIS user just start the call? (The start response marks the caller
  // with `is_caller`; a rejoin is not ringing anybody.)
  const isCaller = !rejoin && (session?.participants || []).some(
    (p) => p.is_caller && p.user_id === user.user_id,
  );
  // `call_type` is '1to1' when exactly one other person was rung.
  const isOneToOneCall = session?.call_type === '1to1';

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
  // Has any other participant entered the media channel yet?
  const peerJoinedRef    = useRef(false);
  // Latest exitCall / call-event handler, for callbacks registered earlier
  const exitCallRef      = useRef(() => {});
  const callEventRef     = useRef(() => {});
  const exitTimerRef     = useRef(null);
  // Why the call ended on its own ("Declined", "No answer", …), shown briefly
  const [endNotice, setEndNotice] = useState('');
  // Bumped on `call_accepted` to restart the caller's ring timeout (Step 5).
  const [ringRestarts, setRingRestarts] = useState(0);

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
    let cancelled = false;

    /*
     * The session carries the channel name the server actually allocated —
     * never derive one from the session id or room id. A publisher token is
     * signed with the session's channel and uid, so a locally-invented channel
     * would be rejected (and, before it was rejected, would have run on a
     * channel the server could not meter).
     */
    const channelName = session?.channel_name;
    const uid = Math.abs(hashCode(user.user_id)) % 100000;

    if (rejoin && sessionId) {
      // Re-entering a call you left: POST …/video-call/accept FIRST. It puts
      // you back to `active` in the session; without it the server still
      // counts you as `left` (and ends the call when the last other active
      // participant goes). joined-rtc + heartbeat follow once media is up
      // (Step 3), exactly as for a first join.
      (async () => {
        try {
          await unitedChat.acceptVideoCall(roomId, user.user_id, sessionId);
        } catch (err) {
          if (cancelled) return;
          if (err.status === 410) {
            exitCallRef.current({ notice: 'This call has already ended' });
          } else {
            setStatusText(`Could not rejoin the call: ${err.message}`);
          }
          return;
        }
        if (!cancelled) joinRtcSession(channelName, uid, sessionId);
      })();
    } else {
      joinRtcSession(channelName, uid, sessionId);
    }
    loadChatMessages();

    chatPollRef.current = setInterval(loadChatMessages, 5000);

    return () => {
      cancelled = true;
      clearInterval(chatPollRef.current);
      // Invalidate any in-flight startCaptions BEFORE stopping the handle —
      // otherwise a pending language fetch would resolve after unmount and
      // spawn an ownerless (still billed!) caption stream.
      ccSeqRef.current += 1;
      ccHandleRef.current?.stop();
      rtcSessionRef.current?.leave().catch(() => {});
    };
  }, [permStatus]);

  // ── Step 3: Report media presence + keep the session alive ───────────────
  // joined-rtc (once, retried while the server reports `matched: false`)
  // anchors the call's measured duration to real media presence. The
  // heartbeat (every 60 s) tells HyperBabel the call is still live — without
  // it a long call looks abandoned and can be closed by the server.
  useEffect(() => {
    if (!connected || !sessionId) return undefined;
    let stopped = false;
    let retryTimer = null;

    // `matched: false` = the stamp did not land yet (e.g. the callee's accept
    // is not stored yet) — retry up to 5 times, 2 s apart.
    const stampJoined = (attempt = 1) => {
      unitedChat.markJoinedRtc(roomId, user.user_id, sessionId)
        .then((res) => {
          if (!res?.matched && attempt < 5 && !stopped) {
            retryTimer = setTimeout(() => stampJoined(attempt + 1), 2000);
          }
        })
        .catch(() => { /* non-critical — the accept time is the fallback */ });
    };
    stampJoined();

    const beat = () => {
      unitedChat.sendVideoCallHeartbeat(roomId, user.user_id, sessionId).catch(() => {});
    };
    beat();
    const heartbeat = setInterval(beat, 60_000);

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(heartbeat);
    };
  }, [connected, sessionId, roomId, user.user_id]);

  // ── Step 4: Call events on the room's real-time channel ──────────────────
  // Subscribes only its own listener; unsubscribing never detaches the
  // channel, which the chat screen may also be using.
  useEffect(() => {
    if (!sessionId) return undefined;
    let stop = null;
    let cancelled = false;

    (async () => {
      let channel = roomChannel;
      if (!channel) {
        try {
          const res = await unitedChat.getRoom(roomId, user.user_id);
          channel = (res.room || res)?.realtime_channel;
        } catch { /* no channel — the polling safety net below still applies */ }
      }
      if (cancelled || !channel) return;
      try {
        const rt = await realtimeService.init(user.user_id, user.display_name, user.preferred_lang_cd);
        if (cancelled) return;
        stop = rt.subscribeToRoom(channel, (event) => callEventRef.current(event));
      } catch { /* real-time unavailable */ }
    })();

    return () => {
      cancelled = true;
      if (typeof stop === 'function') stop();
    };
  }, [sessionId, roomId, roomChannel, user.user_id, user.display_name, user.preferred_lang_cd]);

  // ── Step 5: Ring timeout — the caller hangs up when nobody joins ─────────
  // Restarted on `call_accepted`, so an answer in the last seconds of the
  // ring still has time to reach the media channel.
  useEffect(() => {
    if (!connected || !isCaller) return undefined;
    const timer = setTimeout(() => {
      const anyoneJoined =
        peerJoinedRef.current || (rtcSessionRef.current?.getRemoteUsers()?.length ?? 0) > 0;
      if (!anyoneJoined) exitCallRef.current({ leaveSession: true, notice: 'No answer' });
    }, RING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [connected, isCaller, ringRestarts]);

  // Cancel a pending "return to chat" if the page unmounts first.
  useEffect(() => () => clearTimeout(exitTimerRef.current), []);

  const hashCode = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  };

  const joinRtcSession = async (channelName, uid, sessionId) => {
    try {
      setStatusText('Requesting session credentials...');
      // `sessionId` is REQUIRED for a publisher token: HyperBabel checks that
      // this user is a participant of that session and signs the token with the
      // session's channel name and uid.
      const rtcChannelSession = await rtcService.joinChannel(channelName, uid, 'publisher', {
        sessionId,
        externalUserId: user.user_id,
        userName: user.display_name,
        preferredLangCd: user.preferred_lang_cd,
      });

      rtcSessionRef.current = rtcChannelSession;
      if (sessionEndedRef.current) {
        // The call ended (or the user left) while we were still joining.
        await rtcChannelSession.leave().catch(() => {});
        return;
      }

      // Register every handler BEFORE publishing: participants already in the
      // channel are reported right after the join, and publishing the local
      // camera takes long enough for those events to be missed otherwise.
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

      rtcChannelSession.onPeerJoined(() => { peerJoinedRef.current = true; });

      // Hang up once nobody else is left in the media channel. `remaining` is
      // counted after the leave event settled, so a group call carries on
      // while at least one other participant is still here.
      rtcChannelSession.onPeerLeft(({ user: leftUser, remaining }) => {
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== leftUser.uid));
        if (remaining === 0) exitCallRef.current({ leaveSession: true });
      });

      rtcChannelSession.onConnectionChange((state) => {
        if (state === 'CONNECTED') { setConnected(true); setStatusText('Connected'); }
      });

      // RTC tokens are valid for one hour. Swap in a fresh one before it
      // expires — without this every call drops at the one-hour mark.
      rtcChannelSession.onTokenWillExpire(async () => {
        try {
          const fresh = await unitedChat.renewVideoCallToken(roomId, user.user_id, sessionId);
          await rtcChannelSession.renewToken(fresh.rtc_token);
        } catch (err) {
          console.warn('RTC token renewal failed:', err?.message);
        }
      });

      // The token already expired (the renewal above did not get through):
      // the media connection is gone — join again with a fresh token.
      rtcChannelSession.onTokenExpired(async () => {
        try {
          const fresh = await unitedChat.renewVideoCallToken(roomId, user.user_id, sessionId);
          await rtcChannelSession.rejoin(fresh.rtc_token);
        } catch (err) {
          console.warn('RTC rejoin after token expiry failed:', err?.message);
          exitCallRef.current({ leaveSession: true, notice: 'Connection lost' });
        }
      });

      setStatusText('Publishing local tracks...');
      await rtcChannelSession.publishLocalTracks(localVideoRef.current, true, true);

      setConnected(true);
      setStatusText('Connected');
    } catch (err) {
      console.error('RTC join failed:', err);
      setStatusText(`Connection failed: ${err.message}`);
    }
  };

  // ── In-call Chat with Auto-Translation ─────────────────────────────────
  // Incoming messages from other participants are translated into this
  // user's preferred language (preferred_lang_cd) with United Chat
  // batch-translate, which works with the end-user token. (The standalone
  // /translate/* endpoints need your organization API key — backend only.)

  const loadChatMessages = async () => {
    try {
      const data = await unitedChat.getMessages(roomId, { limit: 50 });
      // History comes newest first — reverse it so the list reads top-down
      // (oldest → newest) like every chat, with the latest at the bottom.
      const msgs = [...(data.messages || [])].reverse();

      // Auto-translate messages from other users into my preferred language.
      // HyperBabel stores each translation on the message (`translated_content`
      // is a { [lang]: text } map), so only ask for the ones not yet in my
      // language — the next poll returns them pre-translated.
      if (msgs.length > 0 && user.preferred_lang_cd) {
        const myLang = user.preferred_lang_cd.split('-')[0];
        const untranslatedIds = msgs
          .filter((m) =>
            m.sender_id !== user.user_id &&
            m.message_type === 'text' &&
            m.sender_lang_cd !== myLang &&
            !m.translated_content?.[myLang])
          .map((m) => m.id);

        if (untranslatedIds.length > 0) {
          try {
            // Response: { translations: { [messageId]: text }, limited?: true }
            const { translations = {} } = await unitedChat.batchTranslateMessages(
              roomId,
              untranslatedIds,
              user.preferred_lang_cd,
            );
            setChatMessages(msgs.map((m) =>
              translations[m.id] ? { ...m, translated_content: translations[m.id] } : m
            ));
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

  // ── Safety net: the call ended but the real-time event was missed ─────────
  // Group calls only: every 10 s, ask whether this session is still the live
  // call in the room. Errors are ignored — a network blip must not end the
  // call; only a definite "no longer live" answer leaves the screen.
  useEffect(() => {
    if (roomType !== 'group' || !connected || !sessionId) return undefined;

    const interval = setInterval(async () => {
      if (sessionEndedRef.current) { clearInterval(interval); return; }
      try {
        // { active: false, session: null } when no call is live in the room
        const data = await unitedChat.getActiveVideoCall(roomId);
        if (!data?.active || data.session?.id !== sessionId) {
          clearInterval(interval);
          exitCallRef.current();
        }
      } catch { /* transient — try again on the next tick */ }
    }, 10_000);

    return () => clearInterval(interval);
  }, [connected, roomType, roomId, sessionId]);

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
        sessionId,
        roomId,
        onCaption: (msg) => {
          if (seq !== ccSeqRef.current) return; // stale session — ignore
          setCcError(''); // captions are flowing again — drop a transient notice
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
        onError: (message, { fatal } = {}) => {
          if (seq !== ccSeqRef.current) return; // stale session — ignore
          console.error('Live captions error:', message, fatal ? '(fatal)' : '(transient)');
          // Surface in a visible banner — statusText only renders pre-connect,
          // so mid-call failures (e.g. limit_exceeded) would be invisible.
          // A transient error (`fatal: false`) leaves captions running; the
          // notice clears itself when the next caption arrives.
          setCcError(fatal ? `Live captions stopped: ${message}` : `Live captions: ${message} — still listening`);
        },
      });
    } catch (err) {
      console.error('Failed to start live captions:', err);
      if (seq === ccSeqRef.current) {
        setCcStatus('off');
        setCcError(`Live captions stopped: ${err?.message || 'Failed to start live captions.'}`);
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
    try { await unitedChat.leaveVideoCall(roomId, user.user_id, sessionId); } catch { /* May be ended */ }
    navigate(`/chat/${roomId}`);
  };

  const handleEndCall = async () => {
    sessionEndedRef.current = true; // prevent auto-exit from firing after manual end
    stopCaptions();
    await rtcSessionRef.current?.leave().catch(() => {});
    try {
      await unitedChat.endVideoCall(roomId, user.user_id, sessionId);
    } catch (err) {
      // Only the caller, the room owner or a sub-admin may end the call for
      // everyone (403 for anyone else, e.g. the callee in a 1:1 room they did
      // not create). Hang up by leaving instead — the server ends the session
      // once one participant or fewer remain.
      if (err.status === 403) {
        try { await unitedChat.leaveVideoCall(roomId, user.user_id, sessionId); } catch { /* May be ended */ }
      }
    }
    navigate(`/chat/${roomId}`);
  };

  // ── Leaving the screen without a button press ───────────────────────────
  // `leaveSession` also tells HyperBabel we hung up (POST …/video-call/leave —
  // the server ends the call once one participant or fewer remain). It is
  // skipped when the call already ended server-side.
  const exitCall = async ({ leaveSession = false, notice = '' } = {}) => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    stopCaptions();
    await rtcSessionRef.current?.leave().catch(() => {});
    if (leaveSession) {
      try { await unitedChat.leaveVideoCall(roomId, user.user_id, sessionId); } catch { /* May be ended */ }
    }
    if (notice) {
      setEndNotice(notice); // shown for a moment, then back to the chat
      exitTimerRef.current = setTimeout(() => navigate(`/chat/${roomId}`, { replace: true }), 2000);
    } else {
      navigate(`/chat/${roomId}`, { replace: true });
    }
  };

  /** Is another participant in the media channel now, or was one earlier? */
  const hasPeerJoined = () =>
    peerJoinedRef.current || (rtcSessionRef.current?.getRemoteUsers()?.length ?? 0) > 0;

  // Call events for THIS session from the room channel (Step 4). They are
  // `video_call` system messages: event 'message', payload
  // { type: 'message', data: { message_type: 'video_call', metadata: { event, session_id, … } } }.
  const handleCallEvent = ({ message, type }) => {
    const data = type === 'message' ? message?.data : null;
    if (data?.message_type !== 'video_call') return;
    const meta = data.metadata || {};
    if (!sessionId || meta.session_id !== sessionId) return;

    if (meta.event === 'call_ended') {
      exitCall(); // the session is already over — nothing to tell the server
      return;
    }
    // Someone answered: give them a fresh 45 s to join the media channel.
    if (meta.event === 'call_accepted') {
      if (isCaller && !hasPeerJoined()) setRingRestarts((n) => n + 1);
      return;
    }
    // The 1:1 callee declined / missed / was busy while it was still ringing.
    // Group calls ignore these: one callee declining must not end the call.
    const notice = DECLINE_NOTICE[meta.event];
    if (notice && isCaller && isOneToOneCall && !hasPeerJoined()) {
      exitCall({ leaveSession: true, notice });
    }
  };

  // Callbacks registered earlier (RTC handlers, timers, the room
  // subscription) always reach the latest version of these.
  useEffect(() => {
    exitCallRef.current = exitCall;
    callEventRef.current = handleCallEvent;
  });

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
                ref={(el) => {
                  // The video track can arrive before this tile exists — play
                  // it as soon as the element mounts (once per element).
                  if (el && remoteVideoRefs.current[ru.uid] !== el) {
                    remoteVideoRefs.current[ru.uid] = el;
                    ru.videoTrack?.play(el);
                  }
                }}
                autoPlay playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--hb-radius)' }}
              />
              <div className="video-tile-name">Participant {ru.uid}</div>
            </div>
          ))}
        </div>

        {/* Why the call ended on its own — shown briefly before returning to chat */}
        {endNotice && (
          <div style={{
            padding: '10px 16px',
            background: 'rgba(0,0,0,0.85)',
            color: '#fff',
            fontWeight: 600,
            textAlign: 'center',
          }}>
            {endNotice} — returning to the chat…
          </div>
        )}

        {/* Captions error banner — a fatal one persists until the next CC
            start; a transient one clears when captions flow again */}
        {ccError && (
          <div style={{
            padding: '6px 16px',
            background: 'rgba(180,40,40,0.9)',
            color: '#fff',
            fontSize: '0.8rem',
            textAlign: 'center',
          }}>
            {ccError}
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
