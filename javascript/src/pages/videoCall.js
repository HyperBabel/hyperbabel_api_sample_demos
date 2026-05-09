/**
 * Video call page — joins the active call session for a room, publishes the
 * local camera/mic, and renders any remote tracks the SDK delivers.
 */

import * as unitedChat from '../api/unitedChat.js';
import * as videoEngine from '../video/hyperbabelVideo.js';

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
    <p id="status" class="muted" style="margin-top: 12px;">Connecting…</p>
  `;

  let localTracks = null;

  try {
    const active = await unitedChat.getActiveVideoCall(roomId);
    const session = active?.session;
    if (!session) {
      document.getElementById('status').textContent = 'No active session for this room.';
      return;
    }

    await videoEngine.joinCall({
      channelName: session.channel_name,
      uid: session.uid ?? Math.floor(Math.random() * 1_000_000),
      role: 'publisher',
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

  async function hangup() {
    try { await videoEngine.leaveCall(localTracks); } catch {}
    try { await unitedChat.leaveVideoCall(roomId, user.user_id); } catch {}
    navigate(`#/chat/${roomId}`);
  }

  document.getElementById('hangup').onclick = hangup;
  window.addEventListener('hashchange', () => { videoEngine.leaveCall(localTracks).catch(() => {}); }, { once: true });
}
