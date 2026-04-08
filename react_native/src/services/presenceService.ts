/**
 * HyperBabel API — Presence Service
 *
 * Track user online/offline status across the platform.
 * Call heartbeat() every 30 seconds to maintain the "online" presence status.
 *
 * Base path: /presence
 */

import api from './api';

const BASE = '/presence';

export type PresenceStatus = 'online' | 'away' | 'dnd' | 'offline';

export interface PresenceEntry {
  user_id:    string;
  status:     PresenceStatus;
  last_seen?: string;
}

/**
 * Send a heartbeat to mark the user as online.
 * Call every 30 seconds to keep the status active.
 */
export const heartbeat = (userId: string) =>
  api.post<{ status: 'ok' }>(`${BASE}/heartbeat`, { user_id: userId });

/**
 * Explicitly set the user's presence status.
 */
export const setStatus = (userId: string, status: PresenceStatus) =>
  api.post(`${BASE}/status`, { user_id: userId, status });

/**
 * Get presence status for up to 100 users at once.
 * Returns an entry for each user ID queried.
 */
export const getPresence = (userIds: string[]) =>
  api.post<{ presence: PresenceEntry[] }>(`${BASE}/bulk`, { user_ids: userIds });
