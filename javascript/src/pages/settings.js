/**
 * Settings page — profile, language, API usage, push tokens, a note on
 * language detection (it needs your backend), and a link to the Block
 * management screen.
 */

import * as auth from '../api/auth.js';
import * as push from '../api/push.js';
import { logoutAndClear } from '../api/firebaseAuth.js';

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
      <h3 style="margin-top: 0;">API Usage</h3>
      <div id="usage">Loading…</div>
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
  document.getElementById('logout').onclick = async () => {
    await logoutAndClear();
    navigate('#/login');
  };

  // Usage stats.
  auth.getUsage()
    .then((u) => {
      const box = document.getElementById('usage');
      if (!u) { box.textContent = 'Unable to load usage.'; return; }
      box.innerHTML = '';
      // GET /auth/usage returns your organization's totals for this month next
      // to the plan allowance (`monthly_*`, where -1 means unlimited). 64-bit
      // counters arrive as strings.
      const rows = [
        ['Plan',                       u.plan_name,       null],
        ['Chat messages',              u.messages_sent,   u.monthly_messages],
        ['HD video minutes',           u.hd_video_mins,   u.monthly_hd_video_mins],
        ['HD stream minutes',          u.hd_stream_mins,  u.monthly_hd_stream_mins],
        ['Translated characters',      u.translate_chars, u.monthly_translate_chars],
        ['Speech translation minutes', u.stt_mins,        u.monthly_stt_mins],
      ];
      for (const [label, value, limit] of rows) {
        const limitText = limit == null ? '' : Number(limit) < 0 ? ' / unlimited' : ` / ${limit}`;
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<div>${escapeHtml(label)}</div><div style="text-align: right;">${escapeHtml(value ?? '—')}${escapeHtml(limitText)}</div>`;
        box.appendChild(row);
      }
    })
    .catch(() => { document.getElementById('usage').textContent = 'Unable to load usage.'; });

  // Push tokens.
  push.getTokens(user.user_id)
    .then((data) => {
      const box = document.getElementById('tokens');
      const list = data?.tokens || [];
      if (list.length === 0) {
        box.innerHTML = '<span class="muted">No push tokens registered for this user yet.</span>';
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
