import 'dart:async';

import 'package:ably_flutter/ably_flutter.dart' as auth_realtime;
import 'package:shared_preferences/shared_preferences.dart';

import '../network/api_client.dart';

// We alias the vendor strictly to 'auth_realtime' and wrap it under HyperBabel
// terminology. All comments adhere to English-only and Vendor-Masked naming.

/// A message received on a HyperBabel real-time channel. Other files use this
/// neutral name instead of importing the SDK.
typedef RealtimeMessage = auth_realtime.Message;

/// HyperBabel Real-Time Client — token-based connection + per-room and
/// per-user subscriptions.
///
/// Production flow (matches the JavaScript / React Native demos):
///   1. POST /rtm/token through [ApiClient] — the same end-user session token
///      (customer JWT), the same `HB_API_URL` base URL and the same transparent
///      refresh as every other call in this demo. The response carries a
///      signed token request, the `user_id` it was signed for and `org_id`.
///   2. Pass it through `ClientOptions.authCallback` so the SDK can refresh
///      the session when the token expires.
///   3. Subscribe with the room's `realtime_channel` string from the REST API
///      for room events, or `user:{orgId}:{userId}` for the per-user inbox
///      (incoming call signals such as `CALL_INVITE`).
///
/// No organization API key is involved at any step — the device never holds
/// one, and [ApiClient] refuses to send one.
///
/// Channel naming — READ THIS BEFORE CHANGING ANYTHING HERE:
///   * Room channel names CANNOT be rebuilt from a room id. The server derives
///     them from values this client does not have, so a reconstructed name
///     subscribes to a channel nobody publishes on — and the failure is silent.
///     Always pass `room.realtime_channel` through verbatim.
///   * The per-user channel uses `org_id` and `user_id` from the token
///     response AS-IS. For an end-user session the server signs the token for
///     the signed-in user, whatever `user_id` the request carried.
///   * There is no separate typing channel and no presence channel. Typing
///     arrives on the room channel as a `{ type: 'typing' }` payload.
class HyperBabelRealtimeClient {
  static final HyperBabelRealtimeClient _instance =
      HyperBabelRealtimeClient._internal();
  factory HyperBabelRealtimeClient() => _instance;
  HyperBabelRealtimeClient._internal();

  /// How long [connect] waits for the connection to come up before giving up
  /// (and tearing the attempt down so the next call can retry cleanly).
  static const _connectTimeout = Duration(seconds: 15);

  /// The demo's shared HTTP client: attaches the customer JWT, honours
  /// `HB_API_URL` and refreshes the JWT on expiry.
  final ApiClient _api = ApiClient();

  auth_realtime.Realtime? _client;
  String? _orgId;
  String? _userId;

  /// The in-flight [connect], shared by concurrent callers (the incoming-call
  /// listener and a chat screen) so they never open two connections.
  Future<void>? _connecting;

  /// Bumped by [disconnect]. A [connect] that was still fetching a token when
  /// the user signed out sees the change and drops its result.
  int _epoch = 0;

  bool get isConnected => _client != null;
  String? get orgId => _orgId;

  /// Open a long-lived connection for the signed-in user (the id stored in
  /// SharedPreferences at sign-in). Safe to call repeatedly: it reuses the
  /// live connection for the same user and replaces it when a different user
  /// has signed in since. Returns without connecting while signed out.
  Future<void> connect({String? displayName, String? langCd}) {
    final inflight = _connecting;
    if (inflight != null) return inflight;
    final future = _connect(displayName: displayName, langCd: langCd);
    _connecting = future;
    return future.whenComplete(() {
      if (identical(_connecting, future)) _connecting = null;
    });
  }

  Future<void> _connect({String? displayName, String? langCd}) async {
    final prefs = await SharedPreferences.getInstance();
    final userId = prefs.getString('hb_user_id');
    if (userId == null || userId.isEmpty) return;
    if (_client != null) {
      if (userId == _userId) return;
      await disconnect(); // A different user signed in on this device.
    }
    final epoch = _epoch;

    // Pre-fetch one token so we can read `org_id` (needed to derive channel
    // names) and prove the session is valid before connecting.
    final initial = await _fetchTokenRequest(
      userId: userId,
      displayName: displayName,
      langCd: langCd,
    );
    if (epoch != _epoch) return; // Signed out while the token was in flight.
    final orgId = initial['org_id'] as String?;
    final subjectId = (initial['user_id'] as String?) ?? userId;
    Map<String, dynamic>? unusedInitial = _tokenRequestOf(initial);

    final opts = auth_realtime.ClientOptions()
      // Must match the clientId the server signed: `{orgId}:{userId}`.
      ..clientId = orgId != null ? '$orgId:$subjectId' : subjectId
      ..echoMessages = false
      ..authCallback = (auth_realtime.TokenParams _) async {
        // The first connect uses the pre-fetched request; every later call
        // (token renewal) asks the server for a fresh one. Returning a
        // server-signed TokenRequest is the recommended flow.
        final pending = unusedInitial;
        unusedInitial = null;
        final tokReq = pending ??
            _tokenRequestOf(await _fetchTokenRequest(
              userId: userId,
              displayName: displayName,
              langCd: langCd,
            ));
        return auth_realtime.TokenRequest.fromMap(tokReq);
      };

    final client = auth_realtime.Realtime(options: opts);
    _client = client;
    _orgId = orgId;
    _userId = subjectId;
    if (client.connection.state == auth_realtime.ConnectionState.connected) {
      return;
    }
    try {
      await client.connection
          .on(auth_realtime.ConnectionEvent.connected)
          .first
          .timeout(_connectTimeout);
    } catch (_) {
      if (client.connection.state == auth_realtime.ConnectionState.connected) {
        return;
      }
      // Never leave a half-open client behind — the next connect() retries.
      if (identical(_client, client)) await disconnect();
      rethrow;
    }
  }

  /// Subscribe to a room's real-time events.
  ///
  /// [realtimeChannel] must be the room's `realtime_channel` value from the
  /// REST API, passed through verbatim — see the class doc above.
  /// The returned [StreamSubscription] should be cancelled when the listener
  /// unmounts. Cancelling removes ONLY that listener: the channel stays
  /// attached, so other screens subscribed to the same room keep receiving.
  /// (Nothing in this client detaches or releases a channel.)
  Future<StreamSubscription<RealtimeMessage>?> subscribeRoom(
      String realtimeChannel,
      void Function(RealtimeMessage) onMessage) async {
    if (_client == null || realtimeChannel.isEmpty) return null;
    final channel = _client!.channels.get(realtimeChannel);
    await channel.attach();
    return channel.subscribe().listen(onMessage);
  }

  /// Subscribe to the user's per-user inbox (incoming call signals).
  /// Channel: `user:{orgId}:{userId}` — must match the server exactly.
  Future<StreamSubscription<RealtimeMessage>?> subscribePrivate(
      void Function(RealtimeMessage) onMessage) async {
    if (_client == null || _orgId == null || _userId == null) return null;
    final channel = _client!.channels.get('user:$_orgId:$_userId');
    await channel.attach();
    return channel.subscribe().listen(onMessage);
  }

  /// The call-event metadata in a room event, or null when [event] is not a
  /// call event. Every call state change is stored as a `video_call` system
  /// message and broadcast on the room channel as
  /// `{ type: 'message', data: <message> }`. The message's `metadata` is
  /// `{ event, session_id, … }`, where `event` is `call_started`,
  /// `call_accepted`, `call_ended`, `call_rejected`, `call_missed` or
  /// `call_busy`.
  static Map<String, dynamic>? callEventOf(RealtimeMessage event) {
    if (event.name != 'message') return null;
    final envelope = event.data;
    if (envelope is! Map || envelope['type'] != 'message') return null;
    final message = envelope['data'];
    if (message is! Map || message['message_type'] != 'video_call') return null;
    final metadata = message['metadata'];
    return metadata is Map ? Map<String, dynamic>.from(metadata) : null;
  }

  /// Tear down the connection — call on logout.
  Future<void> disconnect() async {
    _epoch++;
    final client = _client;
    _client = null;
    _orgId = null;
    _userId = null;
    if (client == null) return;
    try {
      await client.close();
    } catch (_) {
      // Already closed or never fully opened — nothing left to tear down.
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /// POST /rtm/token with the signed-in user's customer JWT. `user_id` is a
  /// required field; for an end-user session the server pins the token to
  /// the authenticated user and echoes that id back as `user_id`.
  Future<Map<String, dynamic>> _fetchTokenRequest({
    required String userId,
    String? displayName,
    String? langCd,
  }) async {
    final resp = await _api.client.post(
      '/rtm/token',
      data: {
        'user_id': userId,
        if (displayName != null) 'user_name': displayName,
        if (langCd != null) 'preferred_lang_cd': langCd,
      },
    );
    return Map<String, dynamic>.from(resp.data as Map);
  }

  /// The signed token request inside a /rtm/token response. The SDK validates
  /// the signature over this inner object, so never hand it the envelope.
  static Map<String, dynamic> _tokenRequestOf(Map<String, dynamic> response) {
    final tokReq = response['realtime_token_request'];
    if (tokReq is! Map) {
      throw Exception('Server did not return a token request.');
    }
    return Map<String, dynamic>.from(tokReq);
  }
}
