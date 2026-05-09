/**
 * HyperBabel API — push notification token management.
 *
 * Web demos register a synthetic token (or skip registration entirely);
 * native apps swap the synthetic token for the real FCM / APNs token from
 * their platform SDK.
 */

import { api } from './client.js';

export const registerToken = (userId, token, platform = 'web') =>
  api.post('/push/register', { user_id: userId, token, platform });

export const unregisterToken = (userId, token) =>
  api.del('/push/unregister', { user_id: userId, token });

export const getTokens = (userId) =>
  api.get('/push/tokens', { user_id: userId });
