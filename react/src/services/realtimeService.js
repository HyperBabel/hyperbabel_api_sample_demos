/**
 * HyperBabel Real-Time Service
 *
 * Establishes a persistent real-time channel connection using credentials
 * issued by the HyperBabel Token API (`POST /rtm/token`).
 *
 * The token endpoint returns a signed credential that authorizes this
 * client to publish and subscribe through HyperBabel's real-time
 * infrastructure — no third-party credentials needed in application code.
 *
 * Channel naming — READ THIS BEFORE CHANGING ANYTHING HERE
 *
 *  - Room messages: pass the room's `realtime_channel` string EXACTLY as the
 *    REST API returns it (`POST /unitedchat/rooms`, `GET /unitedchat/rooms`,
 *    `GET /unitedchat/rooms/{roomId}`). NEVER rebuild it from a room id — the
 *    server derives the name from values the client cannot guess, so a
 *    reconstructed name silently subscribes to a channel nobody publishes on.
 *
 *  - Per-user private channel (call invitations and other per-user signals):
 *    `user:{orgId}:{userId}`, where `orgId` is the `org_id` returned by
 *    `POST /rtm/token`, used as-is. Signals arrive with the event name
 *    `signal`; what kind of signal it is lives in the payload's `type` field
 *    (e.g. `{ type: 'CALL_INVITE', sessionId, roomId, ... }`).
 *
 *  - There is NO separate typing channel and NO presence channel. Typing
 *    arrives on the room channel as a `{ type: 'typing' }` payload, and
 *    presence is a REST endpoint (`/presence`), not a real-time channel.
 *
 * One connection per signed-in user: `init()` is safe to call from several
 * places (concurrent callers share one connection attempt) and returns the
 * existing connection once it is up. Close it on sign-out with `disconnect()`
 * — not when a page unmounts, or the app-wide incoming-call listener goes deaf.
 *
 * Usage:
 *   import realtimeService from './realtimeService';
 *   const channelService = await realtimeService.init(userId, userName, langCode);
 *   const stopRoom = channelService.subscribeToRoom(room.realtime_channel, ({ message }) => renderMessage(message));
 *   const stopInbox = channelService.subscribeToPrivate(userId, ({ data }) => {
 *     if (data?.type === 'CALL_INVITE') showIncomingCall(data);
 *   });
 */

import * as Realtime from 'ably';
import api from './api';

const BASE = '/rtm';

// ── Internal state ────────────────────────────────────────────────────────

/** Singleton real-time client (created once per session) */
let _client = null;
/** Organization ID returned with the token (used for channel scoping) */
let _orgId = null;
/** In-flight connection attempt, shared by concurrent init() callers */
let _connecting = null;
/** Bumped by disconnect() so an attempt still in flight cannot revive a closed session */
let _generation = 0;

// ── Token Request (via HyperBabel API) ───────────────────────────────────

/**
 * Request a signed real-time token from the HyperBabel token endpoint.
 * Called automatically by the client on connection and renewal.
 *
 * @param {string} userId
 * @param {string} [userName]
 * @param {string} [preferredLangCd]
 * @returns {Promise<object>} Signed token request object
 */
export const requestToken = async (userId, userName, preferredLangCd) => {
  const data = await api.post(`${BASE}/token`, {
    user_id: userId,
    user_name: userName,
    preferred_lang_cd: preferredLangCd,
  });
  _orgId = data.org_id;
  // The HyperBabel token endpoint returns a signed token request object
  // that the real-time client uses to authenticate the connection.
  return data.realtime_token_request;
};

// ── Connection ────────────────────────────────────────────────────────────

/**
 * Initialize the real-time client with token-based authentication.
 * The client authenticates against HyperBabel's token endpoint, keeping
 * all credential management server-side and invisible to end users.
 *
 * Call once on login. The returned object exposes high-level methods for
 * subscribing to room events, typing indicators, and private notifications.
 *
 * @param {string} userId
 * @param {string} [userName]
 * @param {string} [preferredLangCd='en']
 * @returns {Promise<RealtimeChannelService>} Subscription interface
 */
export const init = async (userId, userName, preferredLangCd = 'en') => {
  if (_client) {
    // Already connected — return the existing service
    return createChannelService();
  }
  // Another caller is already connecting — share that attempt instead of
  // opening a second connection.
  if (_connecting) return _connecting;

  const generation = _generation;
  const attempt = (async () => {
    // Pre-fetch the first token to get the orgId.
    // The server issues tokens with clientId = "{orgId}:{userId}" for multi-tenant isolation.
    // We must tell HyperBabel Real-Time the same composite clientId to avoid a 403 mismatch.
    const initialToken = await requestToken(userId, userName, preferredLangCd);
    if (generation !== _generation) {
      // disconnect() ran while the token request was in flight (sign-out).
      throw new Error('Real-time connection was closed before it was established');
    }
    const compositeClientId = _orgId ? `${_orgId}:${userId}` : userId;

    // Create client with HyperBabel's authCallback — token is fetched from our own API
    let initialTokenConsumed = false;
    const client = new Realtime.Realtime({
      authCallback: async (tokenParams, callback) => {
        try {
          // The first authentication reuses the pre-fetched token; every
          // renewal after that requests a fresh one.
          if (initialToken && !initialTokenConsumed) {
            initialTokenConsumed = true;
            callback(null, initialToken);
          } else {
            const tokenRequest = await requestToken(userId, userName, preferredLangCd);
            callback(null, tokenRequest);
          }
        } catch (err) {
          callback(err, null);
        }
      },
      clientId: compositeClientId,
    });
    _client = client;

    // Wait for connection to be established
    try {
      await new Promise((resolve, reject) => {
        client.connection.once('connected', resolve);
        client.connection.once('failed', reject);
        // Timeout fallback
        setTimeout(() => resolve(), 8000);
      });
    } catch (err) {
      // A failed connection does not recover on its own — drop it so the
      // next init() starts from scratch instead of reusing a dead client.
      if (_client === client) {
        try { client.close(); } catch { /* already in a terminal state */ }
        _client = null;
      }
      throw err;
    }
    if (generation !== _generation) {
      // disconnect() ran while we were waiting for the connection.
      throw new Error('Real-time connection was closed before it was established');
    }

    return createChannelService();
  })();

  _connecting = attempt;
  try {
    return await attempt;
  } finally {
    if (_connecting === attempt) _connecting = null;
  }
};

/**
 * Disconnect the real-time client. Call this on sign-out (AuthContext does),
 * not when a page unmounts — the connection is shared app-wide.
 */
export const disconnect = () => {
  _generation += 1;
  _connecting = null;
  if (_client) {
    _client.close();
    _client = null;
  }
  _orgId = null;
};

// ── Channel Service Interface ─────────────────────────────────────────────

/**
 * Build the channel service interface after client is ready.
 * @private
 */
const createChannelService = () => ({
  /**
   * Subscribe to a room's real-time events.
   *
   * Messages are published by HyperBabel when a message is sent via the
   * United Chat or Chat REST API. Typing indicators arrive on this same
   * channel with a `{ type: 'typing' }` payload — there is no separate
   * typing channel.
   *
   * @param {string}   realtimeChannel — The room's `realtime_channel` value
   *                   from the REST API, passed through VERBATIM.
   * @param {function} onMessage — Called with { message, type } on each event
   * @returns {function} Unsubscribe function
   */
  subscribeToRoom: (realtimeChannel, onMessage) => {
    if (!_client || !realtimeChannel) return () => {};

    const channel = _client.channels.get(realtimeChannel);

    const listener = (msg) => {
      if (msg.data) {
        // Pass both the payload and the HyperBabel Real-Time event name (type) so the caller
        // can distinguish 'message' events from 'read_receipt' events etc.
        onMessage({ message: msg.data, type: msg.name });
      }
    };

    // Subscribe to ALL events (not just 'message') so read_receipt and other
    // named events published via publishMessageEvent are also received.
    channel.subscribe(listener);

    // Return an unsubscribe function for cleanup
    return () => {
      channel.unsubscribe(listener);
    };
  },

  /**
   * Subscribe to private events for the current user (call invitations, etc.).
   *
   * Every event is delivered as `{ event, data }`: `event` is the real-time
   * event name (`signal` for call signalling) and `data` is the payload. Match
   * on `data.type` — e.g. `'CALL_INVITE'` (an incoming call) or `'CALL_BUSY'`
   * (someone you called is already in another call).
   *
   * @param {string}   userId
   * @param {function} onEvent — Called with `{ event, data }`
   * @returns {function} Unsubscribe function
   */
  subscribeToPrivate: (userId, onEvent) => {
    if (!_client || !_orgId) return () => {};

    // Must match the server's per-user channel exactly. `_orgId` is the
    // `org_id` from POST /rtm/token, used as-is (no transformation).
    const channelName = `user:${_orgId}:${userId}`;
    const channel = _client.channels.get(channelName);

    const listener = (msg) => {
      if (msg.data) onEvent({ event: msg.name, data: msg.data });
    };

    // Subscribe to all events on the private channel
    channel.subscribe(listener);
    return () => channel.unsubscribe(listener);
  },

  /** Get current connection state */
  getState: () => _client?.connection?.state || 'disconnected',
});

export default { init, disconnect, requestToken };
