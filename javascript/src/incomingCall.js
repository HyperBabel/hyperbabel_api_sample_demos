/**
 * Global incoming-call overlay — subscribes to the user's HyperBabel private
 * channel after login and shows a fullscreen Accept / Reject prompt when a
 * call invite arrives. Mounted exactly once from main.js.
 *
 * Invites are published under the real-time event name `signal` with
 * `data.type === 'CALL_INVITE'`. Other `signal` types (e.g. `CALL_BUSY`) share
 * the channel, so match on the type, not just the event name. Accept and
 * Reject both report back to the server with the invite's `sessionId`.
 *
 * While ringing, the overlay also watches the room (`roomSignalChannel`): it
 * closes when the caller hangs up (`call_ended`), and after 45 s it reports a
 * missed call and closes.
 */

import * as realtime from './realtime/hyperbabelRealtime.js';
import * as unitedChat from './api/unitedChat.js';
import { callEventOf } from './callEvents.js';

/** How long an unanswered invite rings before it counts as missed. */
const RING_TIMEOUT_MS = 45_000;

let _unsubscribe = null;

export async function ensureIncomingCallListener(navigate) {
  if (_unsubscribe) return;
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');
  if (!user.user_id) return;
  try {
    await realtime.connect(user);
    _unsubscribe = realtime.subscribePrivate(user.user_id, ({ event, data }) => {
      if (event !== 'signal' || data?.type !== 'CALL_INVITE') return;
      showOverlay(data, navigate, user);
    });
  } catch (err) {
    console.warn('[incoming-call] real-time not available:', err.message);
  }
}

export function teardownIncomingCallListener() {
  try { _unsubscribe?.(); } catch {}
  _unsubscribe = null;
}

function showOverlay(invite, navigate, user) {
  if (document.getElementById('hb-incoming-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'hb-incoming-overlay';
  overlay.style.cssText =
    'position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 1000;';
  const callerName = invite.callerName || invite.callerId || 'Unknown';
  const roomId = invite.roomId || '';
  const sessionId = invite.sessionId || '';
  const callType = invite.callType || '1to1';
  overlay.innerHTML = `
    <div style="text-align: center; padding: 32px; max-width: 320px;">
      <div style="font-size: 64px; margin-bottom: 12px;">📹</div>
      <div class="muted">Incoming ${callType} call</div>
      <h2 style="margin: 4px 0;">${callerName.replace(/[<>]/g, '')}</h2>
      <div class="muted" style="font-size: 11px;">Room ${roomId}</div>
      <div class="row" style="margin-top: 24px; gap: 16px; justify-content: center;">
        <button id="hb-reject" class="btn-danger" style="border-radius: 50%; width: 56px; height: 56px; font-size: 24px;">✕</button>
        <button id="hb-accept" style="background: #10b981; border-radius: 50%; width: 56px; height: 56px; font-size: 24px;">✓</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Close exactly once, however the ringing ends.
  let closed = false;
  let ringTimer = null;
  let stopWatchingRoom = () => {};
  const close = () => {
    if (closed) return false;
    closed = true;
    clearTimeout(ringTimer);
    try { stopWatchingRoom(); } catch {}
    overlay.remove();
    return true;
  };

  // The caller hung up before anyone answered.
  if (invite.roomSignalChannel) {
    try {
      stopWatchingRoom = realtime.subscribeRoom(invite.roomSignalChannel, (evt) => {
        const ev = callEventOf(evt);
        if (ev?.event === 'call_ended' && ev.sessionId === sessionId) close();
      });
    } catch (err) {
      console.warn('[incoming-call] could not watch the room:', err.message);
    }
  }

  // Nobody answered — tell the caller ("Missed call") and stop ringing.
  ringTimer = setTimeout(() => {
    if (!close()) return;
    if (roomId && sessionId) {
      unitedChat.rejectVideoCall(roomId, user.user_id, sessionId, 'missed').catch(() => {});
    }
  }, RING_TIMEOUT_MS);

  document.getElementById('hb-accept').onclick = async () => {
    if (!close()) return;
    if (!roomId || !sessionId) return;
    try {
      // Accept BEFORE joining: it marks you active on the session. A 410
      // means the caller hung up before you answered.
      await unitedChat.acceptVideoCall(roomId, user.user_id, sessionId);
    } catch (err) {
      alert(`Could not join the call: ${err.message}`);
      return;
    }
    navigate(`#/video/${roomId}`);
  };
  document.getElementById('hb-reject').onclick = async () => {
    if (!close()) return;
    if (roomId && sessionId) {
      try { await unitedChat.rejectVideoCall(roomId, user.user_id, sessionId); } catch {}
    }
  };
}
