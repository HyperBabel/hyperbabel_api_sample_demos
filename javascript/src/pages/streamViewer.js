/**
 * Stream viewer — exchanges a viewer token for a session, joins as audience,
 * and renders the host's video track in a remote tile.
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
    const tok = await stream.viewerToken(sessionId, user.user_id);
    await videoEngine.joinCall({
      channelName: tok.channel_name,
      uid: tok.uid ?? Math.floor(Math.random() * 1_000_000),
      role: 'subscriber',
    });
    videoEngine.onRemoteUserPublished((remoteUser, mediaType) => {
      if (mediaType === 'video' && remoteUser.videoTrack) {
        remoteUser.videoTrack.play('remote-tile');
        const tile = document.getElementById('remote-tile');
        if (tile) tile.querySelector('.label').textContent = `Host (${remoteUser.uid})`;
      }
      if (mediaType === 'audio' && remoteUser.audioTrack) remoteUser.audioTrack.play();
    });
    videoEngine.onRemoteUserLeft(() => leaveAndGoBack());
    document.getElementById('status').textContent = 'Connected.';
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
