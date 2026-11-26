/**
 * HyperBabel API — the signed-in user's own profile, and the user-level
 * block list.
 *
 * Blocks are scoped per (blocker, blocked) pair and apply across every room.
 */

import { api } from './client.js';

/**
 * Update the signed-in user's own profile — the name other members see.
 * `fields` is a partial profile, e.g. `{ display_name: 'Alice' }`
 * (`display_name`: 1–60 characters). Returns the updated profile.
 */
export const updateMyProfile = (fields) =>
  api.patch('/customer/users/me', fields);

export const blockUser = (blockerId, blockedId) =>
  api.post('/users/block', { blocker_id: blockerId, blocked_id: blockedId });

export const unblockUser = (blockerId, blockedId) =>
  api.del('/users/block', { blocker_id: blockerId, blocked_id: blockedId });

export const getBlockList = (userId) =>
  api.get(`/users/${userId}/blocks`);
