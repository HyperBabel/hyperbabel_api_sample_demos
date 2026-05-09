/**
 * HyperBabel API — Presence service.
 */

import { api } from './client.js';

export const sendHeartbeat = (userId) =>
  api.post('/presence/heartbeat', { user_id: userId });

export const setStatus = (userId, status) =>
  api.post('/presence/status', { user_id: userId, status });

export const getPresence = (userIds) =>
  api.get('/presence', { user_ids: userIds.join(',') });
