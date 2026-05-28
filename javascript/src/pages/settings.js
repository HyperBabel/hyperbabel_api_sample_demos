/**
 * Settings page — profile, language, API usage, push tokens, language detect
 * playground, and a link to the Block management screen.
 */

import * as auth from '../api/auth.js';
import * as push from '../api/push.js';
import * as translate from '../api/translate.js';
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
      <p class="muted" style="margin-top: 0;">Type any text to see what language the AI Translation engine identifies it as.</p>
      <div class="chat-input-row">
        <input id="detect-input" placeholder="Type something to detect…" />
        <button id="detect-btn">Detect</button>
      </div>
      <div id="detect-result" class="muted" style="margin-top: 8px;"></div>
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
      const rows = [
        ['Chat Messages', u.chat_messages_sent, u.plan_limits?.chat_messages],
        ['Video Minutes', u.video_minutes,      u.plan_limits?.video_minutes],
        ['Stream Minutes', u.stream_minutes,    u.plan_limits?.stream_minutes],
        ['Translations',  u.translations,       u.plan_limits?.translations],
      ];
      for (const [label, value, limit] of rows) {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<div>${escapeHtml(label)}</div><div style="text-align: right;">${value ?? '—'}${limit ? ' / ' + limit : ''}</div>`;
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

  // Language detection playground.
  const detect = async () => {
    const text = document.getElementById('detect-input').value.trim();
    if (!text) return;
    const out = document.getElementById('detect-result');
    out.textContent = 'Detecting…';
    try {
      const res = await translate.detectLanguage(text);
      const conf = Math.round((res.confidence ?? 0) * 100);
      out.textContent = `${res.language ?? '?'}  (${conf}% confidence)`;
    } catch (err) {
      out.textContent = `Error: ${err.message}`;
    }
  };
  document.getElementById('detect-btn').onclick = detect;
  document.getElementById('detect-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); detect(); }
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
