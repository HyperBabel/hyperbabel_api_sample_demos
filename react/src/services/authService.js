/**
 * HyperBabel API — Auth Service
 *
 * Covers the developer-facing Auth endpoints exposed in the /docs Swagger:
 *  • GET /auth/usage — Monthly API usage summary
 *
 * Webhook CRUD (POST/GET/PATCH/DELETE /auth/webhooks*) is a tenant-admin
 * operation and is intentionally not surfaced here. Manage webhooks in the
 * HyperBabel Console at https://console.hyperbabel.com.
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
