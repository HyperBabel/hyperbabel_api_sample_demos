/**
 * HyperBabel API — Auth & Account Service
 *
 * Fetches API usage statistics and manages webhook configurations.
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

export interface WebhookConfig {
  webhook_id:   string;
  url:          string;
  events:       string[];
  is_active:    boolean;
  created_at:   string;
  secret?:      string;   // Only returned on create/regenerate
}

// ── Usage ─────────────────────────────────────────────────────────────────

/**
 * Get API usage statistics for the current billing period.
 */
export const getUsage = () =>
  api.get<UsageStats>(`${BASE}/usage`);

// ── Webhooks ──────────────────────────────────────────────────────────────

/**
 * List all registered webhooks for the organisation.
 */
export const listWebhooks = () =>
  api.get<{ webhooks: WebhookConfig[] }>(`${BASE}/webhooks`);

/**
 * Register a new webhook endpoint.
 */
export const createWebhook = (url: string, events: string[]) =>
  api.post<WebhookConfig>(`${BASE}/webhooks`, { url, events });

/**
 * Update an existing webhook's URL or event subscriptions.
 */
export const updateWebhook = (webhookId: string, data: { url?: string; events?: string[]; is_active?: boolean }) =>
  api.put(`${BASE}/webhooks/${webhookId}`, data);

/**
 * Delete a webhook endpoint.
 */
export const deleteWebhook = (webhookId: string) =>
  api.delete(`${BASE}/webhooks/${webhookId}`);

/**
 * Regenerate the signing secret for a webhook (one-time display).
 */
export const regenerateSecret = (webhookId: string) =>
  api.post<{ secret: string }>(`${BASE}/webhooks/${webhookId}/regenerate-secret`);

/**
 * Get delivery logs for a webhook (recent attempts).
 */
export const getWebhookLogs = (webhookId: string) =>
  api.get<{ logs: Array<{ event: string; status: number; delivered_at: string }> }>(
    `${BASE}/webhooks/${webhookId}/logs`,
  );
