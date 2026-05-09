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

async function authCallback(_tokenParams, callback) {
  try {
    const user = JSON.parse(localStorage.getItem('hb_user') || '{}');
    const tokenRequest = await requestRealtimeToken(
      user.user_id,
      user.display_name,
      user.preferred_lang_cd,
    );
    if (tokenRequest?.org_id) _orgId = tokenRequest.org_id;
    callback(null, tokenRequest);
  } catch (err) {
    callback(err.message || 'token_request_failed', null);
  }
}

export async function connect(user) {
  if (_client) return _client;
  // Pre-fetch the first token so we know orgId before opening the connection.
  const initial = await requestRealtimeToken(
    user.user_id,
    user.display_name,
    user.preferred_lang_cd,
  );
  _orgId = initial.org_id;
  const compositeClientId = _orgId ? `${_orgId}:${user.user_id}` : user.user_id;
  _client = new realtimeSdk.Realtime({
    authCallback,
    clientId: compositeClientId,
    echoMessages: false,
  });
  await _client.connection.once('connected');
  return _client;
}

export function subscribeRoom(roomId, onMessage) {
  if (!_client || !_orgId) throw new Error('Real-Time client not connected');
  const channelName = `hb:${_orgId}:room:${roomId}`;
  const channel = _client.channels.get(channelName);
  const listener = (msg) => {
    if (msg.data) onMessage({ message: msg.data, type: msg.name });
  };
  channel.subscribe(listener);
  return () => channel.unsubscribe(listener);
}

export function subscribePrivate(userId, onEvent) {
  if (!_client || !_orgId) throw new Error('Real-Time client not connected');
  const channelName = `hb:${_orgId}:private:${userId}`;
  const channel = _client.channels.get(channelName);
  const listener = (msg) => onEvent({ event: msg.name, data: msg.data });
  channel.subscribe(listener);
  return () => channel.unsubscribe(listener);
}

export async function disconnect() {
  if (_client) {
    _client.close();
    _client = null;
    _orgId = null;
  }
}
