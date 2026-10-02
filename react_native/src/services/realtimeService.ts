/**
 * HyperBabel Real-Time Service
 *
 * Establishes a persistent real-time channel connection using credentials
 * issued by the HyperBabel Token API (POST /rtm/token).
 *
 * The token endpoint returns a signed credential that authorizes this client
 * to publish and subscribe through HyperBabel's real-time infrastructure —
 * no third-party credentials are needed in application code.
 *
 * Channel naming — READ THIS BEFORE CHANGING ANYTHING HERE
 *
 *  - Room messages: pass the room's `realtime_channel` string EXACTLY as the
 *    REST API returns it. NEVER rebuild it from a room id — the server derives
 *    the name from values the client cannot guess, so a reconstructed name
 *    silently subscribes to a channel nobody publishes on.
 *
 *  - Per-user inbox (call signals): `user:{orgId}:{userId}`, where
 *    `orgId` is the `org_id` returned by POST /rtm/token, used as-is.
 *    Call signals use the event NAME 'signal'; the payload's `type` says
 *    which one it is (an invite is `{ type: 'CALL_INVITE', … }`).
 *
 *  - There is NO separate typing channel and NO presence channel. Typing
 *    arrives on the room channel as a `{ type: 'typing' }` payload, and
 *    presence is a REST endpoint, not a real-time channel.
 *
 * Usage:
 *   import realtimeService from '@/services/realtimeService';
 *   const channelService = await realtimeService.init(userId, userName, langCode);
 *   const unsub = channelService.subscribeToRoom(room.realtime_channel, ({ message }) => render(message));
 *   // cleanup:
 *   unsub();
 *   realtimeService.disconnect();
 */

import * as Realtime from 'ably';
import api from './api';

const BASE = '/rtm';

// ── Internal state ────────────────────────────────────────────────────────

/** Singleton real-time client (created once per session) */
let _client: Realtime.Realtime | null = null;
/** Organization ID returned with the token (used for channel scoping) */
let _orgId: string | null = null;

// ── Token request ─────────────────────────────────────────────────────────

/**
 * Request a signed real-time token from the HyperBabel token endpoint.
 * Called automatically by the client on initial connection and renewal.
 */
export const requestToken = async (
  userId: string,
  userName?: string,
  preferredLangCd?: string,
): Promise<object> => {
  const data = await api.post<{ org_id: string; realtime_token_request: object }>(`${BASE}/token`, {
    user_id:           userId,
    user_name:         userName,
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
 * Call once on login. Returns a channel service interface.
 */
export const init = async (
  userId: string,
  userName?: string,
  preferredLangCd = 'en',
): Promise<RealtimeChannelService> => {
  if (_client) {
    // Already connected — return the existing service
    return createChannelService();
  }

  // Pre-fetch the first token to get the orgId.
  // The server issues tokens with clientId = "{orgId}:{userId}" for multi-tenant isolation.
  // We must tell HyperBabel Real-Time the same composite clientId to avoid a 403 mismatch.
  const initialToken = await requestToken(userId, userName, preferredLangCd);
  const compositeClientId = _orgId ? `${_orgId}:${userId}` : userId;
  let initialTokenConsumed = false;

  // Create client with HyperBabel's authCallback — token fetched from our own API
  _client = new Realtime.Realtime({
    authCallback: async (
      _tokenParams: Realtime.TokenParams,
      callback: (error: Realtime.ErrorInfo | null, tokenRequest: Realtime.TokenRequest | null) => void,
    ) => {
      try {
        if (!initialTokenConsumed) {
          initialTokenConsumed = true;
          callback(null, initialToken as Realtime.TokenRequest);
        } else {
          const tokenRequest = await requestToken(userId, userName, preferredLangCd);
          callback(null, tokenRequest as Realtime.TokenRequest);
        }
      } catch (err) {
        callback(err as Realtime.ErrorInfo, null);
      }
    },
    clientId: compositeClientId,
  });

  // Wait for connection
  await new Promise<void>((resolve) => {
    _client!.connection.once('connected', resolve as () => void);
    _client!.connection.once('failed', resolve as () => void);
    setTimeout(resolve, 8000);  // Timeout fallback
  });

  return createChannelService();
};

/**
 * Disconnect the real-time client (call on logout).
 */
export const disconnect = (): void => {
  if (_client) {
    _client.close();
    _client = null;
    _orgId  = null;
  }
};

/** Current connection state */
export const getConnectionState = (): string =>
  _client?.connection?.state ?? 'disconnected';

// ── Channel Service Interface ─────────────────────────────────────────────

export interface RealtimeChannelService {
  subscribeToRoom:    (realtimeChannel: string, onMessage: (evt: { message: unknown; type: string }) => void) => () => void;
  subscribeToPrivate: (userId: string, onEvent: (evt: { event: string; data: unknown }) => void) => () => void;
  getState:           () => string;
}

const createChannelService = (): RealtimeChannelService => ({
  /**
   * Subscribe to a room's real-time events.
   *
   * Also receives 'read_receipt', 'reaction' and other named events published
   * by HyperBabel when room state changes. Typing indicators arrive here too,
   * as a `{ type: 'typing' }` payload — there is no separate typing channel.
   *
   * @param realtimeChannel The room's `realtime_channel` value from the REST
   *   API, passed through VERBATIM.
   */
  subscribeToRoom: (realtimeChannel, onMessage) => {
    if (!_client || !realtimeChannel) return () => {};

    const channel = _client.channels.get(realtimeChannel);

    const listener = (msg: Realtime.Message) => {
      if (msg.data) onMessage({ message: msg.data, type: msg.name ?? '' });
    };

    channel.subscribe(listener);
    return () => channel.unsubscribe(listener);
  },

  /**
   * Subscribe to the current user's per-user inbox (call signals).
   * Channel: user:{orgId}:{userId} — must match the server exactly; `_orgId`
   * is the `org_id` from POST /rtm/token, used as-is (no transformation).
   * `event` is the real-time event name ('signal' for call signals) — match
   * the kind of signal on `data.type`, not on the event name.
   */
  subscribeToPrivate: (userId, onEvent) => {
    if (!_client || !_orgId) return () => {};

    const channelName = `user:${_orgId!}:${userId}`;
    const channel     = _client.channels.get(channelName);

    const listener = (msg: Realtime.Message) => {
      if (msg.data) onEvent({ event: msg.name ?? '', data: msg.data });
    };

    channel.subscribe(listener);
    return () => channel.unsubscribe(listener);
  },

  getState: () => _client?.connection?.state ?? 'disconnected',
});

export default { init, disconnect, requestToken, getConnectionState };
