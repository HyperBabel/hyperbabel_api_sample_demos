/**
 * HyperBabel Real-Time client.
 *
 * Thin wrapper around the underlying real-time SDK. The vendor package is
 * imported under the neutral `realtimeSdk` alias and never referenced by
 * its raw name elsewhere in this module — that way customer-facing demo
 * code talks about HyperBabel concepts only.
 */

import * as realtimeSdk from 'ably';
import { requestRealtimeToken } from '../api/rtm.js';

let _client = null;
let _orgId  = null;
/** The connect() in flight, shared so concurrent callers get ONE client. */
let _connecting = null;
/** Bumped by disconnect(), so a connect() still in flight for the old user is dropped. */
let _generation = 0;

async function authCallback(_tokenParams, callback) {
  try {
    const user = JSON.parse(localStorage.getItem('hb_user') || '{}');
    const res = await requestRealtimeToken(
      user.user_id,
      user.display_name,
      user.preferred_lang_cd,
    );
    if (res?.org_id) _orgId = res.org_id;
    /*
     * Hand the SDK the signed token request ITSELF, not the envelope it
     * arrived in. The endpoint answers
     *   { realtime_token_request: {...}, user_id, org_id }
     * and the SDK validates the signature over the inner object — passing the
     * whole envelope fails auth.
     */
    callback(null, res.realtime_token_request);
  } catch (err) {
    callback(err.message || 'token_request_failed', null);
  }
}

/**
 * Open (or reuse) the connection for the signed-in user. One connection per
 * sign-in: call `disconnect()` on sign-out, or the next user in this tab
 * would reuse the previous user's connection.
 */
export function connect(user) {
  if (_client) return Promise.resolve(_client);
  if (_connecting) return _connecting;
  const generation = _generation;
  const attempt = (async () => {
    // Pre-fetch the first token so we know orgId before opening the connection.
    const initial = await requestRealtimeToken(
      user.user_id,
      user.display_name,
      user.preferred_lang_cd,
    );
    if (generation !== _generation) throw new Error('Signed out while connecting');
    _orgId = initial.org_id;
    const compositeClientId = _orgId ? `${_orgId}:${user.user_id}` : user.user_id;
    const client = new realtimeSdk.Realtime({
      authCallback,
      clientId: compositeClientId,
      echoMessages: false,
    });
    _client = client;
    await client.connection.once('connected');
    return client;
  })();
  _connecting = attempt;
  const settle = () => { if (_connecting === attempt) _connecting = null; };
  attempt.then(settle, settle);
  return attempt;
}

/**
 * Subscribe to a room's real-time events.
 *
 * @param {string} realtimeChannel The room's `realtime_channel` value from the
 *   REST API, passed through VERBATIM. It CANNOT be rebuilt from a room id —
 *   the server derives the name from values this client does not have, so a
 *   reconstructed name subscribes to a channel nobody publishes on and the
 *   failure is silent.
 *
 * Typing indicators arrive on this same channel as a `{ type: 'typing' }`
 * payload; there is no separate typing channel.
 */
export function subscribeRoom(realtimeChannel, onMessage) {
  if (!_client) throw new Error('Real-Time client not connected');
  if (!realtimeChannel) throw new Error('realtimeChannel is required');
  const channel = _client.channels.get(realtimeChannel);
  const listener = (msg) => {
    if (msg.data) onMessage({ message: msg.data, type: msg.name });
  };
  channel.subscribe(listener);
  return () => channel.unsubscribe(listener);
}

/**
 * Subscribe to the current user's per-user inbox (call invites, gifts, …).
 * Channel: `user:{orgId}:{userId}` — must match the server exactly. `_orgId`
 * is the `org_id` from the token endpoint, used as-is (no transformation).
 */
export function subscribePrivate(userId, onEvent) {
  if (!_client || !_orgId) throw new Error('Real-Time client not connected');
  const channelName = `user:${_orgId}:${userId}`;
  const channel = _client.channels.get(channelName);
  const listener = (msg) => onEvent({ event: msg.name, data: msg.data });
  channel.subscribe(listener);
  return () => channel.unsubscribe(listener);
}

/** Close the connection — call on sign-out. Every subscription ends with it. */
export async function disconnect() {
  _generation += 1;
  _connecting = null;
  if (_client) {
    _client.close();
    _client = null;
  }
  _orgId = null;
}
