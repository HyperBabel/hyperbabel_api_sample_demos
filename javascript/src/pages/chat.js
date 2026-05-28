/**
 * Chat page — full HyperBabel chat surface with:
 *   - Real-time message + typing + reaction events
 *   - Edit / delete on own messages, Reply / React on any
 *   - Image and arbitrary-file upload via the 3-step presign flow
 *   - Members modal with promote / demote / ban + room mute toggle
 *   - Freeze toggle for owner / sub_admin
 *   - Locale-aware timestamps + edited indicator
 */

import * as unitedChat from '../api/unitedChat.js';
import * as chatApi from '../api/chat.js';
import { uploadFile } from '../api/storage.js';
import * as realtime from '../realtime/hyperbabelRealtime.js';
import { formatMessageTime } from '../utils/timeUtils.js';

export async function renderChat(roomId, navigate) {
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');
  if (!user.user_id) return navigate('#/login');

  const state = {
    messages: [],
    members: [],
    role: 'member',
    typingFrom: null,
    typingTimer: null,
    lastTypingPing: 0,
    replyTo: null,
    isFrozen: false,
    isMuted: false,
    sending: false,
  };

  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="row" style="margin-bottom: 12px;">
      <button id="back" class="btn-ghost">← Back</button>
      <div style="text-align: right; display: flex; gap: 6px; justify-content: flex-end;">
        <button id="start-call">📹</button>
        <button id="show-members" class="btn-ghost">👥</button>
        <button id="toggle-freeze" class="btn-ghost" hidden>🔒</button>
        <button id="toggle-mute" class="btn-ghost">🔔</button>
      </div>
    </div>
    <div id="frozen-banner" hidden></div>
    <div class="chat-container">
      <div id="messages" class="chat-messages"><span class="muted">Loading…</span></div>
      <div id="typing-banner" class="muted" style="font-size: 11px; min-height: 14px; padding: 0 4px;"></div>
      <div id="reply-banner" hidden style="border-left: 3px solid var(--hb-primary); padding: 6px 8px; margin-top: 6px; background: var(--hb-surface);"></div>
      <div class="chat-input-row">
        <button id="attach-image" class="btn-ghost" title="Image">🖼</button>
        <button id="attach-file" class="btn-ghost" title="File">📎</button>
        <input id="msg-input" placeholder="Type a message and press Enter" autofocus />
        <button id="send">Send</button>
      </div>
    </div>
  `;

  document.getElementById('back').onclick = () => navigate('#/home');

  // Hidden file inputs we trigger from the toolbar buttons.
  const imageInput = document.createElement('input');
  imageInput.type = 'file';
  imageInput.accept = 'image/*';
  imageInput.style.display = 'none';
  document.body.appendChild(imageInput);
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  // ── Render helpers ───────────────────────────────────────────────────────

  const messagesBox = document.getElementById('messages');
  const typingBanner = document.getElementById('typing-banner');
  const replyBanner = document.getElementById('reply-banner');
  const frozenBanner = document.getElementById('frozen-banner');

  const canModerate = () => state.role === 'owner' || state.role === 'sub_admin';

  function renderMessages() {
    if (state.messages.length === 0) {
      messagesBox.innerHTML = '<span class="muted">No messages yet — say hi!</span>';
      return;
    }
    messagesBox.innerHTML = '';
    for (const m of state.messages) {
      messagesBox.appendChild(renderBubble(m));
    }
    messagesBox.scrollTop = messagesBox.scrollHeight;
  }

  function renderBubble(m) {
    const isOwn = m.sender_id === user.user_id;
    const isDeleted = !!m.deleted_at;
    const type = m.message_type || 'text';
    const content = typeof m.content === 'object'
      ? (m.content[user.preferred_lang_cd] || m.content.en || Object.values(m.content)[0])
      : m.content;

    const wrap = document.createElement('div');
    wrap.className = `msg ${isOwn ? 'own' : 'other'}`;
    wrap.style.position = 'relative';

    // Reply quote (if this message references another).
    const replyToId = m.metadata?.reply_to;
    const replyParent = replyToId ? state.messages.find((x) => x.id === replyToId) : null;
    let html = '';
    if (!isOwn) html += `<div class="sender">${escapeHtml(m.sender_name || m.sender_id)}</div>`;
    if (replyParent) {
      const preview = (replyParent.content || '[media]').toString().slice(0, 80);
      html += `<div class="translation" style="border-left: 2px solid #ffffff70; padding-left: 6px; font-size: 11px;">↩ ${escapeHtml(replyParent.sender_name || replyParent.sender_id)}: ${escapeHtml(preview)}</div>`;
    }
    if (isDeleted) {
      html += `<div class="muted" style="font-style: italic;">🗑 This message was deleted.</div>`;
    } else if (type === 'image') {
      const url = m.metadata?.url || content;
      html += `<img src="${escapeAttr(url)}" alt="image" style="max-width: 220px; border-radius: 10px; display: block;" />`;
    } else if (type === 'file') {
      const meta = m.metadata || {};
      const filename = meta.filename || content || 'File';
      html += `<div style="background: rgba(255,255,255,0.1); padding: 8px; border-radius: 8px; min-width: 200px;">
        <div>📎 ${escapeHtml(filename)}</div>
        ${meta.size ? `<div class="muted" style="font-size: 10px;">${Math.round(meta.size / 1024)} KB</div>` : ''}
      </div>`;
    } else {
      html += `<div>${escapeHtml(content || '')}</div>`;
    }

    if (m.reactions && m.reactions.length) {
      html += '<div style="display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap;">' +
        m.reactions.map((r) => {
          const count = r.count ?? (r.users?.length ?? 0);
          return `<span style="background: rgba(255,255,255,0.15); padding: 2px 6px; border-radius: 10px; font-size: 11px;">${escapeHtml(r.emoji)} ${count}</span>`;
        }).join('') + '</div>';
    }

    const editedTag = m.updated_at && m.created_at && m.updated_at !== m.created_at ? '<span style="opacity: 0.6; font-style: italic;"> · edited</span>' : '';
    if (m.created_at) {
      html += `<div class="translation" style="font-size: 10px;">${escapeHtml(formatMessageTime(m.created_at))}${editedTag}</div>`;
    }
    wrap.innerHTML = html;

    // Long-press / right-click → action menu (Reply / React + Edit/Delete on own)
    let pressTimer = null;
    const openMenu = (ev) => {
      ev.preventDefault();
      showMessageActions(m, isOwn);
    };
    wrap.addEventListener('contextmenu', openMenu);
    wrap.addEventListener('mousedown', () => {
      pressTimer = setTimeout(() => openMenu({ preventDefault: () => {} }), 600);
    });
    wrap.addEventListener('mouseup', () => clearTimeout(pressTimer));
    wrap.addEventListener('mouseleave', () => clearTimeout(pressTimer));
    return wrap;
  }

  function refreshFrozenBanner() {
    if (!state.isFrozen) {
      frozenBanner.hidden = true;
      frozenBanner.innerHTML = '';
      return;
    }
    frozenBanner.hidden = false;
    frozenBanner.innerHTML = `<div style="background: rgba(245,158,11,0.15); color: #f59e0b; padding: 8px; border-radius: 8px; text-align: center; font-size: 13px;">
      🔒 ${canModerate() ? 'This room is frozen — only admins can post.' : 'This room is frozen — only admins can post right now.'}
    </div>`;
  }

  function refreshFreezeButton() {
    const btn = document.getElementById('toggle-freeze');
    btn.hidden = !canModerate();
    btn.title = state.isFrozen ? 'Unfreeze' : 'Freeze';
    btn.textContent = state.isFrozen ? '🔓' : '🔒';
  }

  function refreshReplyBanner() {
    if (!state.replyTo) {
      replyBanner.hidden = true;
      replyBanner.innerHTML = '';
      return;
    }
    replyBanner.hidden = false;
    replyBanner.innerHTML = `<div class="row">
      <div>
        <div style="font-size: 11px; color: var(--hb-primary); font-weight: 700;">Replying to ${escapeHtml(state.replyTo.sender_name || state.replyTo.sender_id)}</div>
        <div class="muted" style="font-size: 12px; max-width: 80%;">${escapeHtml((state.replyTo.content || '[media]').toString().slice(0, 80))}</div>
      </div>
      <div style="text-align: right; flex: 0 0 auto;">
        <button class="btn-ghost" id="cancel-reply">✕</button>
      </div>
    </div>`;
    document.getElementById('cancel-reply').onclick = () => {
      state.replyTo = null;
      refreshReplyBanner();
    };
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  function showMessageActions(msg, isOwn) {
    const choices = [
      { label: '↩ Reply', fn: () => { state.replyTo = msg; refreshReplyBanner(); } },
      { label: '😊 React', fn: () => showReactionPicker(msg) },
    ];
    if (isOwn) {
      choices.push({ label: '✏️ Edit', fn: () => editMessageFlow(msg) });
      choices.push({ label: '🗑 Delete', fn: () => deleteMessageFlow(msg) });
    }
    const pick = prompt(
      `Action for message ${msg.id}:\n` +
      choices.map((c, i) => `  ${i + 1}. ${c.label}`).join('\n') +
      '\n\nEnter the number:',
    );
    const idx = parseInt(pick, 10) - 1;
    if (idx >= 0 && idx < choices.length) choices[idx].fn();
  }

  function showReactionPicker(msg) {
    const emojis = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '✅'];
    const pick = prompt(`React with: ${emojis.join(' ')}\n\nType the emoji:`);
    if (!pick) return;
    const emoji = emojis.find((e) => pick.includes(e)) || pick.trim();
    if (!emoji) return;
    chatApi.addReaction(msg.id, user.user_id, emoji).catch((err) => alert(err.message));
  }

  async function editMessageFlow(msg) {
    const next = prompt('Edit message:', msg.content);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    try {
      await unitedChat.editMessage(roomId, msg.id, user.user_id, trimmed);
      const idx = state.messages.findIndex((m) => m.id === msg.id);
      if (idx >= 0) {
        state.messages[idx] = { ...state.messages[idx], content: trimmed, updated_at: new Date().toISOString() };
        renderMessages();
      }
    } catch (err) { alert(err.message); }
  }

  async function deleteMessageFlow(msg) {
    if (!confirm('Delete this message? It will be replaced with a tombstone for everyone.')) return;
    try {
      await unitedChat.deleteMessage(roomId, msg.id, user.user_id);
      const idx = state.messages.findIndex((m) => m.id === msg.id);
      if (idx >= 0) {
        state.messages[idx] = { ...state.messages[idx], deleted_at: new Date().toISOString() };
        renderMessages();
      }
    } catch (err) { alert(err.message); }
  }

  async function send() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || state.sending) return;
    state.sending = true;
    const replyTo = state.replyTo?.id;
    input.value = '';
    try {
      const promise = replyTo
        ? unitedChat.sendReply(roomId, {
            senderId: user.user_id,
            senderName: user.display_name,
            content: text,
            replyTo,
          })
        : unitedChat.sendMessage(roomId, {
            sender_id: user.user_id,
            sender_name: user.display_name,
            content: text,
            message_type: 'text',
          });
      await promise;
      state.replyTo = null;
      refreshReplyBanner();
    } catch (err) {
      input.value = text;
      alert(`Failed to send: ${err.message}`);
    } finally {
      state.sending = false;
    }
  }

  function pingTyping() {
    const now = Date.now();
    if (now - state.lastTypingPing < 2000) return;
    state.lastTypingPing = now;
    unitedChat
      .sendTypingIndicator(roomId, user.user_id, user.display_name)
      .catch(() => {});
  }

  async function uploadAndSend(file, messageType) {
    if (!file) return;
    state.sending = true;
    try {
      const confirmed = await uploadFile(file, { channelId: roomId });
      const url = confirmed.url || confirmed.cdn_url || '';
      await unitedChat.sendMessage(roomId, {
        sender_id: user.user_id,
        sender_name: user.display_name,
        content: messageType === 'image' ? url : file.name,
        message_type: messageType,
        metadata: {
          url,
          filename: file.name,
          mime_type: file.type,
          size: file.size,
        },
      });
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      state.sending = false;
    }
  }

  // ── Wire UI ──────────────────────────────────────────────────────────────

  document.getElementById('send').onclick = send;
  document.getElementById('msg-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  document.getElementById('msg-input').addEventListener('input', pingTyping);

  document.getElementById('attach-image').onclick = () => imageInput.click();
  imageInput.onchange = () => uploadAndSend(imageInput.files?.[0], 'image').then(() => (imageInput.value = ''));
  document.getElementById('attach-file').onclick = () => fileInput.click();
  fileInput.onchange = () => uploadAndSend(fileInput.files?.[0], 'file').then(() => (fileInput.value = ''));

  document.getElementById('start-call').onclick = async () => {
    try {
      await unitedChat.startVideoCall(roomId, user.user_id, []);
      navigate(`#/video/${roomId}`);
    } catch (err) {
      alert(`Failed to start call: ${err.message}`);
    }
  };

  document.getElementById('show-members').onclick = () => showMembersModal();

  document.getElementById('toggle-freeze').onclick = async () => {
    try {
      if (state.isFrozen) await unitedChat.unfreezeRoom(roomId, user.user_id);
      else                await unitedChat.freezeRoom(roomId, user.user_id);
      state.isFrozen = !state.isFrozen;
      refreshFrozenBanner();
      refreshFreezeButton();
    } catch (err) { alert(err.message); }
  };

  document.getElementById('toggle-mute').onclick = async () => {
    try {
      if (state.isMuted) {
        await unitedChat.unmuteRoom(roomId, user.user_id);
      } else {
        const choice = prompt('Mute for: 60 (1h), 480 (8h), 1440 (24h), 0 (forever). Number of minutes:');
        const mins = parseInt(choice, 10);
        if (Number.isNaN(mins)) return;
        await unitedChat.muteRoom(roomId, user.user_id, mins === 0 ? undefined : mins);
      }
      state.isMuted = !state.isMuted;
      document.getElementById('toggle-mute').textContent = state.isMuted ? '🔕' : '🔔';
    } catch (err) { alert(err.message); }
  };

  // ── Members modal ───────────────────────────────────────────────────────

  function showMembersModal() {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 200;';
    overlay.innerHTML = `
      <div style="background: var(--hb-surface); border: 1px solid var(--hb-border); border-radius: 12px; padding: 16px; min-width: 320px; max-width: 90vw;">
        <div class="row" style="margin-bottom: 12px;">
          <div><h3 style="margin: 0;">Members</h3></div>
          <div style="text-align: right;"><button class="btn-ghost" id="close-members">✕</button></div>
        </div>
        <div id="members-list">Loading…</div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('close-members').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    refreshMembers().then(() => {
      const list = document.getElementById('members-list');
      list.innerHTML = '';
      const isOwner = state.role === 'owner';
      for (const m of state.members) {
        const isSelf = m.user_id === user.user_id;
        const row = document.createElement('div');
        row.className = 'room-item';
        row.innerHTML = `
          <div>
            <div style="font-weight: 600;">${escapeHtml(m.user_name || m.user_id)}</div>
            <div class="meta">${escapeHtml(m.role)}</div>
          </div>
          <div style="display: flex; gap: 4px;">
            ${(canModerate() && !isSelf && m.role !== 'owner') ? `<button data-action="ban" class="btn-ghost">🚫</button>` : ''}
            ${(isOwner && !isSelf && m.role === 'member')    ? `<button data-action="promote" class="btn-ghost">🛡</button>` : ''}
            ${(isOwner && !isSelf && m.role === 'sub_admin') ? `<button data-action="demote"  class="btn-ghost">↓</button>` : ''}
          </div>
        `;
        row.querySelectorAll('button').forEach((btn) => {
          btn.onclick = async () => {
            const action = btn.dataset.action;
            try {
              if (action === 'ban') {
                if (!confirm(`Ban ${m.user_id}?`)) return;
                await unitedChat.banUser(roomId, user.user_id, m.user_id);
              } else if (action === 'promote') {
                await unitedChat.addSubAdmin(roomId, user.user_id, m.user_id);
              } else if (action === 'demote') {
                await unitedChat.removeSubAdmin(roomId, m.user_id);
              }
              overlay.remove();
              showMembersModal();
            } catch (err) { alert(err.message); }
          };
        });
        list.appendChild(row);
      }
    });
  }

  async function refreshMembers() {
    try {
      const data = await unitedChat.getMembers(roomId);
      state.members = data.members || [];
      const me = state.members.find((m) => m.user_id === user.user_id);
      state.role = me?.role || 'member';
      refreshFreezeButton();
    } catch { /* best-effort */ }
  }

  // ── Bootstrap ───────────────────────────────────────────────────────────

  try {
    const data = await unitedChat.getMessages(roomId, { limit: 50, user_id: user.user_id });
    state.messages = (data.messages || []).slice().reverse();
    renderMessages();
    unitedChat.markRead(roomId, user.user_id).catch(() => {});
  } catch (err) {
    messagesBox.innerHTML = `<div class="error">Failed to load messages: ${escapeHtml(err.message)}</div>`;
  }
  await refreshMembers();
  // Mute status
  unitedChat.getMuteStatus(roomId, user.user_id)
    .then((s) => {
      state.isMuted = !!s?.is_muted;
      document.getElementById('toggle-mute').textContent = state.isMuted ? '🔕' : '🔔';
    })
    .catch(() => {});

  // Real-time subscription.
  let unsubscribe = () => {};
  try {
    await realtime.connect(user);
    unsubscribe = realtime.subscribeRoom(roomId, ({ message, type }) => {
      // The HyperBabel Real-Time backend wraps every per-room broadcast as
      //   { type: 'message' | 'typing' | …, data: <payload>, timestamp: … }
      // and publishes it under event-name 'message'. Other event names
      // ('message.deleted', 'message.updated', 'reaction') carry an
      // un-wrapped payload directly.
      const envelope = message ?? {};

      if (type === 'message' && envelope.type === 'typing') {
        const fromId = envelope.userId;
        if (fromId && fromId !== user.user_id) {
          state.typingFrom = envelope.userName || fromId;
          typingBanner.textContent = `${state.typingFrom} is typing…`;
          clearTimeout(state.typingTimer);
          state.typingTimer = setTimeout(() => {
            state.typingFrom = null;
            typingBanner.textContent = '';
          }, 3000);
        }
        return;
      }

      if (type === 'message.deleted' || (type === 'message' && envelope.type === 'message.deleted')) {
        const payload = envelope.data ?? envelope;
        const id = payload?.message_id ?? payload?.id;
        if (!id) return;
        const idx = state.messages.findIndex((m) => m.id === id);
        if (idx >= 0) {
          state.messages[idx] = { ...state.messages[idx], deleted_at: new Date().toISOString() };
          renderMessages();
        }
        return;
      }

      if (type === 'message.updated' || (type === 'message' && envelope.type === 'message.updated')) {
        const payload = envelope.data ?? envelope;
        const id = payload?.message_id ?? payload?.id;
        if (!id || !payload.content) return;
        const idx = state.messages.findIndex((m) => m.id === id);
        if (idx >= 0) {
          state.messages[idx] = {
            ...state.messages[idx],
            content: payload.content,
            updated_at: new Date().toISOString(),
          };
          renderMessages();
        }
        return;
      }

      if (type === 'reaction') {
        mergeReactionDelta(envelope);
        return;
      }

      // Real chat message — Workers wraps as { type: 'message', data: <Message> }.
      // Older backends publish the message object directly.
      const chatMsg =
        type === 'message' && envelope.type === 'message' && envelope.data
          ? envelope.data
          : envelope?.id
            ? envelope
            : null;
      if (!chatMsg?.id) return;
      if (state.messages.some((m) => m.id === chatMsg.id)) return;
      state.messages.push(chatMsg);
      renderMessages();
    });
  } catch (err) {
    console.warn('[chat] real-time subscribe failed', err.message);
  }
  window.addEventListener('hashchange', () => unsubscribe(), { once: true });
}

function mergeReactionDelta(payload) {
  // Stub: server-side reaction events aren't always echoed, and the UI
  // already optimistically renders the local user's reaction. Keeping the
  // hook here makes the Real-Time integration symmetric with the other demos.
  void payload;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}
