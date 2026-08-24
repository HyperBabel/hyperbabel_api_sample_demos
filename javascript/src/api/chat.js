/**
 * HyperBabel API — low-level Chat service.
 *
 * Used by United Chat rooms for cross-cutting concerns like emoji reactions
 * that target a single message id rather than a room.
 */

import { api } from './client.js';

/**
 * Emoji reactions are ROOM-SCOPED.
 *
 * Use `/unitedchat/rooms/:roomId/messages/:messageId/reactions`, not the
 * `/chat/...` variant. The `/chat` route is server-to-server only and rejects
 * end-user (Session-Token) JWTs — which is exactly what this demo signs in
 * with, so it would fail with 403.
 *
 * The response is the FULL reaction map for that message:
 *   { "reactions": { "👍": ["user_1", "user_2"], "❤️": ["user_3"] } }
 * Store it as-is; do not hand-roll an optimistic array.
 */
export const addReaction = (roomId, messageId, userId, emoji) =>
  api.post(`/unitedchat/rooms/${roomId}/messages/${messageId}/reactions`, { user_id: userId, emoji });

export const removeReaction = (roomId, messageId, userId, emoji) =>
  api.del(`/unitedchat/rooms/${roomId}/messages/${messageId}/reactions`, { user_id: userId, emoji });
