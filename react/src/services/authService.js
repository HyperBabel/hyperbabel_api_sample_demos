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
 * Fetch the organization's usage for the current calendar month, together
 * with its plan allowances.
 *
 * The response is ONE flat object (404 when the organization has no active
 * subscription):
 *  - usage counters:  messages_sent, translate_chars, hd_video_mins,
 *    fhd_video_mins, hd_stream_mins, fhd_stream_mins, stt_mins,
 *    storage_used_mb, connection_mins, api_calls
 *  - plan allowances: monthly_messages, monthly_translate_chars,
 *    monthly_hd_video_mins, … (-1 means unlimited), max_channels, …
 *  - plan_name, current_period_end
 *
 * ⚠️ 64-bit counters (messages_sent, translate_chars, stt_mins, storage_used_mb,
 * connection_mins, api_calls, monthly_messages, monthly_translate_chars,
 * monthly_stt_mins, monthly_connection_mins) arrive as JSON STRINGS, e.g.
 * "1234" or "-1". Convert with Number() before comparing or doing math —
 * `limit === -1` is false for "-1". summarizeUsage() below does that.
 *
 * @returns {Promise<object>}
 */
export const getUsage = () => api.get('/auth/usage');

/** Numeric value of a usage field that may arrive as a number or a string. */
const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Plan allowance: null = unlimited (-1). */
const toLimit = (value) => {
  const n = toNumber(value);
  return n === -1 ? null : n;
};

/**
 * Turn the GET /auth/usage response into display rows.
 *
 * @param {object} usage — Response of getUsage()
 * @returns {{ plan: string, periodEnd: string|null,
 *             items: Array<{ key: string, label: string, used: number, limit: number|null }> }}
 *   `limit` is null when the plan allowance is unlimited.
 */
export const summarizeUsage = (usage) => ({
  plan:      usage?.plan_name || 'Unknown',
  periodEnd: usage?.current_period_end || null,
  items: [
    {
      key: 'messages', label: 'Messages',
      used:  toNumber(usage?.messages_sent),
      limit: toLimit(usage?.monthly_messages),
    },
    {
      key: 'translate', label: 'Translated characters',
      used:  toNumber(usage?.translate_chars),
      limit: toLimit(usage?.monthly_translate_chars),
    },
    {
      key: 'hd_video', label: 'HD video call minutes',
      used:  toNumber(usage?.hd_video_mins),
      limit: toLimit(usage?.monthly_hd_video_mins),
    },
    {
      key: 'fhd_video', label: 'Full HD video call minutes',
      used:  toNumber(usage?.fhd_video_mins),
      limit: toLimit(usage?.monthly_fhd_video_mins),
    },
    {
      key: 'hd_stream', label: 'HD live stream minutes',
      used:  toNumber(usage?.hd_stream_mins),
      limit: toLimit(usage?.monthly_hd_stream_mins),
    },
    {
      key: 'fhd_stream', label: 'Full HD live stream minutes',
      used:  toNumber(usage?.fhd_stream_mins),
      limit: toLimit(usage?.monthly_fhd_stream_mins),
    },
    {
      key: 'stt', label: 'Live caption minutes',
      used:  toNumber(usage?.stt_mins),
      limit: toLimit(usage?.monthly_stt_mins),
    },
  ],
});
