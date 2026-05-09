/**
 * Global incoming-call overlay — subscribes to the user's HyperBabel private
 * channel after login and shows a fullscreen Accept / Reject prompt when a
 * CALL_INVITE arrives. Mounted exactly once from main.js.
 */

import * as realtime from './realtime/hyperbabelRealtime.js';
import * as unitedChat from './api/unitedChat.js';

let _unsubscribe = null;

export async function ensureIncomingCallListener(navigate) {
  if (_unsubscribe) return;
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');
  if (!user.user_id) return;
  try {
    await realtime.connect(user);
    _unsubscribe = realtime.subscribePrivate(user.user_id, ({ event, data }) => {
      if (event !== 'CALL_INVITE' && event !== 'video_call.started') return;
      const invite = data || {};
      showOverlay(invite, navigate, user);
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
  const callerName = invite.caller_name || invite.callerName || invite.caller_id || 'Unknown';
  const roomId = invite.room_id || invite.roomId || '';
  const callType = invite.call_type || invite.callType || '1to1';
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

  document.getElementById('hb-accept').onclick = () => {
    overlay.remove();
    if (roomId) navigate(`#/video/${roomId}`);
  };
  document.getElementById('hb-reject').onclick = async () => {
    overlay.remove();
    if (roomId) {
      try { await unitedChat.rejectVideoCall(roomId, user.user_id); } catch {}
    }
  };
}
