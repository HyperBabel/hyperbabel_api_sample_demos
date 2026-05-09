/**
 * Block management — lists every user the signed-in account has globally
 * blocked, with search + simple pagination.
 */

import * as users from '../api/users.js';

const PAGE_SIZE = 10;

export async function renderBlocks(navigate) {
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');
  if (!user.user_id) return navigate('#/login');

  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="row" style="margin-bottom: 12px;">
      <button id="back" class="btn-ghost">← Back</button>
      <div style="text-align: right;"><h2 style="margin: 0;">Blocked Users</h2></div>
    </div>
    <div class="card">
      <input id="search" placeholder="Search by user ID…" />
      <div class="muted" style="font-size: 12px; margin-top: 4px;">⚠️ Blocks apply to every room, not just one.</div>
    </div>
    <div id="list" class="card">Loading…</div>
    <div class="row" id="pager" hidden>
      <button class="btn-ghost" id="prev">← Prev</button>
      <span id="page-label" style="text-align: center;"></span>
      <button class="btn-ghost" id="next">Next →</button>
    </div>
  `;

  document.getElementById('back').onclick = () => navigate('#/settings');

  let blocked = [];
  let page = 0;
  let query = '';

  async function load() {
    try {
      const data = await users.getBlockList(user.user_id);
      blocked = data.blocked_users || [];
      render();
    } catch (err) {
      document.getElementById('list').innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
    }
  }

  function filtered() {
    if (!query) return blocked;
    const q = query.toLowerCase();
    return blocked.filter((b) => (b.blocked_id || '').toLowerCase().includes(q));
  }

  function render() {
    const list = document.getElementById('list');
    const pager = document.getElementById('pager');
    const items = filtered();
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    if (page >= totalPages) page = totalPages - 1;
    const slice = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    if (items.length === 0) {
      list.innerHTML = `<div class="muted">${query ? 'No matches.' : 'You haven’t blocked anyone yet.'}</div>`;
      pager.hidden = true;
      return;
    }
    list.innerHTML = '';
    for (const row of slice) {
      const el = document.createElement('div');
      el.className = 'room-item';
      el.innerHTML = `
        <div>
          <div style="font-weight: 600;">${escapeHtml(row.blocked_id)}</div>
          <div class="meta">Blocked at: ${escapeHtml(new Date(row.created_at || Date.now()).toLocaleString())}</div>
        </div>
        <button class="btn-danger">Unblock</button>
      `;
      el.querySelector('button').onclick = async () => {
        if (!confirm(`Unblock ${row.blocked_id}?`)) return;
        try {
          await users.unblockUser(user.user_id, row.blocked_id);
          blocked = blocked.filter((b) => b.blocked_id !== row.blocked_id);
          render();
        } catch (err) { alert(err.message); }
      };
      list.appendChild(el);
    }
    pager.hidden = totalPages <= 1;
    document.getElementById('page-label').textContent = `${page + 1} / ${totalPages}`;
    document.getElementById('prev').disabled = page === 0;
    document.getElementById('next').disabled = page >= totalPages - 1;
  }

  document.getElementById('search').oninput = (e) => { query = e.target.value; page = 0; render(); };
  document.getElementById('prev').onclick = () => { if (page > 0) { page--; render(); } };
  document.getElementById('next').onclick = () => { page++; render(); };

  await load();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
