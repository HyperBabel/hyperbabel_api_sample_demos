/**
 * HyperBabel API — United Chat Service
 *
 * The United Chat API is the high-level, all-in-one messaging layer.
 * It wraps room management, member roles, video call lifecycle, ban/mute,
 * freeze, pinning, and message CRUD into a single cohesive API surface.
 *
 * It is the messaging surface an end-user app can call with its customer
 * JWT. The low-level Chat API (`/chat/*`) is server-to-server — it needs the
 * organization API key and refuses end-user tokens with 403.
 *
 * Base path: /unitedchat
 */

import api from './api';
import { declaredQuality, publishResolutionFor } from './videoQuality';

const BASE = '/unitedchat';

// ── Types ─────────────────────────────────────────────────────────────────

export type RoomType = '1to1' | 'group' | 'open';
export type MessageType =
  | 'text' | 'image' | 'file' | 'video' | 'audio' | 'location' | 'contact' | 'system'
  // Written by the server only: call events (empty content, details in
  // `metadata.event`) and live-call captions (never returned by the list API).
  | 'video_call' | 'caption';
export type MemberRole = 'owner' | 'sub_admin' | 'member';

export interface CreateRoomParams {
  room_type:    RoomType;
  /** You. With an end-user token it must be your own user id. */
  creator_id:   string;
  room_name?:   string;
  /**
   * The OTHER people — never include yourself for a 1:1 room.
   *  - '1to1': exactly `[peerUserId]`; the server reads `members[0]` as the
   *    peer. `[me, peer]` would make `me` the peer → a chat with yourself.
   *    `[yourOwnId]` is the deliberate self-chat ("My Notes").
   *  - 'group': at least one id (the creator is always added).
   */
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
  /** Room id (UUID) — the value every `/rooms/:roomId` path takes. */
  id:             string;
  /** Room kind. Room reads name it `channel_type` — `room_type` is the create-request field. */
  channel_type:   RoomType;
  /**
   * GET /rooms: the name to show — for a 1:1 room, the PEER's name.
   * GET /rooms/:roomId: the group / open room name only (null for 1:1).
   */
  room_name:      string | null;
  /**
   * GET /rooms/:roomId only — a fallback title for the caller passed as
   * `user_id`: their own alias, else (1:1) the peer's name as stored when the
   * room was created, else the room name, else the internal channel name.
   * For a 1:1 header prefer the peer's live `members[].user_name`.
   */
  display_name?:  string;
  description?:   string | null;
  /**
   * GET /rooms with `lang`: the open room's description in that language.
   * May be missing on the first request for a language (translated in the
   * background) — fall back to `description`.
   */
  description_translated?: string;
  invite_code?:   string | null;
  is_frozen:      boolean;
  is_muted?:      boolean;
  unread_count:   number;
  /**
   * GET /rooms only. A database COUNT, which arrives as a STRING
   * (e.g. "3") — read it through `Number()`.
   */
  member_count?:  string | number;
  last_message?:  Message | null;
  /** GET /rooms/:roomId only — the room list does not embed members. */
  members?:       RoomMember[];
  /**
   * Id of the pinned message, or null. The API returns the id only — there is
   * no embedded message and no get-by-id route, so resolve it against the
   * messages you have loaded.
   */
  pinned_message_id?: string | null;
  created_at:     string;
  /**
   * The room's real-time channel name, supplied by the API.
   *
   * Pass this VERBATIM to `subscribeToRoom()`. It cannot be derived from
   * the room `id` — the server builds it from values the client does not have,
   * so a hand-built name silently subscribes to a channel nobody publishes on.
   */
  realtime_channel?: string;
}

export interface RoomMember {
  user_id:      string;
  /** The member's profile name; null when the user has none. */
  user_name:    string | null;
  role:         MemberRole;
  joined_at:    string;
}

export interface Message {
  /** Message id (UUID) — pass this to delete / edit / react / reply / translate. */
  id:           string;
  /** Id of the room the message belongs to. */
  channel_id:   string;
  sender_id:    string;
  sender_name?: string;
  content:      string;
  message_type: MessageType;
  reply_to?:    string | null;
  metadata?:    Record<string, unknown> | null;
  deleted_at?:  string | null;
  created_at:   string;
  /** Set on the first edit (null until then). */
  edited_at?:   string | null;
  /** Translations stored so far, keyed by language code. */
  translated_content?: Record<string, string> | null;
  /**
   * Emoji reactions, exactly as the API stores them: a MAP of emoji to the
   * user ids that reacted with it — `{ "👍": ["user_1", "user_2"] }`.
   *
   * It is NOT a list of `{ emoji, user_id, count }` objects. The count is
   * simply the array length; there is no separate count field to keep in
   * sync. `POST`/`DELETE .../reactions` returns this same map in full.
   */
  reactions?:   Record<string, string[]>;
}

/** One participant slot of a video call session. */
export interface VideoCallParticipant {
  user_id:    string;
  /** Numeric media uid to join the video channel with. */
  uid:        number;
  /**
   * Video channel token. With an end-user token only YOUR OWN entry carries
   * one — the server strips everyone else's.
   */
  rtc_token?: string;
  /** 'invited' until accepted, then 'active'; 'left' after leaving. */
  status:     string;
  is_caller?: boolean;
}

/**
 * A call session. Both the start and the active-call responses NEST it under
 * `session` — the id is `session.id` (there is no `session_id` field here).
 */
export interface VideoCallSession {
  id:           string;
  channel_name: string;
  call_type?:   '1to1' | 'group';
  status:       string;
  participants: VideoCallParticipant[];
  app_id?:      string;
}

/** POST /rooms/:roomId/video-call */
export interface StartVideoCallResponse {
  session:          VideoCallSession;
  /** The caller's own slot — `caller.rtc_token` + `caller.uid` join the channel. */
  caller:           VideoCallParticipant;
  targets:          string[];
  quality_warning?: string;
}

/** GET /rooms/:roomId/video-call/active */
export interface ActiveVideoCallResponse {
  active:  boolean;
  session: VideoCallSession | null;
}

/** POST /rooms/:roomId/video-call/renew-token */
export interface RenewVideoCallTokenResponse {
  session_id:   string;
  channel_name: string;
  uid:          number;
  rtc_token:    string;
  app_id:       string;
  expires_in:   number;
}

/**
 * A call event: call_started | call_accepted | call_ended | call_rejected |
 * call_missed | call_busy. For the last three, `user_id` is the callee.
 */
export interface CallEvent {
  event:      string;
  session_id: string;
  user_id?:   string;
}

/**
 * Read a call event out of a ROOM-channel delivery, or null for anything
 * else. Call events travel as ordinary chat messages — event name 'message',
 * payload `{ type: 'message', data: <message> }` where the message has
 * `message_type: 'video_call'`, empty `content` and the details in `metadata`.
 */
export const callEventFrom = (eventName: string, payload: unknown): CallEvent | null => {
  const envelope = payload as { type?: string; data?: Message } | null;
  if (eventName !== 'message' || envelope?.type !== 'message') return null;
  if (envelope.data?.message_type !== 'video_call') return null;
  const meta = (envelope.data.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.event !== 'string' || typeof meta.session_id !== 'string') return null;
  return {
    event:      meta.event,
    session_id: meta.session_id,
    user_id:    typeof meta.user_id === 'string' ? meta.user_id : undefined,
  };
};

// ── Room Management ──────────────────────────────────────────────────────

/**
 * Create a chat room. The response is WRAPPED: `{ room: { id, … } }`.
 * If a 1:1 room between the same users already exists, it answers
 * `{ room: { id, already_exists: true } }` instead.
 */
export const createRoom = (data: CreateRoomParams) =>
  api.post<{ room: Partial<Room> & { id: string; already_exists?: boolean } }>(`${BASE}/rooms`, data);

/**
 * List rooms the user belongs to, plus joinable open rooms.
 * Pass `lang` to enable description auto-translation for open rooms.
 */
export const listRooms = (userId: string, params: { limit?: number; cursor?: string; lang?: string } = {}) => {
  const lang = params.lang ?? 'en';
  return api.get<{ rooms: Room[]; open_rooms: Room[] }>(`${BASE}/rooms?user_id=${userId}&lang=${lang}`);
};

/**
 * Fetch one room, including the member list with roles.
 *
 * The endpoint answers with the room WRAPPED as `{ room: { … } }`, so unwrap
 * it here rather than in every screen.
 *
 * Pass `userId` (your own id) when you show the room's title: it resolves
 * `display_name` for you (your alias, or the peer of a 1:1 room). Without it
 * `display_name` falls back to the internal channel name.
 */
export const getRoom = async (roomId: string, userId?: string): Promise<Room> => {
  const qs = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
  const res = await api.get<{ room: Room }>(`${BASE}/rooms/${roomId}${qs}`);
  return res.room;
};

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
 * Unlike the room objects elsewhere, this response names the id `room_id`.
 */
export const joinByCode = (inviteCode: string, userId: string, displayName?: string) =>
  api.post<{ success: boolean; room_id: string; room_name: string | null; realtime_channel: string }>(
    `${BASE}/rooms/join-by-code`,
    { invite_code: inviteCode, user_id: userId, display_name: displayName },
  );

/**
 * Join an open (public) room.
 */
export const joinRoom = (roomId: string, userId: string, displayName?: string) =>
  api.post(`${BASE}/rooms/${roomId}/join`, { user_id: userId, display_name: displayName });

/**
 * Leave a room. Any member may leave — the owner included; ownership is not
 * handed to anyone, so a room the owner left has no owner afterwards.
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
 * Send a message to a room. The response is WRAPPED: `{ message: { … } }`.
 */
export const sendMessage = (roomId: string, data: SendMessageParams) =>
  api.post<{ message: Message }>(`${BASE}/rooms/${roomId}/messages`, data);

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
 *
 * Each callee is rung on their private real-time channel: event name
 * `'signal'`, payload `{ type: 'CALL_INVITE', sessionId, roomId, … }`.
 * 1:1 rooms ring the other member; group rooms REQUIRE `targetUserIds`;
 * open rooms cannot hold calls (400).
 *
 * Size: caller + targets may be at most 3 on plans that include group video,
 * otherwise 2 — more answers 400 `plan_upgrade_required` (`limit_exceeded`
 * above 3). Busy targets are skipped: the caller gets one `CALL_BUSY` signal
 * per skipped target on their private channel, and 409 `targets_busy` when
 * every target is busy.
 *
 * The response nests everything: `session.id`, `session.channel_name`,
 * `session.app_id`, and the caller's own `caller.rtc_token` / `caller.uid`.
 */
export const startVideoCall = (roomId: string, callerId: string, targetUserIds?: string[]) =>
  api.post<StartVideoCallResponse>(`${BASE}/rooms/${roomId}/video-call`, {
    caller_id: callerId,
    ...(targetUserIds?.length ? { target_user_ids: targetUserIds } : {}),
    // Billing tier for this call. Derived from the publishing preset in
    // services/videoQuality.ts so the tier declared here always matches the
    // pixels actually sent — change both in that file, never just one.
    quality: declaredQuality(),
    // Optional self-check: what we will actually publish at this call size.
    // The server multiplies it by the streams each participant receives and
    // returns `quality_warning` when the total exceeds the tier above. Never
    // the billing basis — `quality` is.
    publish_resolution: publishResolutionFor(1 + (targetUserIds?.length || 1)),
  });

/*
 * Every call action below identifies the call by `session_id` (from the
 * invite's `sessionId`, or `session.id` of the start / active responses).
 * The API answers 400 when it is missing.
 */

/**
 * Accept an incoming video call. Answers `{ success: true }` — it does not
 * return a token; read your own slot from `getActiveVideoCall()` afterwards.
 * 410 `session_ended` means the call is already over.
 *
 * Also revives a participant who left, so a rejoin calls it too.
 */
export const acceptVideoCall = (roomId: string, userId: string, sessionId: string) =>
  api.post<{ success: boolean }>(`${BASE}/rooms/${roomId}/video-call/accept`, {
    user_id:    userId,
    session_id: sessionId,
  });

/**
 * Decline an incoming video call. `reason` picks the event the room sees:
 * 'missed' → call_missed, 'busy' → call_busy, omitted → call_rejected.
 * Rejecting does not end the session.
 */
export const rejectVideoCall = (roomId: string, userId: string, sessionId: string, reason?: 'missed' | 'busy') =>
  api.post(`${BASE}/rooms/${roomId}/video-call/reject`, {
    user_id:    userId,
    session_id: sessionId,
    ...(reason ? { reason } : {}),
  });

/**
 * End the video call for ALL participants.
 * Only the caller or a room owner / sub_admin can end it (403 otherwise).
 */
export const endVideoCall = (roomId: string, userId: string, sessionId: string) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/end`, { user_id: userId, session_id: sessionId });

/**
 * Leave the call individually. The call goes on while at least two
 * participants are still active; once your leaving drops it below two, the
 * server ends it for everyone (so in a 1:1 call, either side leaving ends
 * it). Invited people who have not accepted do not count as active.
 * (Not to be confused with `leaveRoom()`, which leaves the chat room.)
 */
export const leaveVideoCall = (roomId: string, userId: string, sessionId: string) =>
  api.post(`${BASE}/rooms/${roomId}/video-call/leave`, { user_id: userId, session_id: sessionId });

/**
 * Check if there is an active video call in the room.
 * Answers `{ active: false, session: null }` when there is none.
 */
export const getActiveVideoCall = (roomId: string) =>
  api.get<ActiveVideoCallResponse>(`${BASE}/rooms/${roomId}/video-call/active`);

/**
 * Report that this participant actually joined the video channel. Call it
 * from the video SDK's join-success callback. Idempotent. `matched: false`
 * means the stamp did not land (e.g. the session is no longer live).
 */
export const markJoinedRtc = (roomId: string, userId: string, sessionId: string) =>
  api.post<{ success: boolean; matched: boolean }>(`${BASE}/rooms/${roomId}/video-call/joined-rtc`, {
    user_id:    userId,
    session_id: sessionId,
  });

/**
 * Liveness ping — send once a minute while on the call. Without it the
 * platform cannot tell a long call from an abandoned one. Always answers 200;
 * never surface a failure to the user.
 */
export const sendCallHeartbeat = (roomId: string, userId: string, sessionId: string) =>
  api.post<{ success: boolean }>(`${BASE}/rooms/${roomId}/video-call/heartbeat`, {
    user_id:    userId,
    session_id: sessionId,
  });

/**
 * Mint a fresh video channel token for your own slot. Call tokens expire
 * after one hour — renew when the video SDK reports the token is about to
 * expire, and before re-joining a call after a pause.
 */
export const renewVideoCallToken = (roomId: string, userId: string, sessionId: string) =>
  api.post<RenewVideoCallTokenResponse>(`${BASE}/rooms/${roomId}/video-call/renew-token`, {
    user_id:    userId,
    session_id: sessionId,
  });

// ── Ban / Unban ──────────────────────────────────────────────────────────

/**
 * Ban a user from THIS room and remove them from it (owner / sub_admin
 * only). The owner cannot be banned, and only the owner can ban a sub_admin.
 * `bannedBy` is the acting user. To stop someone reaching you in every room,
 * block them instead (`blockUser`).
 */
export const banUser = (roomId: string, bannedBy: string, userId: string) =>
  api.post(`${BASE}/rooms/${roomId}/ban`, { banned_by: bannedBy, user_id: userId });

/**
 * Lift a ban (owner / sub_admin only). It does not put the user back in the
 * room — they can rejoin (open room) or be added again. `unbannedBy` is the
 * acting user; it travels in the JSON body of the DELETE (required).
 */
export const unbanUser = (roomId: string, unbannedBy: string, userId: string) =>
  api.delete(`${BASE}/rooms/${roomId}/ban/${userId}`, { unbanned_by: unbannedBy });

/**
 * The room's ban history, newest first — lifted bans included
 * (`is_active: false`), so filter on `is_active` for the current bans.
 * Only members of the room can read it.
 */
export const getBans = (roomId: string) =>
  api.get<{
    bans: Array<{
      user_id:     string;
      banned_by:   string;
      banned_at:   string;
      unbanned_by: string | null;
      unbanned_at: string | null;
      is_active:   boolean;
    }>;
  }>(`${BASE}/rooms/${roomId}/bans`);

// ── Sub-Admin ────────────────────────────────────────────────────────────

/** Promote a member to sub_admin (owner only). */
export const addSubAdmin = (roomId: string, ownerId: string, userId: string) =>
  api.post(`${BASE}/rooms/${roomId}/sub-admins`, { owner_id: ownerId, user_id: userId });

/**
 * Demote a sub_admin back to member (owner only). `ownerId` travels in the
 * JSON body of the DELETE (required).
 */
export const removeSubAdmin = (roomId: string, ownerId: string, userId: string) =>
  api.delete(`${BASE}/rooms/${roomId}/sub-admins/${userId}`, { owner_id: ownerId });

export const promoteToSubAdmin = addSubAdmin;
export const demoteSubAdmin    = removeSubAdmin;

// ── Members ──────────────────────────────────────────────────────────────

/** Get all members of a room with their roles. */
export const getMembers = (roomId: string) =>
  api.get<{ members: RoomMember[] }>(`${BASE}/rooms/${roomId}/members`);

// ── Pin ──────────────────────────────────────────────────────────────────

/**
 * Pin a message to the top of the room (one pin per room — pinning replaces
 * it). Who may pin: any member in a 1:1 room; the owner or a sub_admin in
 * group and open rooms (403 otherwise).
 */
export const pinMessage = (roomId: string, messageId: string, userId: string) =>
  api.put(`${BASE}/rooms/${roomId}/pin/${messageId}`, { user_id: userId });

/** Remove the pinned message. Same permission rule as `pinMessage`. */
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
 * It counts against the same per-minute request limit as every other call
 * (sending messages included) — throttle it (one call every few seconds
 * while typing), never once per keystroke.
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

/**
 * Freeze the room (owner / sub_admin) — regular members' sends are refused
 * with 403 `room_frozen`; the owner and sub_admins can still post.
 */
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
