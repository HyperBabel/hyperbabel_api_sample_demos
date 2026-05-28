/**
 * HyperBabel API — Live Stream service.
 *
 * Hosts open a session, broadcast as publisher, and end it. Viewers exchange
 * a viewer token to subscribe to the same channel.
 */

import { api } from './client.js';

export const listSessions = () => api.get('/stream/sessions');

export const createSession = ({ hostUserId, hostName, title }) =>
  api.post('/stream/sessions', {
    // Wire shape per cf_workers_api/src/routes/stream.ts createStreamSchema:
    // flat { title, host_user_id, host_display_name? }. `title` is required
    // (min length 1).
    title: title || `Live from ${hostName || hostUserId}`,
    host_user_id: hostUserId,
    ...(hostName ? { host_display_name: hostName } : {}),
  });

export const startSession = (sessionId, hostUserId) =>
  api.post(`/stream/sessions/${sessionId}/start`, { user_id: hostUserId });

// Heartbeat — POST every ~30s while broadcasting so the server can detect
// a host crash within minutes (rather than 8h wall-clock) and bill only
// the actual stream time.
export const heartbeat = (sessionId) =>
  api.post(`/stream/sessions/${sessionId}/heartbeat`);

export const endSession = (sessionId, hostUserId) =>
  api.post(`/stream/sessions/${sessionId}/end`, { user_id: hostUserId });

export const viewerToken = (sessionId, userId) =>
  api.post(`/stream/sessions/${sessionId}/viewer-token`, { user_id: userId });
