/**
 * HyperBabel API — Low-Level Chat Service
 *
 * The Chat API provides raw channel + message CRUD operations with
 * full-text search, typing indicators, reactions, and thread replies.
 *
 * Use this when you manage your own rooms & members externally,
 * or when you only need core messaging primitives (CS chat, IoT log, etc.).
 *
 * For full room management with video call, roles, ban/mute — use the
 * United Chat API instead (`unitedChatService.js`).
 *
 * Both APIs share the same underlying message store.
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
 * Get paginated message history for a channel.
 *
 * Performance tip: always include created_at_gte/lte to enable
 * PostgreSQL partition pruning on the monthly-partitioned table.
 *
 * @param {string} channelId
 * @param {{ cursor?: string, limit?: number, created_at_gte?: string, created_at_lte?: string }} [params]
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
 * @param {string} messageId
 * @param {string} userId
 * @param {string} emoji — e.g. '👍', '❤️'
 */
export const addReaction = (messageId, userId, emoji) =>
  api.post(`${BASE}/messages/${messageId}/reactions`, { user_id: userId, emoji });

/**
 * Remove a previously added emoji reaction.
 * @param {string} messageId
 * @param {string} userId
 * @param {string} emoji
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
 * Full-text search messages in a channel using PostgreSQL GIN index.
 * Maximum range: 6 months. Results include `highlight` with <mark> tags.
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
