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

export const sendReply = (roomId, { senderId, senderName, content, replyTo }) =>
  api.post(`/unitedchat/rooms/${roomId}/messages`, {
    sender_id: senderId,
    sender_name: senderName,
    content,
    message_type: 'text',
    metadata: { reply_to: replyTo },
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

export const batchTranslateMessages = (roomId, messageIds, targetLangCd) =>
  api.post(`/unitedchat/rooms/${roomId}/messages/batch-translate`, {
    message_ids: messageIds,
    target_lang_cd: targetLangCd,
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

export const acceptVideoCall = (roomId, userId) =>
  api.post(`/unitedchat/rooms/${roomId}/video-call/accept`, { user_id: userId });

export const rejectVideoCall = (roomId, userId) =>
  api.post(`/unitedchat/rooms/${roomId}/video-call/reject`, { user_id: userId });

export const endVideoCall = (roomId, userId) =>
  api.post(`/unitedchat/rooms/${roomId}/video-call/end`, { user_id: userId });

export const leaveVideoCall = (roomId, userId) =>
  api.post(`/unitedchat/rooms/${roomId}/video-call/leave`, { user_id: userId });

export const getActiveVideoCall = (roomId) =>
  api.get(`/unitedchat/rooms/${roomId}/video-call/active`);

// ── Moderation: ban / sub-admin / freeze ─────────────────────────────────

export const banUser = (roomId, adminId, userId) =>
  api.post(`/unitedchat/rooms/${roomId}/ban`, { admin_id: adminId, user_id: userId });

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
