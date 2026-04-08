/**
 * HyperBabel API — United Chat Service
 *
 * The United Chat API is the **high-level, all-in-one** messaging layer.
 * It wraps room management, member roles, video call lifecycle, ban/mute,
 * freeze, pinning, and message CRUD into a single cohesive API surface.
 *
 * Recommended for most applications — start here unless you need raw
 * channel-level control (use the low-level Chat API instead).
 *
 * Base path: /unitedchat
 */

import api from './api';

const BASE = '/unitedchat';

// ── Room Management ──────────────────────────────────────────────────────

/**
 * Create a chat room.
 *
 * @param {object} data
 * @param {'1to1'|'group'|'open'} data.room_type
 * @param {string}  data.creator_id
 * @param {string}  [data.room_name]      — Display name (group/open only)
 * @param {string[]} [data.members]       — User IDs to invite
 * @param {number}  [data.max_members=100]
 * @returns {Promise<object>} Created room (or existing 1:1 if duplicate)
 */
export const createRoom = (data) => api.post(`${BASE}/rooms`, data);

/**
 * List rooms the user belongs to, plus joinable open rooms.
 *
 * @param {string} userId
 * @param {{ limit?: number, cursor?: string, lang?: string }} [params]
 *   Pass `lang` (e.g. `'ko'`, `'ja'`) to enable description auto-translation.
 *   Translations are cached in the DB — no extra cost on repeated calls.
 *   If omitted, `navigator.language.slice(0,2)` is used automatically.
 * @returns {Promise<{ rooms: object[], open_rooms: object[] }>}
 */
export const listRooms = (userId, params = {}) => {
  // Auto-detect device language if not explicitly provided
  const lang = params.lang ?? (typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'en');
  return api.get(`${BASE}/rooms`, { user_id: userId, lang, ...params });
};

/**
 * Get full room details including member list with roles.
 * @param {string} roomId
 */
export const getRoom = (roomId) => api.get(`${BASE}/rooms/${roomId}`);

/**
 * Set a per-user custom display name for a room.
 *
 * @param {string} roomId
 * @param {string} userId
 * @param {string} customName
 */
export const updateRoomName = (roomId, userId, customName) =>
  api.put(`${BASE}/rooms/${roomId}/name`, { user_id: userId, custom_name: customName });
/**
 * Update the description for an open room (owner only).
 * @param {string} roomId
 * @param {string} userId — Must be the room owner
 * @param {string|null} description — Pass null to clear
 */
export const updateRoomDescription = (roomId, userId, description) =>
  api.put(`${BASE}/rooms/${roomId}/description`, { user_id: userId, description });

/**
 * Join an open room using an 8-character invite code (without knowing the room ID).
 * @param {string} inviteCode
 * @param {string} userId
 * @param {string} [displayName]
 */
export const joinByCode = (inviteCode, userId, displayName) =>
  api.post(`${BASE}/rooms/join-by-code`, { invite_code: inviteCode, user_id: userId, display_name: displayName });

/**
 * Get the org's open room file transfer policy.
 * Returns platform defaults if no custom policy has been saved yet:
 *   files_enabled: true, max_file_size_mb: 10, allowed_types: ['image/*']
 *
 * @returns {Promise<{ files_enabled: boolean, max_file_size_mb: number, allowed_types: string[] } | null>}
 */
export const getOpenRoomPolicy = () =>
  api.get(`${BASE}/policy`);


/**
 * Join an open (public) room.
 * @param {string} roomId
 * @param {string} userId
 * @param {string} [displayName] — Shown in the system join message broadcasted to all members
 */
export const joinRoom = (roomId, userId, displayName) =>
  api.post(`${BASE}/rooms/${roomId}/join`, { user_id: userId, display_name: displayName });

/**
 * Leave a room (owner cannot leave — must transfer ownership first).
 * @param {string} roomId
 * @param {string} userId
 * @param {string} [displayName] — Shown in the system leave message broadcasted to all remaining members
 */
export const leaveRoom = (roomId, userId, displayName) =>
  api.post(`${BASE}/rooms/${roomId}/leave`, { user_id: userId, display_name: displayName });

/**
 * Mark the latest message in a room as read (resets unread count).
 * @param {string} roomId
 * @param {string} userId
 */
export const markAsRead = (roomId, userId) =>
  api.post(`${BASE}/rooms/${roomId}/read`, { user_id: userId });

// ── Messages ─────────────────────────────────────────────────────────────

/**
 * Send a message to a room.
 *
 * @param {string} roomId
 * @param {object} data
 * @param {string} data.sender_id
 * @param {string} data.content
 * @param {'text'|'image'|'file'|'video'|'audio'|'system'} [data.message_type='text']
 * @param {string} [data.reply_to]    — Parent message ID for thread replies
 * @param {object} [data.metadata]    — Extra data (file URL, thumbnail, etc.)
 */
export const sendMessage = (roomId, data) =>
  api.post(`${BASE}/rooms/${roomId}/messages`, data);

/**
 * Fetch paginated message history.
 *
 * @param {string} roomId
 * @param {{ cursor?: string, limit?: number, created_at_gte?: string, created_at_lte?: string }} [params]
 */
export const getMessages = (roomId, params = {}) =>
  api.get(`${BASE}/rooms/${roomId}/messages`, params);

/**
 * Soft-delete a message (sets deleted_at). Only sender or owner/sub_admin.
 * @param {string} roomId
 * @param {string} messageId
 * @param {string} userId
 */
export const deleteMessage = (roomId, messageId, userId) =>
  api.delete(`${BASE}/rooms/${roomId}/messages/${messageId}`, { user_id: userId });

/**
 * Edit a text message. Only the original sender can edit.
 * @param {string} roomId
 * @param {string} messageId
 * @param {string} userId
 * @param {string} content
 */
export const editMessage = (roomId, messageId, userId, content) =>
  api.put(`${BASE}/rooms/${roomId}/messages/${messageId}`, { user_id: userId, content });

/**
 * Batch-translate multiple messages into the target language.
 * Call once when loading history to avoid N individual requests.
 *
 * @param {string}   roomId
 * @param {string[]} messageIds
 * @param {string}   targetLang — e.g. 'ko', 'en', 'ja'
 */
export const batchTranslateMessages = (roomId, messageIds, targetLang) =>
  api.post(`${BASE}/rooms/${roomId}/messages/batch-translate`, {
    message_ids: messageIds,
    target_lang: targetLang,
  });

// ── Video Call ────────────────────────────────────────────────────────────

/**
 * Initiate a video call in a room.
 * Broadcasts `video_call.started` to all room members.
 *
 * @param {string} roomId
 * @param {string} callerId
 */
export const startVideoCall = (roomId, callerId, targetUserIds) =>
  api.post(`${BASE}/rooms/${roomId}/video-call`, {
    caller_id: callerId,
    ...(targetUserIds?.length ? { target_user_ids: targetUserIds } : {}),
  });

/**
 * Accept an incoming video call and join the session.
 * @param {string} roomId
 * @param {string} userId
 */
export const acceptVideoCall = (roomId, userId) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/accept`, { user_id: userId });

/**
 * Decline an incoming video call.
 * @param {string} roomId
 * @param {string} userId
 */
export const rejectVideoCall = (roomId, userId) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/reject`, { user_id: userId });

/**
 * Send an automatic busy rejection when the user is already in another call.
 * Called silently by IncomingCallListener — no user interaction required.
 * @param {string} roomId
 * @param {string} userId
 */
export const busyRejectVideoCall = (roomId, userId) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/busy`, { user_id: userId });

/**
 * End the video call for ALL participants.
 * Only the caller or room owner can end.
 *
 * @param {string} roomId
 * @param {string} userId
 */
export const endVideoCall = (roomId, userId) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/end`, { user_id: userId });

/**
 * Leave the call individually — other participants remain connected.
 * If the last participant leaves, the call ends automatically.
 *
 * @param {string} roomId
 * @param {string} userId
 */
export const leaveVideoCall = (roomId, userId) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/leave`, { user_id: userId });

/**
 * Check if there is an active video call in the room.
 * @param {string} roomId
 */
export const getActiveVideoCall = (roomId) =>
  api.get(`${BASE}/rooms/${roomId}/video-call/active`);

// ── Ban / Unban ──────────────────────────────────────────────────────────

/**
 * Ban a user from the room (owner/sub_admin only).
 * @param {string} roomId
 * @param {string} adminId
 * @param {string} userId
 */
export const banUser = (roomId, adminId, userId) =>
  api.post(`${BASE}/rooms/${roomId}/ban`, { admin_id: adminId, user_id: userId });

/**
 * Lift a ban — the user can rejoin after unbanning.
 * @param {string} roomId
 * @param {string} userId
 */
export const unbanUser = (roomId, userId) =>
  api.delete(`${BASE}/rooms/${roomId}/ban/${userId}`);

/**
 * Get all active bans for a room.
 * @param {string} roomId
 */
export const getBans = (roomId) => api.get(`${BASE}/rooms/${roomId}/bans`);

// ── Sub-Admin ────────────────────────────────────────────────────────────

/**
 * Promote a member to sub_admin (owner only).
 * @param {string} roomId
 * @param {string} ownerId
 * @param {string} userId
 */
export const addSubAdmin = (roomId, ownerId, userId) =>
  api.post(`${BASE}/rooms/${roomId}/sub-admins`, { owner_id: ownerId, user_id: userId });

/**
 * Demote a sub_admin back to member (owner only).
 * @param {string} roomId
 * @param {string} userId
 */
export const removeSubAdmin = (roomId, userId) =>
  api.delete(`${BASE}/rooms/${roomId}/sub-admins/${userId}`);

/** Alias: promote member → sub_admin (same as addSubAdmin) */
export const promoteToSubAdmin = addSubAdmin;
/** Alias: demote sub_admin → member (same as removeSubAdmin) */
export const demoteSubAdmin = removeSubAdmin;

// ── Members ──────────────────────────────────────────────────────────────

/**
 * Get all members of a room with their roles.
 * @param {string} roomId
 */
export const getMembers = (roomId) => api.get(`${BASE}/rooms/${roomId}/members`);

// ── Pin ──────────────────────────────────────────────────────────────────

/**
 * Pin a message to the top of the room (1 pin per room, owner/sub_admin only).
 * @param {string} roomId
 * @param {string} messageId
 * @param {string} userId
 */
export const pinMessage = (roomId, messageId, userId) =>
  api.put(`${BASE}/rooms/${roomId}/pin/${messageId}`, { user_id: userId });

/**
 * Remove the pinned message from the room.
 * @param {string} roomId
 * @param {string} userId
 */
export const unpinMessage = (roomId, userId) =>
  api.delete(`${BASE}/rooms/${roomId}/pin`, { user_id: userId });

// ── Typing Prefs ──────────────────────────────────────────────────────────

/**
 * Get per-room typing indicator send/receive preferences for all members.
 * @param {string} roomId
 */
export const getTypingPrefs = (roomId) =>
  api.get(`${BASE}/rooms/${roomId}/typing-prefs`);

/**
 * UPSERT the calling user's typing indicator prefs for a room.
 * @param {string} roomId
 * @param {string} userId
 * @param {boolean} sendEnabled
 * @param {boolean} recvEnabled
 */
export const updateTypingPrefs = (roomId, userId, sendEnabled, recvEnabled) =>
  api.put(`${BASE}/rooms/${roomId}/typing-prefs`, {
    user_id: userId,
    send_enabled: sendEnabled,
    recv_enabled: recvEnabled,
  });

/**
 * Broadcast a typing event for a United Chat room.
 * Backend checks send/recv prefs and only publishes to Ably when appropriate.
 * @param {string} roomId
 * @param {string} userId
 * @param {string} [displayName]
 */
export const sendTypingIndicator = (roomId, userId, displayName) =>
  api.post(`${BASE}/rooms/${roomId}/typing`, { user_id: userId, display_name: displayName });

// ── Mute ─────────────────────────────────────────────────────────────────

/**
 * Mute push notifications for a room.
 * @param {string} roomId
 * @param {string} userId
 * @param {number} [durationMinutes] — Omit for indefinite mute
 */
export const muteRoom = (roomId, userId, durationMinutes) =>
  api.post(`${BASE}/rooms/${roomId}/mute`, {
    user_id: userId,
    ...(durationMinutes && { duration_minutes: durationMinutes }),
  });

/**
 * Unmute push notifications for a room.
 * @param {string} roomId
 * @param {string} userId
 */
export const unmuteRoom = (roomId, userId) =>
  api.delete(`${BASE}/rooms/${roomId}/mute`, { user_id: userId });

/**
 * Check mute status for a user in a room.
 * @param {string} roomId
 * @param {string} userId
 * @returns {Promise<{ is_muted: boolean, muted_until: string|null }>}
 */
export const getMuteStatus = (roomId, userId) =>
  api.get(`${BASE}/rooms/${roomId}/mute/${userId}`);

// ── Freeze ───────────────────────────────────────────────────────────────

/**
 * Freeze the room — regular members cannot send messages.
 * Only owner/sub_admin can still post.
 *
 * @param {string} roomId
 * @param {string} userId — Must be owner or sub_admin
 */
export const freezeRoom = (roomId, userId) =>
  api.post(`${BASE}/rooms/${roomId}/freeze`, { user_id: userId });

/**
 * Unfreeze — all members can send messages again.
 * @param {string} roomId
 * @param {string} userId
 */
export const unfreezeRoom = (roomId, userId) =>
  api.delete(`${BASE}/rooms/${roomId}/freeze`, { user_id: userId });

// ── User Block ─────────────────────────────────────────────────────────────

/**
 * Block another user globally within the org.
 * The blocked user's messages will not reach the blocker in any room.
 * @param {string} blockerId — The user initiating the block
 * @param {string} blockedId — The user being blocked
 */
export const blockUser = (blockerId, blockedId) =>
  api.post('/users/block', { blocker_id: blockerId, blocked_id: blockedId });

/**
 * Unblock a previously blocked user.
 * @param {string} blockerId
 * @param {string} blockedId
 */
export const unblockUser = (blockerId, blockedId) =>
  api.delete('/users/block', { blocker_id: blockerId, blocked_id: blockedId });

/**
 * Get the list of users blocked by a given user.
 * @param {string} userId
 * @returns {Promise<{ user_id: string, blocked_users: Array<{ blocked_id: string, created_at: string }> }>}
 */
export const getBlockList = (userId) =>
  api.get(`/users/${userId}/blocks`);

