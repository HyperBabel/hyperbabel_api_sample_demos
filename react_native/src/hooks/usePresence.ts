/**
 * HyperBabel Demo — usePresence Hook
 *
 * Manages online presence for the current user:
 *  - Sends a heartbeat every 30 seconds on mount
 *  - Cancels the interval on logout / unmount
 *  - Provides a helper to bulk-query presence for a list of user IDs
 *
 * Mount in a persistent layout (e.g., (main)/_layout.tsx) so heartbeats
 * continue regardless of which tab is active.
 */

import { useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import * as presenceService from '@/services/presenceService';
import type { PresenceEntry, PresenceStatus } from '@/services/presenceService';

const HEARTBEAT_INTERVAL_MS = 30_000;

export function usePresence() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Send initial heartbeat on login
    presenceService.heartbeat(user.userId).catch(() => {});

    // Periodic heartbeat
    const interval = setInterval(() => {
      presenceService.heartbeat(user.userId).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    // Pause when app goes background, resume on foreground
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        presenceService.heartbeat(user.userId).catch(() => {});
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      clearInterval(interval);
      sub.remove();
      // Set offline on unmount/logout
      presenceService.setStatus(user.userId, 'offline').catch(() => {});
    };
  }, [user]);

  /**
   * Bulk-query presence for a list of user IDs.
   * Returns a map of userId → PresenceEntry.
   */
  const getPresenceMap = useCallback(
    async (userIds: string[]): Promise<Record<string, PresenceEntry>> => {
      if (userIds.length === 0) return {};
      try {
        const { presence } = await presenceService.getPresence(userIds);
        return Object.fromEntries(presence.map((p) => [p.user_id, p]));
      } catch {
        return {};
      }
    },
    [],
  );

  return { getPresenceMap };
}
