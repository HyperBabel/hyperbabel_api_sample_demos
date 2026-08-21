/**
 * Stream host — opens a session, joins as broadcaster, and renders the
 * local preview track. Customers replace the on-screen "GO LIVE" prompt
 * with whatever capture / production surface they wire in.
 */

import * as stream from '../api/stream.js';
import * as videoEngine from '../video/hyperbabelVideo.js';

export async function renderStreamHost(navigate) {
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');
  if (!user.user_id) return navigate('#/login');

  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="row" style="margin-bottom: 12px;">
      <button id="back" class="btn-ghost">← Back</button>
      <div style="text-align: right;"><h2 style="margin: 0;">📡 Hosting…</h2></div>
    </div>
    <div id="stage" class="video-stage">
      <div class="video-tile" id="local-tile"><div class="label">You (broadcasting)</div></div>
    </div>
    <p id="status" class="muted" style="margin-top: 12px;">Setting up…</p>
    <button id="end" class="btn-danger" style="margin-top: 12px;">End Stream</button>
  `;

  document.getElementById('back').onclick = endAndGoBack;

  let session = null;
  let localTracks = null;
  let heartbeatId = null;

  try {
    session = await stream.createSession({
      hostUserId: user.user_id,
      hostName: user.display_name || user.user_id,
      title: `Live from ${user.display_name || user.user_id}`,
    });
    if (!session?.session_id) throw new Error('Server did not return a session.');
    // The create response already carries a 24-hour host token, the channel name
    // and the uid — join with those instead of asking for a second credential.
    // `/rtm/rtc/token` only issues publisher tokens for video-call sessions.
    const host = session.host ?? {};
    if (!host.rtc_token || !session.app_id) {
      throw new Error('Server did not return a host token.');
    }
    await videoEngine.joinWithToken({
      appId: session.app_id,
      channelName: session.channel_name,
      token: host.rtc_token,
      uid: host.uid,
      // Broadcast: the audience size never changes the tier — see video/videoQuality.js.
      sessionKind: 'broadcast',
    });
    localTracks = await videoEngine.publishLocalTracks();
    localTracks.video.play('local-tile');
    await stream.startSession(session.session_id, user.user_id).catch(() => {});

    // Heartbeat — POST every 30s while live so the server can detect a
    // tab crash within minutes and bill only the actual stream time.
    const beat = () => stream.heartbeat(session.session_id).catch(() => {});
    beat();
    heartbeatId = setInterval(beat, 30000);

    document.getElementById('status').textContent = '🔴 You are live.';
  } catch (err) {
    document.getElementById('status').textContent = `Failed to go live: ${err.message}`;
  }

  document.getElementById('end').onclick = endAndGoBack;

  async function endAndGoBack() {
    if (heartbeatId) { clearInterval(heartbeatId); heartbeatId = null; }
    try { await videoEngine.leaveCall(localTracks); } catch {}
    try {
      if (session?.session_id) await stream.endSession(session.session_id, user.user_id);
    } catch {}
    navigate('#/streams');
  }

  window.addEventListener('hashchange', () => {
    if (heartbeatId) { clearInterval(heartbeatId); heartbeatId = null; }
    videoEngine.leaveCall(localTracks).catch(() => {});
  }, { once: true });
}
