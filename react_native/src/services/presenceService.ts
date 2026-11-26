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
 * Send a heartbeat to keep the user present. Call every 30 seconds.
 * It turns 'offline' back into 'online' but keeps a status the user chose
 * ('away' / 'dnd'); the response `status` is the stored status.
 */
export const heartbeat = (userId: string) =>
  api.post<{ success: boolean; status: PresenceStatus }>(`${BASE}/heartbeat`, { user_id: userId });

/**
 * Explicitly set the user's presence status.
 */
export const setStatus = (userId: string, status: PresenceStatus) =>
  api.post(`${BASE}/status`, { user_id: userId, status });

/**
 * Get presence status for up to 100 users at once.
 *
 * Wire shape: `GET /presence?user_ids=<comma-separated>` (no `/presence/bulk`).
 */
export const getPresence = (userIds: string[]) =>
  api.get<{ presence: PresenceEntry[]; offline_threshold_seconds?: number }>(
    `${BASE}?user_ids=${userIds.map(encodeURIComponent).join(',')}`,
  );
