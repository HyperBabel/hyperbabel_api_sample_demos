/**
 * Settings page — profile, language, push tokens, a note on language
 * detection (it needs your backend), a link to the Block management
 * screen, and sign-out.
 *
 * Organization usage and plan data are not shown: they are business data for
 * your backend, read with the organization API key, and are not available to
 * end-user apps.
 */

import * as push from '../api/push.js';
import * as realtime from '../realtime/hyperbabelRealtime.js';
import { logoutAndClear } from '../api/firebaseAuth.js';
import { teardownIncomingCallListener } from '../incomingCall.js';

export async function renderSettings(navigate) {
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');
  if (!user.user_id) return navigate('#/login');

  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="row" style="margin-bottom: 12px;">
      <button id="back" class="btn-ghost">← Back</button>
      <div style="text-align: right;"><h2 style="margin: 0;">Settings</h2></div>
    </div>

    <div class="card">
      <h3 style="margin-top: 0;">Profile</h3>
      <div class="row"><div>User ID</div><div style="text-align: right;">${escapeHtml(user.user_id)}</div></div>
      <div class="row"><div>Display Name</div><div style="text-align: right;">${escapeHtml(user.display_name || '—')}</div></div>
      <div class="row"><div>Preferred Language</div><div style="text-align: right;">${escapeHtml(user.preferred_lang_cd || 'en')}</div></div>
    </div>

    <div class="card">
      <h3 style="margin-top: 0;">Privacy</h3>
      <button id="open-blocks">🚫 Blocked Users →</button>
    </div>

    <div class="card">
      <h3 style="margin-top: 0;">Push Tokens</h3>
      <div id="tokens">Loading…</div>
    </div>

    <div class="card">
      <h3 style="margin-top: 0;">Language Detection</h3>
      <p class="muted" style="margin: 0;">
        Needs your backend. <code>POST /translate/detect</code>, like every
        <code>/translate/*</code> endpoint, accepts only your organization API key,
        which must never ship in a browser — call it from your server
        (see <code>src/api/translate.js</code>). Signed-in users can still
        translate chat messages: in a room, open a message's actions and pick Translate.
      </p>
    </div>

    <div class="card">
      <button id="logout" class="btn-danger">Logout</button>
    </div>
  `;

  document.getElementById('back').onclick = () => navigate('#/home');
  document.getElementById('open-blocks').onclick = () => navigate('#/blocks');
  document.getElementById('logout').onclick = async (e) => {
    e.currentTarget.disabled = true;
    // Revokes the session (and this device's push tokens) on the server, then
    // clears local state — see logoutAndClear().
    await logoutAndClear();
    // Close the previous user's live connection. Left open, this tab would
    // keep showing THEIR call invites, and the next user to sign in here would
    // never subscribe to their own (the listener and the connection are
    // created once per sign-in). main.js sets both up again on the next login.
    teardownIncomingCallListener();
    await realtime.disconnect();
    navigate('#/login');
  };

  // Push tokens.
  push.getTokens(user.user_id)
    .then((data) => {
      const box = document.getElementById('tokens');
      const list = data?.tokens || [];
      if (list.length === 0) {
        box.innerHTML = '<span class="muted">No push tokens registered for this user. ' +
          'This demo does not wire Firebase Messaging — see <code>src/api/push.js</code> ' +
          'for registering a real FCM token.</span>';
        return;
      }
      box.innerHTML = '';
      for (const t of list) {
        const row = document.createElement('div');
        row.className = 'row';
        const tok = t.token || '';
        const short = tok.length > 24 ? tok.slice(0, 16) + '…' + tok.slice(-4) : tok;
        row.innerHTML = `<div><span style="background: var(--hb-primary); padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase;">${escapeHtml(t.platform || 'unknown')}</span></div>
          <div style="text-align: right; font-family: monospace; font-size: 12px;">${escapeHtml(short)}</div>`;
        box.appendChild(row);
      }
    })
    .catch(() => { document.getElementById('tokens').textContent = 'Unable to load tokens.'; });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
