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
import { declaredQuality, publishResolutionFor } from './videoQuality';

const BASE = '/unitedchat';

// ── Room Management ──────────────────────────────────────────────────────

/**
 * Create a chat room.
 *
 * @param {object} data
 * @param {'1to1'|'group'|'open'} data.room_type
 * @param {string}  data.creator_id       — You
 * @param {string}  [data.room_name]      — Display name (group/open only)
 * @param {string[]} [data.members]       — User IDs to invite. For '1to1' pass
 *   exactly `[peerUserId]` — the server takes members[0] as the peer and
 *   `creator_id` as you; `[me, peer]` would create a chat with yourself.
 * @param {number}  [data.max_members=100]
 * @returns {Promise<{ room: object }>} Created room (or existing 1:1 if duplicate)
 */
export const createRoom = (data) => api.post(`${BASE}/rooms`, data);

/**
 * List rooms the user belongs to, plus joinable open rooms.
 *
 * @param {string} userId
 * @param {{ limit?: number, cursor?: string, lang?: string }} [params]
 *   Pass `lang` (e.g. `'ko'`, `'ja'`) to enable description auto-translation.
 *   Translations are cached server-side — no extra cost on repeated calls.
 *   Each row's `room_name` is already resolved for this user (your custom
 *   name, else the 1:1 peer's name, else the room name).
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
 *
 * Pass your own `userId`: the server then resolves the names for YOU —
 * `custom_name` (a name you set with updateRoomName) and, for a 1:1 room,
 * `display_name` = the peer's name. Without it a 1:1 room only has its
 * internal channel name to show, and a renamed room loses its name on reload.
 * `room_name` is the group/open room's own name (null for 1:1);
 * `members[].user_name` carries each member's current name.
 *
 * @param {string} roomId
 * @param {string} userId — The signed-in user
 * @returns {Promise<{ room: object }>}
 */
export const getRoom = (roomId, userId) =>
  api.get(`${BASE}/rooms/${roomId}`, userId ? { user_id: userId } : undefined);

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
 * Joining a room you are already in is fine (no second join notice).
 * @param {string} inviteCode
 * @param {string} userId — The signed-in user
 * @param {string} [displayName]
 * @returns {Promise<{ success: boolean, room_id: string, room_name: string, realtime_channel: string }>}
 *   404 = unknown code; 403 `banned` / `room_full`.
 */
export const joinByCode = (inviteCode, userId, displayName) =>
  api.post(`${BASE}/rooms/join-by-code`, { invite_code: inviteCode, user_id: userId, display_name: displayName });


/**
 * Join an open (public) room.
 * @param {string} roomId
 * @param {string} userId
 * @param {string} [displayName] — Shown in the system join message broadcasted to all members
 */
export const joinRoom = (roomId, userId, displayName) =>
  api.post(`${BASE}/rooms/${roomId}/join`, { user_id: userId, display_name: displayName });

/**
 * Leave a room.
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
 * @returns {Promise<{ message: object }>} The stored message. The same message
 *   also arrives on the room's real-time channel — for the sender too — so
 *   swap an optimistic placeholder for it by id instead of adding it twice.
 */
export const sendMessage = (roomId, data) =>
  api.post(`${BASE}/rooms/${roomId}/messages`, data);

/**
 * Fetch paginated message history.
 *
 * 🔴 Messages come NEWEST FIRST. Reverse each page before rendering
 * oldest → newest, and append real-time messages at the end. For older
 * history pass the previous page's `next_cursor` as `cursor` while
 * `has_more` is true, and prepend the (reversed) result.
 *
 * @param {string} roomId
 * @param {{ cursor?: string, limit?: number, created_at_gte?: string, created_at_lte?: string }} [params]
 * @returns {Promise<{ messages: object[], next_cursor: string|null, has_more: boolean,
 *   read_statuses: object[], reply_snapshots: Object<string, object> }>}
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
 * Add an emoji reaction to a message (idempotent for the same user + emoji).
 * Everyone in the room also receives a `reaction` real-time event carrying
 * the delta `{ message_id, emoji, user_id, action: 'add' }`.
 *
 * @param {string} roomId
 * @param {string} messageId
 * @param {string} userId — The signed-in user
 * @param {string} emoji
 * @returns {Promise<{ reactions: Object<string, string[]> }>} The message's full
 *   reaction map ({ emoji: [userId, …] }) after the change
 */
export const addReaction = (roomId, messageId, userId, emoji) =>
  api.post(`${BASE}/rooms/${roomId}/messages/${messageId}/reactions`, { user_id: userId, emoji });

/**
 * Remove your emoji reaction from a message. Same response and real-time
 * event as addReaction (with `action: 'remove'`).
 *
 * @param {string} roomId
 * @param {string} messageId
 * @param {string} userId — The signed-in user
 * @param {string} emoji
 */
export const removeReaction = (roomId, messageId, userId, emoji) =>
  api.delete(`${BASE}/rooms/${roomId}/messages/${messageId}/reactions`, { user_id: userId, emoji });

/**
 * Batch-translate multiple messages into the target language.
 * Call once when loading history to avoid N individual requests.
 *
 * Works with the end-user token, so this is how a client app translates chat.
 * (The standalone `/translate/*` endpoints need your organization API key and
 * belong on your backend.) Up to 100 message ids per call. Translations are
 * cached on the message, so asking again for an already-translated message is
 * answered from that cache without metering new translation characters.
 *
 * @param {string}   roomId
 * @param {string[]} messageIds
 * @param {string}   targetLang — e.g. 'ko', 'en', 'ja'
 * @returns {Promise<{ translations: Object<string, string>, limited?: boolean }>}
 *   `translations` maps message id → translated text. Messages that need no
 *   translation (already in `targetLang`, or not text) are simply absent.
 *   `limited: true` means new translations were skipped because the user hit
 *   the daily fair-use translation limit (cached ones are still returned).
 */
export const batchTranslateMessages = (roomId, messageIds, targetLang) =>
  api.post(`${BASE}/rooms/${roomId}/messages/batch-translate`, {
    message_ids: messageIds,
    target_lang: targetLang,
  });

// ── Video Call ────────────────────────────────────────────────────────────

/**
 * Initiate a video call in a room.
 * Each callee receives a `CALL_INVITE` signal on their private real-time
 * channel, and a `call_started` event is posted to the room.
 *
 * @param {string}   roomId
 * @param {string}   callerId
 * @param {string[]} [targetUserIds] — Required for group rooms (who to ring)
 * @returns {Promise<{ session: object, caller: object, targets: string[] }>}
 *   `session.id` is the session id every later call action needs
 *   (accept / reject / end / leave / heartbeat); `session.channel_name` is
 *   the media channel; `caller` carries the caller's own `uid` / `rtc_token`.
 *   `quality_warning` is present when the declared quality looks too low.
 */
export const startVideoCall = (roomId, callerId, targetUserIds) =>
  api.post(`${BASE}/rooms/${roomId}/video-call`, {
    caller_id: callerId,
    ...(targetUserIds?.length ? { target_user_ids: targetUserIds } : {}),
    // Billing tier for this call. Derived from the publishing preset in
    // services/videoQuality.js so the tier declared here always matches the
    // pixels actually sent — change both in that file, never just one.
    quality: declaredQuality(),
    // Optional self-check: what we will actually publish at this call size.
    // The server multiplies it by the streams each participant receives and
    // returns `quality_warning` when the total exceeds the tier above. It is
    // never the billing basis — `quality` is.
    publish_resolution: publishResolutionFor(1 + (targetUserIds?.length || 1)),
  });

/**
 * Accept an incoming video call and join the session.
 * Answers 410 (`session_ended`) when the caller hung up first.
 *
 * @param {string} roomId
 * @param {string} userId
 * @param {string} sessionId — `sessionId` from the CALL_INVITE signal
 */
export const acceptVideoCall = (roomId, userId, sessionId) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/accept`, { user_id: userId, session_id: sessionId });

/**
 * Decline an incoming video call.
 *
 * @param {string} roomId
 * @param {string} userId
 * @param {string} sessionId — `sessionId` from the CALL_INVITE signal
 * @param {'missed'|'busy'} [reason] — Omit for a plain decline
 */
export const rejectVideoCall = (roomId, userId, sessionId, reason) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/reject`, {
    user_id: userId,
    session_id: sessionId,
    ...(reason && { reason }),
  });

/**
 * End the video call for ALL participants.
 * Only the caller, the room owner or a sub_admin can end it for everyone —
 * anyone else gets 403 and should use leaveVideoCall() instead.
 *
 * @param {string} roomId
 * @param {string} userId
 * @param {string} sessionId
 */
export const endVideoCall = (roomId, userId, sessionId) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/end`, { user_id: userId, session_id: sessionId });

/**
 * Leave the call individually — other participants remain connected.
 * When one participant or fewer is left, the call ends automatically.
 * (This is the CALL. `leaveRoom()` leaves the chat room — never use it to hang up.)
 *
 * @param {string} roomId
 * @param {string} userId
 * @param {string} sessionId
 */
export const leaveVideoCall = (roomId, userId, sessionId) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/leave`, { user_id: userId, session_id: sessionId });

/**
 * Tell HyperBabel this participant has actually joined the media channel.
 * Call once right after the RTC join succeeds — call duration is measured from
 * real media presence (the accept time is only a fallback). Returns
 * `{ success, matched }`; retry while `matched` is false.
 *
 * @param {string} roomId
 * @param {string} userId
 * @param {string} sessionId
 */
export const markJoinedRtc = (roomId, userId, sessionId) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/joined-rtc`, { user_id: userId, session_id: sessionId });

/**
 * Liveness ping — send once a minute while on the call screen. Without it the
 * server cannot tell a long call from one both apps abandoned, and may close
 * the session when someone else tries to call a participant.
 *
 * @param {string} roomId
 * @param {string} userId
 * @param {string} sessionId
 */
export const sendVideoCallHeartbeat = (roomId, userId, sessionId) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/heartbeat`, { user_id: userId, session_id: sessionId });

/**
 * Get a fresh RTC token for this participant (same channel and uid). RTC
 * tokens are valid for one hour — renew shortly before they expire, or the
 * call drops.
 *
 * @param {string} roomId
 * @param {string} userId
 * @param {string} sessionId
 * @returns {Promise<{ rtc_token: string, channel_name: string, uid: number, app_id: string, expires_in: number, session_id: string }>}
 */
export const renewVideoCallToken = (roomId, userId, sessionId) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/renew-token`, { user_id: userId, session_id: sessionId });

/**
 * Check if there is an active video call in the room.
 * @param {string} roomId
 * @returns {Promise<{ active: boolean, session: object|null }>}
 *   `session` is null when there is no call; otherwise it carries `id`,
 *   `channel_name`, `status`, `participants` and `active_participant_count`.
 */
export const getActiveVideoCall = (roomId) =>
  api.get(`${BASE}/rooms/${roomId}/video-call/active`);

// ── Ban / Unban ──────────────────────────────────────────────────────────

/**
 * Ban a user from the room (owner/sub_admin only).
 * @param {string} roomId
 * @param {string} adminId — The owner / sub_admin performing the ban (sent as `banned_by`)
 * @param {string} userId  — The user being banned
 */
export const banUser = (roomId, adminId, userId) =>
  api.post(`${BASE}/rooms/${roomId}/ban`, { user_id: userId, banned_by: adminId });

/**
 * Lift a ban — the user can rejoin after unbanning (owner/sub_admin only).
 * @param {string} roomId
 * @param {string} adminId — The owner / sub_admin lifting the ban (sent as `unbanned_by`)
 * @param {string} userId  — The banned user
 */
export const unbanUser = (roomId, adminId, userId) =>
  api.delete(`${BASE}/rooms/${roomId}/ban/${userId}`, { unbanned_by: adminId });

/**
 * Get the ban history for a room.
 * @param {string} roomId
 * @returns {Promise<{ bans: Array<{ user_id, banned_by, banned_at, unbanned_by, unbanned_at, is_active }> }>}
 *   Includes lifted bans — filter on `is_active` for the current ones.
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
 * @param {string} ownerId — The room owner performing the demotion
 * @param {string} userId  — The sub_admin being demoted
 */
export const removeSubAdmin = (roomId, ownerId, userId) =>
  api.delete(`${BASE}/rooms/${roomId}/sub-admins/${userId}`, { owner_id: ownerId });

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
 * Backend checks send/recv prefs and only publishes via HyperBabel Real-Time when appropriate.
 *
 * 🔴 THROTTLE IT — never call this per keystroke. It counts against the same
 * per-user, per-minute rate limit as every other call (60/min on the Free
 * plan), and a 429 here also blocks that user's next message send. Send at
 * most one call every ~3 s while the user keeps typing (ChatInput does this).
 * There is no "stopped typing" call: receivers hide the indicator a few
 * seconds after the last event, or as soon as that user's message arrives.
 *
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

