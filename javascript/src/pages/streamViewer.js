/**
 * Stream viewer — exchanges a viewer token for a session, joins as audience,
 * and renders the host's video track in a remote tile.
 *
 * Needs your backend: `/stream/*` accepts only the organization API key, so
 * from this browser demo the viewer-token call fails (see api/stream.js). The
 * response handling below is what your app does with your backend's reply.
 */

import * as stream from '../api/stream.js';
import * as videoEngine from '../video/hyperbabelVideo.js';

export async function renderStreamViewer(sessionId, navigate) {
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');
  if (!user.user_id) return navigate('#/login');

  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="row" style="margin-bottom: 12px;">
      <button id="back" class="btn-ghost">← Back</button>
      <div style="text-align: right;"><h2 style="margin: 0;">📺 Watching…</h2></div>
    </div>
    <div id="stage" class="video-stage">
      <div class="video-tile" id="remote-tile"><div class="label">Waiting for the host…</div></div>
    </div>
    <p id="status" class="muted" style="margin-top: 12px;">Connecting…</p>
  `;

  document.getElementById('back').onclick = leaveAndGoBack;

  try {
    // FLAT response: { channel_name, uid, token, app_id, host_display_name, title, … }
    const tok = await stream.viewerToken(sessionId, user.user_id);
    if (!tok?.token || !tok.app_id) throw new Error('Server did not return a viewer token.');
    const hostName = tok.host_display_name || tok.host_user_id || 'Host';

    // Listen BEFORE joining: a host who is already publishing is announced
    // right after the join, and an event that fires with no listener is lost.
    // Only the host publishes (viewer tokens cannot), so the publisher is the host.
    let hostUid = null;
    videoEngine.onRemoteUserPublished((remoteUser, mediaType) => {
      hostUid = remoteUser.uid;
      if (mediaType === 'video' && remoteUser.videoTrack) {
        remoteUser.videoTrack.play('remote-tile');
        const tile = document.getElementById('remote-tile');
        if (tile) tile.querySelector('.label').textContent = hostName;
      }
      if (mediaType === 'audio' && remoteUser.audioTrack) remoteUser.audioTrack.play();
    });
    // Other viewers come and go in the same channel — leave only when the host does.
    videoEngine.onRemoteUserLeft((remoteUser) => {
      if (hostUid !== null && remoteUser.uid === hostUid) leaveAndGoBack();
    });

    // Join as audience with the subscriber token the server just issued.
    await videoEngine.joinWithToken({
      appId: tok.app_id,
      channelName: tok.channel_name,
      token: tok.token,
      uid: tok.uid,
      sessionKind: 'broadcast',
    });
    document.getElementById('status').textContent =
      `Connected${tok.title ? ` — ${tok.title}` : ''} (host: ${hostName}).`;
  } catch (err) {
    document.getElementById('status').textContent = `Failed to watch: ${err.message}`;
  }

  async function leaveAndGoBack() {
    try { await videoEngine.leaveCall(); } catch {}
    navigate('#/streams');
  }

  window.addEventListener('hashchange', () => {
    videoEngine.leaveCall().catch(() => {});
  }, { once: true });
}
