/**
 * HyperBabel API — low-level Chat service.
 *
 * Used by United Chat rooms for cross-cutting concerns like emoji reactions
 * that target a single message id rather than a room.
 */

import { api } from './client.js';

export const addReaction = (messageId, userId, emoji) =>
  api.post(`/chat/messages/${messageId}/reactions`, { user_id: userId, emoji });

export const removeReaction = (messageId, userId, emoji) =>
  api.del(`/chat/messages/${messageId}/reactions`, { user_id: userId, emoji });
