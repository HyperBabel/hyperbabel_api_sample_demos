/**
 * HyperBabel API — Auth & Account Service
 *
 * Fetches API usage statistics for the current month, next to the plan's
 * monthly allowances.
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

/**
 * A count from GET /auth/usage. Large counters are 64-bit in the database
 * and arrive as JSON STRINGS ("1234", and "-1" for unlimited); the rest are
 * numbers. Always read one through `usageNumber()` before comparing or doing
 * arithmetic — a strict `=== -1` misses "-1".
 */
export type UsageCount = number | string;

/**
 * GET /auth/usage — this month's usage next to the plan's monthly allowance,
 * as one flat object. Allowances (`monthly_*`) of -1 mean unlimited.
 * Video and stream minutes are metered per resolution tier; this demo
 * declares HD (see services/videoQuality.ts), so the HD counters apply.
 */
export interface UsageStats {
  plan_name?:          string;
  current_period_end?: string | null;

  // Used this month
  messages_sent:    UsageCount;
  translate_chars:  UsageCount;
  hd_video_mins:    UsageCount;
  fhd_video_mins:   UsageCount;
  hd_stream_mins:   UsageCount;
  fhd_stream_mins:  UsageCount;
  storage_used_mb:  UsageCount;

  // Plan allowance per month (-1 = unlimited)
  monthly_messages:        UsageCount;
  monthly_translate_chars: UsageCount;
  monthly_hd_video_mins:   UsageCount;
  monthly_fhd_video_mins:  UsageCount;
  monthly_hd_stream_mins:  UsageCount;
  monthly_fhd_stream_mins: UsageCount;
  monthly_storage_mb:      UsageCount;
}

/** Read a usage count as a number (missing or malformed → 0). */
export const usageNumber = (value: UsageCount | null | undefined): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * A plan allowance as a number, or `undefined` when there is no positive cap
 * to draw a bar against (-1 / "-1" means unlimited).
 */
export const usageLimit = (value: UsageCount | null | undefined): number | undefined => {
  const n = usageNumber(value);
  return n > 0 ? n : undefined;
};

// ── Usage ─────────────────────────────────────────────────────────────────

/**
 * Get API usage statistics for the current month.
 */
export const getUsage = () =>
  api.get<UsageStats>(`${BASE}/usage`);
