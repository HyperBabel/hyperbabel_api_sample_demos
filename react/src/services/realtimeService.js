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
 * Channel naming convention (managed by HyperBabel):
 *  - Room messages  : `hb:{orgId}:room:{roomId}`
 *  - Typing events  : `hb:{orgId}:room:{roomId}:typing`
 *  - Private user   : `hb:{orgId}:private:{userId}`
 *  - Presence       : `hb:{orgId}:presence:{roomId}`
 *
 * Usage:
 *   import realtimeService from './realtimeService';
 *   const channelService = await realtimeService.init(userId, userName, langCode);
 *   await channelService.subscribe('room-id', ({ message }) => renderMessage(message));
 */

import * as Realtime from 'ably';
import api from './api';

const BASE = '/rtm';

// ── Internal state ────────────────────────────────────────────────────────

/** Singleton real-time client (created once per session) */
let _client = null;
/** Organization ID returned with the token (used for channel scoping) */
let _orgId = null;

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
  return data.ably_token_request;
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

  // Pre-fetch the first token to get the orgId.
  // The server issues tokens with clientId = "{orgId}:{userId}" for multi-tenant isolation.
  // We must tell Ably the same composite clientId to avoid a 403 mismatch.
  const initialToken = await requestToken(userId, userName, preferredLangCd);
  const compositeClientId = _orgId ? `${_orgId}:${userId}` : userId;

  // Create client with HyperBabel's authCallback — token is fetched from our own API
  _client = new Realtime.Realtime({
    authCallback: async (tokenParams, callback) => {
      try {
        // On renewal, reuse the pre-fetched token or request a fresh one
        if (initialToken && !_client._initialTokenConsumed) {
          _client._initialTokenConsumed = true;
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

  // Wait for connection to be established
  await new Promise((resolve, reject) => {
    _client.connection.once('connected', resolve);
    _client.connection.once('failed', reject);
    // Timeout fallback
    setTimeout(() => resolve(), 8000);
  });

  return createChannelService();
};

/**
 * Disconnect the real-time client (call on logout).
 */
export const disconnect = () => {
  if (_client) {
    _client.close();
    _client = null;
    _orgId = null;
  }
};

// ── Channel Service Interface ─────────────────────────────────────────────

/**
 * Build the channel service interface after client is ready.
 * @private
 */
const createChannelService = () => ({
  /**
   * Subscribe to new messages in a room.
   * Messages are published by HyperBabel when a message is sent via the
   * United Chat or Chat REST API.
   *
   * @param {string}   roomId
   * @param {function} onMessage — Called with { message } on each new message
   * @returns {function} Unsubscribe function
   */
  subscribeToRoom: (roomId, onMessage) => {
    if (!_client || !_orgId) return () => {};

    // Channel name follows HyperBabel's internal naming convention
    const channelName = `hb:${_orgId}:room:${roomId}`;
    const channel = _client.channels.get(channelName);

    const listener = (msg) => {
      if (msg.data) {
        // Pass both the payload and the Ably event name (type) so the caller
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
   * Subscribe to typing indicator events in a room.
   *
   * @param {string}   roomId
   * @param {function} onTyping — Called with { user_id, is_typing }
   * @returns {function} Unsubscribe function
   */
  subscribeToTyping: (roomId, onTyping) => {
    if (!_client || !_orgId) return () => {};

    const channelName = `hb:${_orgId}:room:${roomId}:typing`;
    const channel = _client.channels.get(channelName);

    const listener = (msg) => {
      if (msg.data) onTyping(msg.data);
    };

    channel.subscribe('typing', listener);
    return () => channel.unsubscribe('typing', listener);
  },

  /**
   * Subscribe to private events for the current user (call invitations, etc.).
   *
   * @param {string}   userId
   * @param {function} onEvent — Called with event data
   * @returns {function} Unsubscribe function
   */
  subscribeToPrivate: (userId, onEvent) => {
    if (!_client || !_orgId) return () => {};

    const channelName = `hb:${_orgId}:private:${userId}`;
    const channel = _client.channels.get(channelName);

    const listener = (msg) => {
      if (msg.data) onEvent({ event: msg.name, data: msg.data });
    };

    // Subscribe to all events on the private channel
    channel.subscribe(listener);
    return () => channel.unsubscribe(listener);
  },

  /**
   * Subscribe to presence updates (online/offline) in a room.
   *
   * @param {string}   roomId
   * @param {function} onPresence — Called with presence data
   * @returns {function} Unsubscribe function
   */
  subscribeToPresence: (roomId, onPresence) => {
    if (!_client || !_orgId) return () => {};

    const channelName = `hb:${_orgId}:presence:${roomId}`;
    const channel = _client.channels.get(channelName);

    const listener = (presenceMsg) => onPresence(presenceMsg);
    channel.presence.subscribe(listener);
    return () => channel.presence.unsubscribe(listener);
  },

  /** Get current connection state */
  getState: () => _client?.connection?.state || 'disconnected',
});

export default { init, disconnect, requestToken };
