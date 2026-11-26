/**
 * HyperBabel API — Live Stream service.
 *
 * Hosts open a session, broadcast as publisher, and end it. Viewers exchange
 * a viewer token to subscribe to the same channel.
 *
 * ⚠️ EVERY CALL HERE NEEDS YOUR BACKEND — IT CANNOT RUN FROM THE BROWSER.
 *
 *   `/stream/*` authenticates with your ORGANIZATION API KEY
 *   (`Authorization: Bearer hb_live_…`). Anything else is rejected up front:
 *
 *       POST /api/v1/stream/sessions
 *       -> 401 { "error": { "code": "invalid_api_key_format" } }
 *
 *   Creating a broadcast allocates paid capacity and is metered against your
 *   organization, so the caller has to be YOU, not a signed-in end user. This
 *   demo only ever holds a customer JWT (the API client refuses to put an org
 *   key in a browser bundle), so these calls fail here by design.
 *
 *   Ship it as:  browser -> your backend (holds hb_live_…) -> HyperBabel /stream/*
 *   The paths, payloads, response shapes and call order below are accurate —
 *   implement them on your server and expose a thin endpoint the browser can
 *   call.
 */

import { api } from './client.js';
import { declaredQuality, publishResolutionFor } from '../video/videoQuality.js';

/**
 * Live sessions (default `status=live`).
 * Response: `{ sessions: [{ id, title, status, host: { user_id, display_name },
 *   viewer_count, started_at, created_at }], total }`.
 */
export const listSessions = () => api.get('/stream/sessions');

/**
 * Create a broadcast. Response (201), wrapped in `session`:
 *   { session: { id, channel_name, rtm_channel, title, status,
 *                host: { user_id, display_name, profile_image_url,
 *                        preferred_lang_cd, uid, rtc_token },
 *                app_id, quality, quality_warning? } }
 * The host publishes with `session.host.rtc_token` and `session.host.uid`
 * (a 24-hour publisher token). Every later call takes `session.id`.
 */
export const createSession = ({ hostUserId, hostName, title }) =>
  api.post('/stream/sessions', {
    // Wire shape per the HyperBabel Stream API (POST /stream/sessions):
    // flat { title, host_user_id, host_display_name? }. `title` is required
    // (min length 1).
    title: title || `Live from ${hostName || hostUserId}`,
    host_user_id: hostUserId,
    ...(hostName ? { host_display_name: hostName } : {}),
    // Billing tier for this broadcast. Derived from the publishing preset in
    // video/videoQuality.js so the declared tier always matches the pixels
    // actually sent — see that file before changing either one.
    quality: declaredQuality(),
    // Optional self-check. A viewer subscribes to the host stream only, so the
    // aggregate for a broadcast is this resolution itself — pass 1.
    publish_resolution: publishResolutionFor(1),
  });

// Marks the session live once the host has joined. No body.
export const startSession = (sessionId) =>
  api.post(`/stream/sessions/${sessionId}/start`);

// Heartbeat — POST every ~30s while broadcasting so the server can detect
// a host crash within minutes (rather than 8h wall-clock) and bill only
// the actual stream time.
export const heartbeat = (sessionId) =>
  api.post(`/stream/sessions/${sessionId}/heartbeat`);

// Ends the broadcast. No body.
export const endSession = (sessionId) =>
  api.post(`/stream/sessions/${sessionId}/end`);

/**
 * A viewer's subscriber token. The response is FLAT (not wrapped):
 *   { channel_name, uid, token, app_id, title, display_name,
 *     profile_image_url, preferred_lang_cd, host_user_id, host_display_name }
 * Join with `token` + `uid` as audience. It cannot publish — a host never
 * uses it.
 */
export const viewerToken = (sessionId, userId) =>
  api.post(`/stream/sessions/${sessionId}/viewer-token`, { user_id: userId });
