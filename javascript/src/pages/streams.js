/**
 * Live Streams page — list active sessions, host a new broadcast, or watch as
 * a viewer. The actual RTC join lives in `pages/streamHost.js` and
 * `pages/streamViewer.js`; this file is the discovery surface.
 */

import * as stream from '../api/stream.js';

export async function renderStreams(navigate) {
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');
  if (!user.user_id) return navigate('#/login');

  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="row" style="margin-bottom: 12px;">
      <button id="back" class="btn-ghost">← Back</button>
      <div style="text-align: right;"><h2 style="margin: 0;">Live Streams</h2></div>
    </div>
    <div class="card">
      <button id="go-live">📡 Go Live (Host)</button>
    </div>
    <div class="card">
      <h3 style="margin-top: 0;">Active sessions</h3>
      <div id="sessions">Loading…</div>
    </div>
  `;

  document.getElementById('back').onclick = () => navigate('#/home');
  document.getElementById('go-live').onclick = () => navigate('#/stream/host');

  try {
    const data = await stream.listSessions();
    const sessions = data.sessions || data || [];
    const box = document.getElementById('sessions');
    if (sessions.length === 0) {
      box.innerHTML = '<span class="muted">Nobody is streaming right now — be the first.</span>';
      return;
    }
    box.innerHTML = '';
    for (const s of sessions) {
      const row = document.createElement('div');
      row.className = 'room-item';
      row.innerHTML = `
        <div>
          <div style="font-weight: 600;">${escapeHtml(s.title || 'Untitled stream')}</div>
          <div class="meta">Host: ${escapeHtml(s.host_name || s.host_user_id || '—')} · ${s.viewer_count ?? 0} viewers</div>
        </div>
        <button>Watch →</button>
      `;
      row.onclick = () => navigate(`#/stream/viewer/${s.session_id || s.id}`);
      box.appendChild(row);
    }
  } catch (err) {
    document.getElementById('sessions').innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
