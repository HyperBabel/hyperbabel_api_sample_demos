/**
 * Video call page — joins the active call session for a room, publishes the
 * local camera/mic, and renders any remote tracks the SDK delivers.
 *
 * While the page is open it keeps the session healthy (all calls carry the
 * session id):
 *   - POST …/video-call/joined-rtc   once, right after the media join
 *   - POST …/video-call/heartbeat    every 60 s
 *   - POST …/video-call/renew-token  when the 1-hour RTC token is about to expire
 *   - POST …/video-call/leave        on hang-up or when the page is left
 *
 * It also follows the call's events on the room channel (see callEvents.js):
 * `call_ended` closes the page for everyone; the caller of a 1:1 call stops
 * waiting on a decline / missed / busy, and any caller gives up when nobody
 * has joined after 45 s.
 */

import * as unitedChat from '../api/unitedChat.js';
import * as realtime from '../realtime/hyperbabelRealtime.js';
import * as videoEngine from '../video/hyperbabelVideo.js';
import { startLiveCaptions } from '../video/liveCaptions.js';
import { callEventOf } from '../callEvents.js';

/**
 * The server ends an active call whose last heartbeat is more than 10 minutes
 * old (and a call nobody accepted within 3 minutes). One beat a minute keeps a
 * long call alive.
 */
const CALL_HEARTBEAT_MS = 60_000;

/** How long the caller waits for someone to join before giving up. */
const RING_TIMEOUT_MS = 45_000;

export async function renderVideoCall(roomId, navigate) {
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');
  if (!user.user_id) return navigate('#/login');

  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="row" style="margin-bottom: 12px;">
      <div><h2 style="margin: 0;">Video call</h2></div>
      <div style="text-align: right;">
        <button id="hangup" class="btn-danger">Hang up</button>
      </div>
    </div>
    <div id="stage" class="video-stage">
      <div class="video-tile" id="local-tile"><div class="label">You</div></div>
      <div class="video-tile" id="remote-tile"><div class="label">Waiting for peer…</div></div>
    </div>
    <!-- Live caption strip: original transcript + translation on the next line -->
    <div id="cc-strip" style="display:none; margin-top:8px; padding:10px 16px; background:rgba(0,0,0,.75); border-radius:8px; text-align:center; min-height:52px;">
      <div id="cc-orig" style="color:#fff; font-size:1rem; line-height:1.4;"></div>
      <div id="cc-tr" style="color:#fbbf24; font-size:.9rem; line-height:1.4;"></div>
    </div>
    <div class="row" style="margin-top:8px; align-items:center; gap:8px;">
      <button id="cc-toggle" class="btn-secondary">CC — Live captions</button>
      <label class="muted" style="font-size:.8rem;">Translate to
        <select id="cc-target" style="margin-left:4px;">
          <option value="en">English</option><option value="ko">한국어 (Korean)</option>
          <option value="es">Español (Spanish)</option><option value="ja">日本語 (Japanese)</option>
          <option value="zh">中文 (Chinese)</option><option value="fr">Français (French)</option>
          <option value="de">Deutsch (German)</option><option value="hi">हिन्दी (Hindi)</option>
        </select>
      </label>
    </div>
    <p id="status" class="muted" style="margin-top: 12px;">Connecting…</p>
  `;

  let localTracks = null;
  let ccHandle = null;
  let ccSession = null;   // identity token for the ACTIVE captions session —
                          // stale callbacks from a stopped session are ignored
  let activeSessionId = null;
  let heartbeatId = null;
  let tornDown = false;
  let joinPromise = null;     // in-flight media join — teardown waits for it
  let tracksPromise = null;   // in-flight camera/mic start — same
  // Call-event state (see the header).
  let isCaller = false;
  let callType = '1to1';
  let remoteJoined = false;
  let sessionEnded = false;   // the server already ended it — no /leave needed
  let ringTimer = null;
  let stopWatchingRoom = () => {};

  const setStatus = (text) => {
    const el = document.getElementById('status');
    if (el) el.textContent = text;
  };

  // Registered before the first await, so leaving the page while it is still
  // connecting cannot leave the camera, the channel or the heartbeat running.
  document.getElementById('hangup').onclick = hangup;
  window.addEventListener('hashchange', () => { teardown(); }, { once: true });

  // ── Live captions (HyperBabel Speech Translation) ────────────────────────
  // Streams the local mic to the speech-translation relay; the strip shows the
  // live transcript with its translation underneath. Metered per minute of
  // audio sent (org plan allowance) — the CC toggle is also the cost control.
  // Guide: https://hyperbabel.com/docs#stt-api
  const ccStrip  = document.getElementById('cc-strip');
  const ccOrigEl = document.getElementById('cc-orig');
  const ccTrEl   = document.getElementById('cc-tr');
  const ccBtn    = document.getElementById('cc-toggle');
  const ccSelect = document.getElementById('cc-target');

  // Default target: the opposite of the speaker's language for a quick demo.
  const myLang = (user.preferred_lang_cd || 'en').toLowerCase();
  ccSelect.value = myLang.split('-')[0] === 'en' ? 'ko' : 'en';

  function stopCaptions() {
    ccSession = null;      // invalidate FIRST so the old session's late
    const h = ccHandle;    // callbacks (EOS flush, error) can't touch the UI
    ccHandle = null;
    h?.stop();
    ccStrip.style.display = 'none';
    ccOrigEl.textContent = '';
    ccTrEl.textContent = '';
    ccBtn.classList.remove('btn-primary');
    ccBtn.classList.add('btn-secondary');
  }

  function startCaptions() {
    ccStrip.style.display = 'block';
    ccOrigEl.textContent = 'Starting live captions…';
    ccBtn.classList.remove('btn-secondary');
    ccBtn.classList.add('btn-primary');
    const mySession = {};
    ccSession = mySession;
    ccHandle = startLiveCaptions({
      lang: myLang,
      translateTo: ccSelect.value,
      sessionId: activeSessionId,
      roomId,
      onCaption: (msg) => {
        if (ccSession !== mySession) return; // stale session — ignore
        // partial replaces the live line; final stays until the next partial.
        if (msg.kind === 'partial' || msg.kind === 'final') ccOrigEl.textContent = msg.text || '';
        else ccTrEl.textContent = msg.text || '';
      },
      onStatus: (st) => {
        if (ccSession !== mySession) return; // stale session — ignore
        if (st === 'ready' && ccOrigEl.textContent === 'Starting live captions…') {
          ccOrigEl.textContent = 'Listening… start speaking.';
        }
        // Relay/network closed the socket on its own (not via our stop):
        // reset the UI so the button doesn't pretend captions are still live.
        if (st === 'closed' && ccHandle) stopCaptions();
      },
      onError: (message, { fatal } = {}) => {
        if (ccSession !== mySession) return; // stale session — ignore
        if (!fatal) {
          // Transient — the session is still running; just say so.
          setStatus(`Captions: ${message} (still listening)`);
          return;
        }
        setStatus(`Captions stopped: ${message}`);
        stopCaptions();
      },
    });
  }

  ccBtn.onclick = () => (ccHandle ? stopCaptions() : startCaptions());
  // The translation pair is fixed per relay connection — restart on change.
  ccSelect.onchange = () => { if (ccHandle) { stopCaptions(); startCaptions(); } };

  try {
    const active = await unitedChat.getActiveVideoCall(roomId);
    if (tornDown) return;
    const session = active?.session;
    if (!session) {
      setStatus('No active session for this room.');
      return;
    }
    activeSessionId = session.id;

    // `is_caller` marks the participant who placed the call.
    const participants = session.participants || [];
    isCaller = participants.some((p) => p.user_id === user.user_id && p.is_caller === true);
    callType = session.call_type || '1to1';
    // Someone else already accepted — e.g. this page was reloaded mid-call.
    const answered = participants.some(
      (p) => p.user_id !== user.user_id && p.status === 'active',
    );

    // Watch the room before joining so a quick decline is not missed.
    await watchCallEvents();
    if (tornDown) return;
    if (isCaller && !answered) startRingTimer();

    // Listen BEFORE joining: people already in the channel are announced right
    // after the join, and an event that fires with no listener is lost.
    videoEngine.onTokenWillExpire(renewRtcToken);
    videoEngine.onRemoteUserJoined(() => {
      remoteJoined = true;
      clearTimeout(ringTimer);
      ringTimer = null;
    });
    videoEngine.onRemoteUserPublished((remoteUser, mediaType) => {
      if (mediaType === 'video' && remoteUser.videoTrack) {
        remoteUser.videoTrack.play('remote-tile');
        const tile = document.getElementById('remote-tile');
        if (tile) tile.querySelector('.label').textContent = `User ${remoteUser.uid}`;
      }
      if (mediaType === 'audio' && remoteUser.audioTrack) {
        remoteUser.audioTrack.play();
      }
    });
    videoEngine.onRemoteUserLeft(() => {
      // Hang up once NOBODY else is left — in a group call one peer leaving
      // does not end it. Count after this event's other listeners have run.
      setTimeout(() => {
        if (!tornDown && videoEngine.remoteParticipantCount() === 0) hangup();
      }, 0);
    });

    joinPromise = videoEngine.joinCall({
      channelName: session.channel_name,
      uid: session.uid ?? Math.floor(Math.random() * 1_000_000),
      role: 'publisher',
      // Publisher tokens are session-scoped: HyperBabel checks that this user is
      // a participant and signs the token with the session's channel + uid.
      sessionId: session.id,
      externalUserId: user.user_id,
    });
    await joinPromise;
    if (tornDown) return;   // teardown waited for this join and has left

    markJoinedRtc();
    startHeartbeat();

    tracksPromise = videoEngine.publishLocalTracks();
    localTracks = await tracksPromise;
    if (tornDown) return;
    localTracks.video.play('local-tile');
    setStatus('Connected.');
  } catch (err) {
    if (!tornDown) setStatus(`Failed to start call: ${err.message}`);
  }

  // ── Call events (room channel) ───────────────────────────────────────────

  async function watchCallEvents() {
    try {
      const roomRes = await unitedChat.getRoom(roomId, user.user_id);
      const channel = roomRes?.room?.realtime_channel;
      if (!channel) return;
      await realtime.connect(user);
      if (tornDown) return;
      stopWatchingRoom = realtime.subscribeRoom(channel, (evt) => {
        const ev = callEventOf(evt);
        if (!ev || ev.sessionId !== activeSessionId) return;
        // Someone answered: give them a fresh 45 s to reach the media channel,
        // so an answer in the last seconds of the ring still connects.
        if (ev.event === 'call_accepted') {
          if (ringTimer && !remoteJoined) startRingTimer();
          return;
        }
        if (ev.event === 'call_ended') {
          sessionEnded = true;
          finish('The call has ended.');
          return;
        }
        // A decline does not end the session. In a 1:1 call nobody else can
        // still answer, so the caller leaves (the server then ends it).
        if (isCaller && callType === '1to1' && !remoteJoined) {
          if (ev.event === 'call_rejected') finish('Call declined.');
          else if (ev.event === 'call_missed') finish('No answer.');
          else if (ev.event === 'call_busy') finish('Line busy.');
        }
      });
    } catch (err) {
      console.warn('[video-call] could not watch the room:', err.message);
    }
  }

  function startRingTimer() {
    clearTimeout(ringTimer);
    ringTimer = setTimeout(() => {
      ringTimer = null;
      if (tornDown || remoteJoined || videoEngine.remoteParticipantCount() > 0) return;
      finish('No answer.');
    }, RING_TIMEOUT_MS);
  }

  // Show why the call is over, clean up, then go back to the room.
  async function finish(reason) {
    if (tornDown) return;
    setStatus(reason);
    await teardown();
    setTimeout(() => {
      if (window.location.hash.startsWith('#/video/')) navigate(`#/chat/${roomId}`);
    }, 1500);
  }

  // ── Session upkeep ───────────────────────────────────────────────────────

  // Stamp the moment this participant is really in the media channel — call
  // billing is measured from here. `success: false` means it did not land
  // (e.g. the accept is not stored yet), so retry a few times.
  async function markJoinedRtc(attempt = 1) {
    if (tornDown) return;
    const res = await unitedChat
      .markJoinedRtc(roomId, user.user_id, activeSessionId)
      .catch(() => null);
    if (res?.success !== true && attempt < 5) {
      setTimeout(() => markJoinedRtc(attempt + 1), 2000);
    }
  }

  function startHeartbeat() {
    const beat = () =>
      unitedChat.sendCallHeartbeat(roomId, user.user_id, activeSessionId).catch(() => {});
    beat();
    heartbeatId = setInterval(beat, CALL_HEARTBEAT_MS);
  }

  // RTC tokens last one hour. Without a renewal the call drops at expiry.
  async function renewRtcToken() {
    try {
      const res = await unitedChat.renewVideoCallToken(roomId, user.user_id, activeSessionId);
      if (res?.rtc_token) await videoEngine.renewToken(res.rtc_token);
    } catch (err) {
      console.warn('[video-call] token renewal failed:', err.message);
    }
  }

  // Runs once, however the page is left.
  async function teardown() {
    if (tornDown) return;
    tornDown = true;
    stopCaptions();
    clearTimeout(ringTimer);
    try { stopWatchingRoom(); } catch {}
    if (heartbeatId) { clearInterval(heartbeatId); heartbeatId = null; }
    // Let an in-flight join / camera start settle first — leaving before it
    // resolves would leave the channel joined or the camera on.
    if (joinPromise) await joinPromise.catch(() => {});
    if (tracksPromise) localTracks = (await tracksPromise.catch(() => null)) || localTracks;
    try { await videoEngine.leaveCall(localTracks); } catch {}
    // Leave the CALL (not the chat room). The server ends the session once
    // one or no participant is left.
    if (activeSessionId && !sessionEnded) {
      try { await unitedChat.leaveVideoCall(roomId, user.user_id, activeSessionId); } catch {}
    }
  }

  async function hangup() {
    await teardown();
    navigate(`#/chat/${roomId}`);
  }
}
