/**
 * HyperBabel API — Auth & Webhook Service
 *
 * Covers developer-facing Auth endpoints exposed in the /docs Swagger:
 *  • GET  /auth/usage              — Monthly API usage summary
 *  • POST /auth/webhooks           — Register webhook endpoint
 *  • GET  /auth/webhooks           — List webhook endpoints
 *  • GET  /auth/webhooks/logs      — Webhook delivery logs
 *  • PATCH  /auth/webhooks/:id     — Update a webhook
 *  • DELETE /auth/webhooks/:id     — Delete a webhook
 *  • POST /auth/webhooks/:id/regenerate-secret — Regenerate signing secret
 */

import api from './api';

// ── Usage ────────────────────────────────────────────────────────────────

/**
 * Fetch current month's API usage breakdown by service.
 * Useful for programmatic monitoring or billing alert automation.
 *
 * @returns {Promise<{ period: string, plan: string, usage: object }>}
 */
export const getUsage = () => api.get('/auth/usage');

// ── Webhooks ─────────────────────────────────────────────────────────────

/**
 * Register a new webhook endpoint to receive real-time event notifications.
 * The `secret` in the response is shown only once — persist it immediately.
 *
 * @param {object} data
 * @param {string} data.url         — HTTPS endpoint URL
 * @param {string[]} data.events    — Events to subscribe (e.g. 'video.session.started')
 * @param {string} [data.description]
 * @returns {Promise<object>}       — Includes one-time `secret`
 */
export const createWebhook = (data) => api.post('/auth/webhooks', data);

/**
 * List all registered webhook endpoints (secrets are hidden).
 * @returns {Promise<object[]>}
 */
export const listWebhooks = () => api.get('/auth/webhooks');

/**
 * View paginated webhook delivery logs.
 *
 * @param {{ page?: number, limit?: number }} [params]
 * @returns {Promise<object>}
 */
export const getWebhookLogs = (params) => api.get('/auth/webhooks/logs', params);

/**
 * Update an existing webhook endpoint.
 *
 * @param {string} id
 * @param {object} data — { url?, events?, is_active?, description? }
 * @returns {Promise<object>}
 */
export const updateWebhook = (id, data) => api.patch(`/auth/webhooks/${id}`, data);

/**
 * Delete a webhook endpoint.
 * @param {string} id
 */
export const deleteWebhook = (id) => api.delete(`/auth/webhooks/${id}`);

/**
 * Regenerate the HMAC signing secret for a webhook.
 * The new secret is returned only once.
 *
 * @param {string} id
 * @returns {Promise<{ secret: string }>}
 */
export const regenerateWebhookSecret = (id) =>
  api.post(`/auth/webhooks/${id}/regenerate-secret`);
