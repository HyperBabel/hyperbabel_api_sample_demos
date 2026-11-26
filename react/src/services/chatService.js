/**
 * HyperBabel API — Low-Level Chat Service (SERVER-SIDE)
 *
 * ⚠️ EVERY CALL IN THIS FILE RUNS ON YOUR BACKEND, NOT IN THE BROWSER.
 *
 *   `/chat/*` is the server-to-server messaging surface. It authenticates with
 *   your ORGANIZATION API KEY, and it rejects end-user (customer) JWTs on
 *   reads as well as writes:
 *
 *       → 403 { "error": { "code": "forbidden",
 *                          "message": "End-user tokens cannot use the legacy
 *                                      /chat endpoints; use /unitedchat instead." } }
 *
 *   This demo signs in as an end user and `api.js` refuses to carry an org key
 *   in a browser bundle, so these calls fail here by design. The one page that
 *   imports this file — `pages/LiveStreamPage.jsx` — is itself backend-mediated
 *   (see its header), so the two belong together: your server owns the stream
 *   session AND its chat channel.
 *
 * 🔴 BUILDING AN END-USER APP? USE `unitedChatService.js` INSTEAD.
 *   United Chat is the surface a signed-in user may call directly: rooms,
 *   members, roles, video call, reactions, threads. Every other chat screen in
 *   this demo uses it. Both surfaces share the same underlying message store.
 *
 * Use `/chat` when your backend manages rooms and members externally, or when
 * you only need core messaging primitives (CS chat, IoT log, stream chat).
 *
 * Base path: /chat
 */

import api from './api';

const BASE = '/chat';

// ── Channels ─────────────────────────────────────────────────────────────

/**
 * Create a new chat channel.
 *
 * @param {object} data
 * @param {string} data.channel_name
 * @param {string} [data.channel_type='group']
 * @param {number} [data.max_members=100]
 */
export const createChannel = (data) => api.post(`${BASE}/channels`, data);

/**
 * List all chat channels, optionally filtered by type.
 * @param {{ channel_type?: string }} [params]
 */
export const listChannels = (params) => api.get(`${BASE}/channels`, params);

// ── Messages ─────────────────────────────────────────────────────────────

/**
 * Send a message to a channel.
 *
 * @param {string} channelId
 * @param {object} data
 * @param {string} data.sender_id
 * @param {string} data.content
 * @param {string} [data.message_type='text']
 */
export const sendMessage = (channelId, data) =>
  api.post(`${BASE}/channels/${channelId}/messages`, data);

/**
 * Get paginated message history for a channel — NEWEST FIRST (reverse a page
 * before rendering oldest → newest; page back with `next_cursor`).
 *
 * Performance tip: pass created_at_gte/lte when you know the time range —
 * a bounded range is answered faster.
 *
 * @param {string} channelId — The channel's id (UUID) from createChannel, not its name
 * @param {{ cursor?: string, limit?: number, created_at_gte?: string, created_at_lte?: string }} [params]
 * @returns {Promise<{ messages: object[], next_cursor: string|null, has_more: boolean }>}
 */
export const getMessages = (channelId, params) =>
  api.get(`${BASE}/channels/${channelId}/messages`, params);

/**
 * Soft-delete a message (only sender or channel owner/sub_admin).
 * @param {string} channelId
 * @param {string} messageId
 * @param {string} userId
 */
export const deleteMessage = (channelId, messageId, userId) =>
  api.delete(`${BASE}/channels/${channelId}/messages/${messageId}`, { user_id: userId });

/**
 * Edit a text message (only the original sender).
 * @param {string} channelId
 * @param {string} messageId
 * @param {string} userId
 * @param {string} content
 */
export const editMessage = (channelId, messageId, userId, content) =>
  api.put(`${BASE}/channels/${channelId}/messages/${messageId}`, { user_id: userId, content });

// ── Reactions ────────────────────────────────────────────────────────────

/**
 * Add an emoji reaction to a message (idempotent for same user+emoji).
 *
 * 🔴 On `/chat` a reaction is MESSAGE-scoped — the path carries no room id:
 *        POST /chat/messages/:messageId/reactions
 *    United Chat's equivalent IS room-scoped
 *    (`POST /unitedchat/rooms/:roomId/messages/:messageId/reactions`), and
 *    mixing the two shapes produces `/chat/rooms/…`, which is not a route at
 *    all and 404s. End-user code uses the United Chat one
 *    (`addReaction` / `removeReaction` in unitedChatService.js).
 *
 * The response is the FULL reaction map for that message:
 *   { "reactions": { "👍": ["user_1", "user_2"], "❤️": ["user_3"] } }
 * Store it as-is; do not hand-roll an optimistic array.
 */
export const addReaction = (messageId, userId, emoji) =>
  api.post(`${BASE}/messages/${messageId}/reactions`, { user_id: userId, emoji });

/**
 * Remove a previously added emoji reaction. Same message-scoped path as
 * addReaction; returns the updated reaction map.
 */
export const removeReaction = (messageId, userId, emoji) =>
  api.delete(`${BASE}/messages/${messageId}/reactions`, { user_id: userId, emoji });

// ── Read Status ──────────────────────────────────────────────────────────

/**
 * Mark the latest message as read for a user (resets unread count).
 * @param {string} channelId
 * @param {string} userId
 */
export const markAsRead = (channelId, userId) =>
  api.post(`${BASE}/channels/${channelId}/read`, { user_id: userId });

// ── Typing Indicator ─────────────────────────────────────────────────────

/**
 * Broadcast a typing event via the real-time channel.
 * No DB storage — fully stateless. Call with `is_typing: true` when user
 * starts typing, and `is_typing: false` when they stop or send.
 *
 * @param {string}  channelId
 * @param {string}  userId
 * @param {boolean} isTyping
 */
export const sendTypingIndicator = (channelId, userId, isTyping) =>
  api.post(`${BASE}/channels/${channelId}/typing`, { user_id: userId, is_typing: isTyping });

// ── Search ───────────────────────────────────────────────────────────────

/**
 * Full-text search messages in a channel. Maximum range: 6 months.
 * Results include `highlight`: the matching text, HTML-escaped by the server
 * (& < > "), with the hits wrapped in <mark>…</mark> — the only markup it
 * contains — so it can be inserted as HTML. To build React nodes instead,
 * split it on <mark> / </mark> and decode &amp; &lt; &gt; &quot; in the text
 * parts. Never insert a message's raw `content` as HTML.
 *
 * @param {string} channelId
 * @param {string} query
 * @param {{ limit?: number, created_at_gte?: string, created_at_lte?: string }} [params]
 */
export const searchMessages = (channelId, query, params = {}) =>
  api.get(`${BASE}/channels/${channelId}/search`, { q: query, ...params });

// ── Threads ──────────────────────────────────────────────────────────────

/**
 * Get thread replies for a parent message.
 *
 * @param {string} channelId
 * @param {string} messageId — Parent message ID
 * @param {{ limit?: number, cursor?: string }} [params]
 */
export const getThreadMessages = (channelId, messageId, params) =>
  api.get(`${BASE}/channels/${channelId}/messages/${messageId}/thread`, params);

// ── Translation ──────────────────────────────────────────────────────────

/**
 * On-demand translation for a specific message.
 * @param {string} messageId
 * @param {string} targetLang — e.g. 'ko', 'en'
 */
export const translateMessage = (messageId, targetLang) =>
  api.get(`${BASE}/messages/${messageId}/translate`, { target: targetLang });

/**
 * Batch-translate multiple messages at once.
 * Call once when loading history instead of N individual requests.
 *
 * @param {string}   channelId
 * @param {string[]} messageIds
 * @param {string}   targetLang
 */
export const batchTranslateMessages = (channelId, messageIds, targetLang) =>
  api.post(`${BASE}/channels/${channelId}/messages/batch-translate`, {
    message_ids: messageIds,
    target_lang: targetLang,
  });
