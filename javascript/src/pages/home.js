/**
 * Home page — list of rooms the signed-in user belongs to, with a primitive
 * "create room" form so the demo is self-contained.
 *
 * Two users meet by putting each other in a room: one of them creates a 1:1
 * or group room with the other's user ID (shown below the form and in
 * Settings). The room then appears in both users' lists. This demo has no
 * open-room browser or invite-code join, so an Open room has only you until
 * your app adds one of those.
 */

import * as unitedChat from '../api/unitedChat.js';
import { sendHeartbeat } from '../api/presence.js';

export async function renderHome(navigate) {
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');
  if (!user.user_id) return navigate('#/login');

  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="row" style="margin-bottom: 16px;">
      <div>
        <h2 style="margin: 0;">Welcome, ${escapeHtml(user.display_name)}</h2>
        <p class="muted" style="margin: 4px 0 0;">Your rooms — pick one to enter the chat.</p>
      </div>
      <div style="text-align: right; display: flex; gap: 6px; justify-content: flex-end;">
        <button id="open-streams" class="btn-ghost">📡 Streams</button>
        <button id="open-settings" class="btn-ghost">⚙️ Settings</button>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-top: 0;">Create a room</h3>
      <div class="row">
        <input id="new-room-name" placeholder="Room name (group / open)" />
        <select id="new-room-type" style="margin-bottom: 12px;">
          <option value="group">Group</option>
          <option value="1to1">1:1</option>
          <option value="open">Open</option>
        </select>
      </div>
      <input id="new-room-members" placeholder="Other user IDs, comma-separated (1:1: exactly one)" />
      <p class="muted" style="font-size: 12px; margin: 4px 0 12px;">
        Your user ID: <code>${escapeHtml(user.user_id)}</code> — share it so someone can add you.
      </p>
      <button id="create-room">Create</button>
      <div id="create-error" class="error"></div>
    </div>

    <div class="card">
      <h3 style="margin-top: 0;">Your rooms</h3>
      <div id="rooms" class="room-list"><span class="muted">Loading…</span></div>
    </div>
  `;

  document.getElementById('open-streams').onclick = () => navigate('#/streams');
  document.getElementById('open-settings').onclick = () => navigate('#/settings');

  document.getElementById('create-room').onclick = async () => {
    const errorEl = document.getElementById('create-error');
    errorEl.textContent = '';
    const roomName = document.getElementById('new-room-name').value.trim();
    const roomType = document.getElementById('new-room-type').value;
    const others = [...new Set(
      document.getElementById('new-room-members').value
        .split(',')
        .map((s) => s.trim())
        .filter((id) => id && id !== user.user_id),
    )];

    // `members` lists the OTHER people — you are the room's `creator_id`.
    //   1:1   → exactly one id: the peer (`[me, peer]` would make a self-chat).
    //   group → the people to add; with none, it is a room of one for now.
    //   open  → only you; others join through your app's open-room flow.
    let members;
    if (roomType === '1to1') {
      if (others.length !== 1) {
        errorEl.textContent = 'A 1:1 room needs exactly one other user ID.';
        return;
      }
      members = others;
    } else {
      if (!roomName) {
        errorEl.textContent = 'Room name is required.';
        return;
      }
      members = roomType === 'group' && others.length ? others : [user.user_id];
    }

    try {
      // `{ room: { id, … } }` — `already_exists: true` when that 1:1 (or the
      // same set of group members) already has a room.
      await unitedChat.createRoom({
        room_type: roomType,
        creator_id: user.user_id,
        ...(roomName ? { room_name: roomName } : {}),
        members,
      });
      await loadRooms(user.user_id, navigate);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  };

  // Background presence heartbeat — fire-and-forget every 30s while the page is open.
  sendHeartbeat(user.user_id).catch(() => {});
  const beat = setInterval(() => sendHeartbeat(user.user_id).catch(() => {}), 30_000);
  window.addEventListener('hashchange', () => clearInterval(beat), { once: true });

  await loadRooms(user.user_id, navigate);
}

async function loadRooms(userId, navigate) {
  const list = document.getElementById('rooms');
  if (!list) return;
  try {
    const data = await unitedChat.listRooms(userId);
    // `{ rooms, open_rooms }` — `open_rooms` (public rooms to join) is not used here.
    const rooms = data.rooms || [];
    if (rooms.length === 0) {
      list.innerHTML = '<span class="muted">No rooms yet — create one above.</span>';
      return;
    }
    list.innerHTML = '';
    for (const r of rooms) {
      const item = document.createElement('div');
      item.className = 'room-item';
      item.innerHTML = `
        <div>
          <div style="font-weight: 600;">${escapeHtml(r.room_name || r.id)}</div>
          <div class="meta">${escapeHtml(r.channel_type)} · ${escapeHtml(r.member_count ?? '—')} members</div>
        </div>
        <button>Open →</button>
      `;
      item.onclick = () => navigate(`#/chat/${r.id}`);
      list.appendChild(item);
    }
  } catch (err) {
    list.innerHTML = `<div class="error">Failed to load rooms: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
