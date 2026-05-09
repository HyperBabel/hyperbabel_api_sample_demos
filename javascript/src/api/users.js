/**
 * HyperBabel API — user-level block list.
 *
 * Blocks are scoped per (blocker, blocked) pair and apply across every room.
 */

import { api } from './client.js';

export const blockUser = (blockerId, blockedId) =>
  api.post('/users/block', { blocker_id: blockerId, blocked_id: blockedId });

export const unblockUser = (blockerId, blockedId) =>
  api.del('/users/block', { blocker_id: blockerId, blocked_id: blockedId });

export const getBlockList = (userId) =>
  api.get(`/users/${userId}/blocks`);
