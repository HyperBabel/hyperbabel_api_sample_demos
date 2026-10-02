/**
 * HyperBabel API — United Chat service.
 *
 * Covers the room, message, member, moderation, mute, and video-call lifecycle
 * endpoints used by this demo. The full surface is documented at
 * https://hyperbabel.com/docs.
 */

import { api } from './client.js';
import { declaredQuality, publishResolutionFor } from '../video/videoQuality.js';

// ── Rooms ─────────────────────────────────────────────────────────────────

export const listRooms = (userId) =>
  api.get('/unitedchat/rooms', { user_id: userId });

export const createRoom = (data) =>
  api.post('/unitedchat/rooms', data);

export const getRoom = (roomId, userId) =>
  api.get(`/unitedchat/rooms/${roomId}`, { user_id: userId });

export const leaveRoom = (roomId, userId) =>
  api.post(`/unitedchat/rooms/${roomId}/leave`, { user_id: userId });

export const joinByCode = (inviteCode, userId) =>
  api.post('/unitedchat/rooms/join-by-code', { invite_code: inviteCode, user_id: userId });

export const getMembers = (roomId) =>
  api.get(`/unitedchat/rooms/${roomId}/members`);

// ── Messages ──────────────────────────────────────────────────────────────

export const sendMessage = (roomId, payload) =>
  api.post(`/unitedchat/rooms/${roomId}/messages`, payload);

// `reply_to` is a top-level field: the id of the message being answered. Every
// read returns it as `message.reply_to`, and GET …/messages also returns the
// quoted originals in `reply_snapshots` (keyed by id).
export const sendReply = (roomId, { senderId, senderName, content, replyTo }) =>
  api.post(`/unitedchat/rooms/${roomId}/messages`, {
    sender_id: senderId,
    sender_name: senderName,
    content,
    message_type: 'text',
    reply_to: replyTo,
  });

export const getMessages = (roomId, query = {}) =>
  api.get(`/unitedchat/rooms/${roomId}/messages`, query);

export const editMessage = (roomId, messageId, userId, content) =>
  api.put(`/unitedchat/rooms/${roomId}/messages/${messageId}`, {
    user_id: userId,
    content,
  });

export const deleteMessage = (roomId, messageId, userId) =>
  api.del(`/unitedchat/rooms/${roomId}/messages/${messageId}`, { user_id: userId });

export const markRead = (roomId, userId) =>
  api.post(`/unitedchat/rooms/${roomId}/read`, { user_id: userId });

export const sendTypingIndicator = (roomId, userId, displayName) =>
  api.post(`/unitedchat/rooms/${roomId}/typing`, {
    user_id: userId,
    display_name: displayName,
  });

/**
 * Translate chat messages for the signed-in user. Unlike `/translate/*`, this
 * works with the end-user token. Up to 100 ids per call.
 *
 * Response: `{ translations: { [messageId]: text } }`, plus `limited: true`
 * when new translations were skipped because the daily limit was reached.
 * Ids that are missing from the map had nothing to translate (media, or
 * already in `targetLang`).
 */
export const batchTranslateMessages = (roomId, messageIds, targetLang) =>
  api.post(`/unitedchat/rooms/${roomId}/messages/batch-translate`, {
    message_ids: messageIds,
    target_lang: targetLang,
  });

// ── Video call ────────────────────────────────────────────────────────────

export const startVideoCall = (roomId, callerId, targets) =>
  api.post(`/unitedchat/rooms/${roomId}/video-call`, {
    caller_id: callerId,
    // Billing tier for this call. Derived from the publishing preset in
    // video/videoQuality.js so the declared tier always matches the pixels
    // actually sent — change both in that file, never just one.
    quality: declaredQuality(),
    // Optional self-check: what we will actually publish at this call size.
    // The server multiplies it by the streams each participant receives and
    // returns `quality_warning` if the total exceeds the tier above. Not the
    // billing basis — `quality` is.
    publish_resolution: publishResolutionFor(1 + (targets ? targets.length : 1)),
    ...(targets && targets.length ? { target_user_ids: targets } : {}),
  });

// Every call action below targets ONE call session and answers 400 without
// its id: `session.id` from the start response or from GET …/video-call/active,
// or `sessionId` from an incoming CALL_INVITE.

export const acceptVideoCall = (roomId, userId, sessionId) =>
  api.post(`/unitedchat/rooms/${roomId}/video-call/accept`, { user_id: userId, session_id: sessionId });

// `reason` is optional: 'missed' (rang out) or 'busy' post "Missed call" /
// "Busy" to the room instead of "Call declined".
export const rejectVideoCall = (roomId, userId, sessionId, reason) =>
  api.post(`/unitedchat/rooms/${roomId}/video-call/reject`, {
    user_id: userId,
    session_id: sessionId,
    ...(reason ? { reason } : {}),
  });

// Ends the call for everyone. Only the caller, the room owner or a sub-admin
// may do this — everyone else uses leaveVideoCall.
export const endVideoCall = (roomId, userId, sessionId) =>
  api.post(`/unitedchat/rooms/${roomId}/video-call/end`, { user_id: userId, session_id: sessionId });

// Leaves the CALL; the server ends it once one or no participant is left.
// Not the same as leaveRoom, which leaves the chat room itself.
export const leaveVideoCall = (roomId, userId, sessionId) =>
  api.post(`/unitedchat/rooms/${roomId}/video-call/leave`, { user_id: userId, session_id: sessionId });

// Call once you are actually in the media channel — call billing is measured
// from this moment. `{ success: false }` means the stamp did not land; retry.
export const markJoinedRtc = (roomId, userId, sessionId) =>
  api.post(`/unitedchat/rooms/${roomId}/video-call/joined-rtc`, { user_id: userId, session_id: sessionId });

// Liveness ping, once a minute while the call screen is open. Without it the
// server cannot tell a long call from one both apps abandoned.
export const sendCallHeartbeat = (roomId, userId, sessionId) =>
  api.post(`/unitedchat/rooms/${roomId}/video-call/heartbeat`, { user_id: userId, session_id: sessionId });

// A fresh RTC token (valid 1 hour) for the same channel and uid.
// Response: `{ session_id, channel_name, uid, rtc_token, app_id, expires_in }`.
export const renewVideoCallToken = (roomId, userId, sessionId) =>
  api.post(`/unitedchat/rooms/${roomId}/video-call/renew-token`, { user_id: userId, session_id: sessionId });

export const getActiveVideoCall = (roomId) =>
  api.get(`/unitedchat/rooms/${roomId}/video-call/active`);

// ── Moderation: ban / sub-admin / freeze ─────────────────────────────────

export const banUser = (roomId, adminId, userId) =>
  api.post(`/unitedchat/rooms/${roomId}/ban`, { banned_by: adminId, user_id: userId });

export const unbanUser = (roomId, userId, unbannedBy) =>
  api.del(`/unitedchat/rooms/${roomId}/ban/${userId}`, { unbanned_by: unbannedBy });

export const addSubAdmin = (roomId, ownerId, userId) =>
  api.post(`/unitedchat/rooms/${roomId}/sub-admins`, { owner_id: ownerId, user_id: userId });

export const removeSubAdmin = (roomId, userId, ownerId) =>
  api.del(`/unitedchat/rooms/${roomId}/sub-admins/${userId}`, { owner_id: ownerId });

export const freezeRoom = (roomId, userId) =>
  api.post(`/unitedchat/rooms/${roomId}/freeze`, { user_id: userId });

export const unfreezeRoom = (roomId, userId) =>
  api.del(`/unitedchat/rooms/${roomId}/freeze`, { user_id: userId });

// ── Mute ─────────────────────────────────────────────────────────────────

export const muteRoom = (roomId, userId, durationMinutes) =>
  api.post(`/unitedchat/rooms/${roomId}/mute`, {
    user_id: userId,
    ...(durationMinutes ? { duration_minutes: durationMinutes } : {}),
  });

export const unmuteRoom = (roomId, userId) =>
  api.del(`/unitedchat/rooms/${roomId}/mute`, { user_id: userId });

export const getMuteStatus = (roomId, userId) =>
  api.get(`/unitedchat/rooms/${roomId}/mute/${userId}`);
