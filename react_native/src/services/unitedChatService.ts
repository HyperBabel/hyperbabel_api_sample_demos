/**
 * HyperBabel API — United Chat Service
 *
 * The United Chat API is the high-level, all-in-one messaging layer.
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

// ── Types ─────────────────────────────────────────────────────────────────

export type RoomType = '1to1' | 'group' | 'open';
export type MessageType = 'text' | 'image' | 'file' | 'video' | 'audio' | 'system';
export type MemberRole = 'owner' | 'sub_admin' | 'member';

export interface CreateRoomParams {
  room_type:    RoomType;
  creator_id:   string;
  room_name?:   string;
  members?:     string[];
  max_members?: number;
}

export interface SendMessageParams {
  sender_id:    string;
  content:      string;
  message_type?: MessageType;
  reply_to?:    string;
  metadata?:    Record<string, unknown>;
}

export interface GetMessagesParams {
  cursor?:         string;
  limit?:          number;
  created_at_gte?: string;
  created_at_lte?: string;
}

export interface Room {
  room_id:        string;
  room_type:      RoomType;
  room_name:      string | null;
  description?:   string | null;
  invite_code?:   string;
  is_frozen:      boolean;
  is_muted?:      boolean;
  unread_count:   number;
  last_message?:  Message | null;
  members:        RoomMember[];
  pinned_message?: Message | null;
  created_at:     string;
}

export interface RoomMember {
  user_id:      string;
  user_name:    string;
  role:         MemberRole;
  joined_at:    string;
}

export interface Message {
  message_id:   string;
  room_id:      string;
  sender_id:    string;
  sender_name?: string;
  content:      string;
  message_type: MessageType;
  reply_to?:    string | null;
  metadata?:    Record<string, unknown> | null;
  deleted_at?:  string | null;
  created_at:   string;
  updated_at?:  string;
  translations?: Record<string, string>;
  reactions?:   Reaction[];
  reply_count?: number;
}

export interface Reaction {
  emoji:   string;
  user_id: string;
  count:   number;
}

export interface ActiveVideoCall {
  session_id:   string;
  channel_name: string;
  rtc_token?:   string;
  uid?:         number;
  app_id?:      string;
  call_type:    '1to1' | 'group';
  started_by:   string;
  participants: string[];
}

// ── Room Management ──────────────────────────────────────────────────────

/**
 * Create a chat room.
 * Returns the existing room if a 1:1 room between the same users already exists.
 */
export const createRoom = (data: CreateRoomParams) =>
  api.post<Room>(`${BASE}/rooms`, data);

/**
 * List rooms the user belongs to, plus joinable open rooms.
 * Pass `lang` to enable description auto-translation for open rooms.
 */
export const listRooms = (userId: string, params: { limit?: number; cursor?: string; lang?: string } = {}) => {
  const lang = params.lang ?? 'en';
  return api.get<{ rooms: Room[]; open_rooms: Room[] }>(`${BASE}/rooms?user_id=${userId}&lang=${lang}`);
};

/**
 * Get full room details including member list with roles.
 */
export const getRoom = (roomId: string) =>
  api.get<Room>(`${BASE}/rooms/${roomId}`);

/**
 * Set a per-user custom display name for a room.
 */
export const updateRoomName = (roomId: string, userId: string, customName: string) =>
  api.put(`${BASE}/rooms/${roomId}/name`, { user_id: userId, custom_name: customName });

/**
 * Update the description for an open room (owner only).
 */
export const updateRoomDescription = (roomId: string, userId: string, description: string | null) =>
  api.put(`${BASE}/rooms/${roomId}/description`, { user_id: userId, description });

/**
 * Join an open room using an 8-character invite code.
 */
export const joinByCode = (inviteCode: string, userId: string, displayName?: string) =>
  api.post<Room>(`${BASE}/rooms/join-by-code`, { invite_code: inviteCode, user_id: userId, display_name: displayName });

/**
 * Get the org's open room file transfer policy.
 */
export const getOpenRoomPolicy = () =>
  api.get<{ files_enabled: boolean; max_file_size_mb: number; allowed_types: string[] }>(`${BASE}/policy`);

/**
 * Join an open (public) room.
 */
export const joinRoom = (roomId: string, userId: string, displayName?: string) =>
  api.post(`${BASE}/rooms/${roomId}/join`, { user_id: userId, display_name: displayName });

/**
 * Leave a room (owner cannot leave without transferring ownership first).
 */
export const leaveRoom = (roomId: string, userId: string, displayName?: string) =>
  api.post(`${BASE}/rooms/${roomId}/leave`, { user_id: userId, display_name: displayName });

/**
 * Mark the latest message in a room as read (resets unread count).
 */
export const markAsRead = (roomId: string, userId: string) =>
  api.post(`${BASE}/rooms/${roomId}/read`, { user_id: userId });

// ── Messages ─────────────────────────────────────────────────────────────

/**
 * Send a message to a room.
 */
export const sendMessage = (roomId: string, data: SendMessageParams) =>
  api.post<Message>(`${BASE}/rooms/${roomId}/messages`, data);

/**
 * Fetch paginated message history.
 */
export const getMessages = (roomId: string, params: GetMessagesParams = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]).toString();
  return api.get<{ messages: Message[]; next_cursor: string | null }>(`${BASE}/rooms/${roomId}/messages${qs ? `?${qs}` : ''}`);
};

/**
 * Soft-delete a message (sets deleted_at). Only sender or owner/sub_admin.
 */
export const deleteMessage = (roomId: string, messageId: string, userId: string) =>
  api.delete(`${BASE}/rooms/${roomId}/messages/${messageId}`, { user_id: userId });

/**
 * Edit a text message. Only the original sender can edit.
 */
export const editMessage = (roomId: string, messageId: string, userId: string, content: string) =>
  api.put(`${BASE}/rooms/${roomId}/messages/${messageId}`, { user_id: userId, content });

/**
 * Batch-translate multiple messages into the target language.
 * Call once when loading history — more efficient than N individual requests.
 */
export const batchTranslateMessages = (roomId: string, messageIds: string[], targetLang: string) =>
  api.post<{ translations: Record<string, string> }>(`${BASE}/rooms/${roomId}/messages/batch-translate`, {
    message_ids: messageIds,
    target_lang: targetLang,
  });

// ── Video Call ────────────────────────────────────────────────────────────

/**
 * Initiate a video call in a room.
 * Broadcasts a CALL_INVITE event to all room members via the private channel.
 */
export const startVideoCall = (roomId: string, callerId: string, targetUserIds?: string[]) =>
  api.post<ActiveVideoCall>(`${BASE}/rooms/${roomId}/video-call`, {
    caller_id: callerId,
    ...(targetUserIds?.length ? { target_user_ids: targetUserIds } : {}),
  });

/**
 * Accept an incoming video call and join the session.
 */
export const acceptVideoCall = (roomId: string, userId: string) =>
  api.post<ActiveVideoCall>(`${BASE}/rooms/${roomId}/video-call/accept`, { user_id: userId });

/**
 * Decline an incoming video call.
 */
export const rejectVideoCall = (roomId: string, userId: string) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/reject`, { user_id: userId });

/**
 * Send an automatic busy rejection when the user is already in another call.
 * Called silently by IncomingCallListener — no user interaction required.
 */
export const busyRejectVideoCall = (roomId: string, userId: string) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/busy`, { user_id: userId });

/**
 * End the video call for ALL participants.
 * Only the caller or room owner can end the call.
 */
export const endVideoCall = (roomId: string, userId: string) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/end`, { user_id: userId });

/**
 * Leave the call individually — other participants remain connected.
 * If the last participant leaves, the call ends automatically.
 */
export const leaveVideoCall = (roomId: string, userId: string) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/leave`, { user_id: userId });

/**
 * Check if there is an active video call in the room.
 */
export const getActiveVideoCall = (roomId: string) =>
  api.get<ActiveVideoCall | null>(`${BASE}/rooms/${roomId}/video-call/active`);

// ── Ban / Unban ──────────────────────────────────────────────────────────

/** Ban a user from the room (owner/sub_admin only). */
export const banUser = (roomId: string, adminId: string, userId: string) =>
  api.post(`${BASE}/rooms/${roomId}/ban`, { admin_id: adminId, user_id: userId });

/** Lift a ban — the user can rejoin after unbanning. */
export const unbanUser = (roomId: string, userId: string) =>
  api.delete(`${BASE}/rooms/${roomId}/ban/${userId}`);

/** Get all active bans for a room. */
export const getBans = (roomId: string) =>
  api.get<{ bans: Array<{ user_id: string; banned_at: string }> }>(`${BASE}/rooms/${roomId}/bans`);

// ── Sub-Admin ────────────────────────────────────────────────────────────

/** Promote a member to sub_admin (owner only). */
export const addSubAdmin = (roomId: string, ownerId: string, userId: string) =>
  api.post(`${BASE}/rooms/${roomId}/sub-admins`, { owner_id: ownerId, user_id: userId });

/** Demote a sub_admin back to member (owner only). */
export const removeSubAdmin = (roomId: string, userId: string) =>
  api.delete(`${BASE}/rooms/${roomId}/sub-admins/${userId}`);

export const promoteToSubAdmin = addSubAdmin;
export const demoteSubAdmin    = removeSubAdmin;

// ── Members ──────────────────────────────────────────────────────────────

/** Get all members of a room with their roles. */
export const getMembers = (roomId: string) =>
  api.get<{ members: RoomMember[] }>(`${BASE}/rooms/${roomId}/members`);

// ── Pin ──────────────────────────────────────────────────────────────────

/** Pin a message to the top of the room (1 pin per room, owner/sub_admin only). */
export const pinMessage = (roomId: string, messageId: string, userId: string) =>
  api.put(`${BASE}/rooms/${roomId}/pin/${messageId}`, { user_id: userId });

/** Remove the pinned message from the room. */
export const unpinMessage = (roomId: string, userId: string) =>
  api.delete(`${BASE}/rooms/${roomId}/pin`, { user_id: userId });

// ── Typing ────────────────────────────────────────────────────────────────

/** Get per-room typing indicator send/receive preferences for all members. */
export const getTypingPrefs = (roomId: string) =>
  api.get(`${BASE}/rooms/${roomId}/typing-prefs`);

/** UPSERT the calling user's typing indicator prefs for a room. */
export const updateTypingPrefs = (roomId: string, userId: string, sendEnabled: boolean, recvEnabled: boolean) =>
  api.put(`${BASE}/rooms/${roomId}/typing-prefs`, {
    user_id: userId,
    send_enabled: sendEnabled,
    recv_enabled: recvEnabled,
  });

/**
 * Broadcast a typing event for a United Chat room.
 * Backend checks send/recv prefs and only delivers to opts-in recipients.
 */
export const sendTypingIndicator = (roomId: string, userId: string, displayName?: string) =>
  api.post(`${BASE}/rooms/${roomId}/typing`, { user_id: userId, display_name: displayName });

// ── Mute ─────────────────────────────────────────────────────────────────

/** Mute push notifications for a room. Omit durationMinutes for indefinite mute. */
export const muteRoom = (roomId: string, userId: string, durationMinutes?: number) =>
  api.post(`${BASE}/rooms/${roomId}/mute`, {
    user_id: userId,
    ...(durationMinutes && { duration_minutes: durationMinutes }),
  });

/** Unmute push notifications for a room. */
export const unmuteRoom = (roomId: string, userId: string) =>
  api.delete(`${BASE}/rooms/${roomId}/mute`, { user_id: userId });

/** Check mute status for a user in a room. */
export const getMuteStatus = (roomId: string, userId: string) =>
  api.get<{ is_muted: boolean; muted_until: string | null }>(`${BASE}/rooms/${roomId}/mute/${userId}`);

// ── Freeze ───────────────────────────────────────────────────────────────

/** Freeze the room — regular members cannot send messages. Only owner/sub_admin can still post. */
export const freezeRoom = (roomId: string, userId: string) =>
  api.post(`${BASE}/rooms/${roomId}/freeze`, { user_id: userId });

/** Unfreeze — all members can send messages again. */
export const unfreezeRoom = (roomId: string, userId: string) =>
  api.delete(`${BASE}/rooms/${roomId}/freeze`, { user_id: userId });

// ── User Block ─────────────────────────────────────────────────────────────

/**
 * Block another user globally within the org.
 * The blocked user's messages will not reach the blocker in any room.
 */
export const blockUser = (blockerId: string, blockedId: string) =>
  api.post('/users/block', { blocker_id: blockerId, blocked_id: blockedId });

/** Unblock a previously blocked user. */
export const unblockUser = (blockerId: string, blockedId: string) =>
  api.delete('/users/block', { blocker_id: blockerId, blocked_id: blockedId });

/** Get the list of users blocked by a given user. */
export const getBlockList = (userId: string) =>
  api.get<{ user_id: string; blocked_users: Array<{ blocked_id: string; created_at: string }> }>(`/users/${userId}/blocks`);
