/**
 * HyperBabel API — Auth & Account Service
 *
 * Fetches API usage statistics for the current billing period.
 *
 * Webhook CRUD (POST/GET/PATCH/DELETE /auth/webhooks*) is a tenant-admin
 * operation and is intentionally not surfaced here. Manage webhooks in the
 * HyperBabel Console at https://console.hyperbabel.com.
 *
 * Base path: /auth
 */

import api from './api';

const BASE = '/auth';

// ── Types ─────────────────────────────────────────────────────────────────

export interface UsageStats {
  period_start:          string;
  period_end:            string;
  chat_messages_sent:    number;
  video_minutes:         number;
  stream_minutes:        number;
  translations:          number;
  storage_bytes:         number;
  plan_limits?: {
    chat_messages:  number;
    video_minutes:  number;
    stream_minutes: number;
    translations:   number;
    storage_bytes:  number;
  };
}

// ── Usage ─────────────────────────────────────────────────────────────────

/**
 * Get API usage statistics for the current billing period.
 */
export const getUsage = () =>
  api.get<UsageStats>(`${BASE}/usage`);
