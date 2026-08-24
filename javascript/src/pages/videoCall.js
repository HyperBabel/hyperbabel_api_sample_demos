/**
 * Video call page — joins the active call session for a room, publishes the
 * local camera/mic, and renders any remote tracks the SDK delivers.
 */

import * as unitedChat from '../api/unitedChat.js';
import * as videoEngine from '../video/hyperbabelVideo.js';
import { startLiveCaptions } from '../video/liveCaptions.js';

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

  try {
    const active = await unitedChat.getActiveVideoCall(roomId);
    const session = active?.session;
    if (!session) {
      document.getElementById('status').textContent = 'No active session for this room.';
      return;
    }
    activeSessionId = session.id;

    await videoEngine.joinCall({
      channelName: session.channel_name,
      uid: session.uid ?? Math.floor(Math.random() * 1_000_000),
      role: 'publisher',
      // Publisher tokens are session-scoped: HyperBabel checks that this user is
      // a participant and signs the token with the session's channel + uid.
      sessionId: session.id,
      externalUserId: user.user_id,
    });

    localTracks = await videoEngine.publishLocalTracks();
    localTracks.video.play('local-tile');
    document.getElementById('status').textContent = 'Connected.';

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
      // Auto-leave when the only peer disconnects (1:1 case).
      hangup();
    });
  } catch (err) {
    document.getElementById('status').textContent = `Failed to start call: ${err.message}`;
  }

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
      onError: (message) => {
        if (ccSession !== mySession) return; // stale session — ignore
        document.getElementById('status').textContent = `Captions: ${message}`;
        stopCaptions();
      },
    });
  }

  ccBtn.onclick = () => (ccHandle ? stopCaptions() : startCaptions());
  // The translation pair is fixed per relay connection — restart on change.
  ccSelect.onchange = () => { if (ccHandle) { stopCaptions(); startCaptions(); } };

  async function hangup() {
    stopCaptions();
    try { await videoEngine.leaveCall(localTracks); } catch {}
    try { await unitedChat.leaveVideoCall(roomId, user.user_id); } catch {}
    navigate(`#/chat/${roomId}`);
  }

  document.getElementById('hangup').onclick = hangup;
  window.addEventListener('hashchange', () => {
    stopCaptions();
    videoEngine.leaveCall(localTracks).catch(() => {});
  }, { once: true });
}
