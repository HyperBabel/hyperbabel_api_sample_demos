import 'dart:async';

import 'package:ably_flutter/ably_flutter.dart' as auth_realtime;
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

// We alias the vendor strictly to 'auth_realtime' and wrap it under HyperBabel
// terminology. All comments adhere to English-only and Vendor-Masked naming.

/// HyperBabel Real-Time Client — token-based connection + per-room and
/// per-user subscriptions.
///
/// Production flow (matches the React / RN demos):
///   1. POST /rtm/token  → returns a signed token request + `org_id`.
///   2. Pass it through `ClientOptions.authCallback` so the SDK can refresh
///      the session when the token expires.
///   3. Subscribe on `hb:{orgId}:room:{roomId}` for room events, or
///      `hb:{orgId}:private:{userId}` for the per-user inbox (call invites,
///      read receipts, etc.).
class HyperBabelRealtimeClient {
  static final HyperBabelRealtimeClient _instance =
      HyperBabelRealtimeClient._internal();
  factory HyperBabelRealtimeClient() => _instance;
  HyperBabelRealtimeClient._internal();

  auth_realtime.Realtime? _client;
  String? _orgId;
  String? _userId;

  /// HTTP client used only to fetch the signed token request. Bearer auth is
  /// applied per-call below using the API key from SharedPreferences.
  final Dio _http = Dio(BaseOptions(
    baseUrl: 'https://api.hyperbabel.com/api/v1',
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 10),
    headers: const {'Content-Type': 'application/json'},
  ));

  bool get isConnected => _client != null;
  String? get orgId => _orgId;

  /// Open a long-lived connection. Reads the API key + user identity from
  /// SharedPreferences and wires the SDK's `authCallback` to refresh tokens
  /// automatically.
  Future<void> connect({String? displayName, String? langCd}) async {
    if (_client != null) return;
    final prefs = await SharedPreferences.getInstance();
    final apiKey = prefs.getString('hb_api_key');
    final userId = prefs.getString('hb_user_id');
    if (apiKey == null || userId == null) return;
    _userId = userId;

    // Pre-fetch one token so we can read `org_id` (needed to derive channel
    // names) and prove the credential is valid before connecting.
    final initial = await _fetchTokenRequest(
      apiKey: apiKey,
      userId: userId,
      displayName: displayName,
      langCd: langCd,
    );
    _orgId = initial['org_id'] as String?;

    final opts = auth_realtime.ClientOptions()
      ..clientId = _orgId != null ? '$_orgId:$userId' : userId
      ..echoMessages = false
      ..authCallback = (auth_realtime.TokenParams _) async {
        // Refresh the token whenever the SDK asks. Returning a TokenRequest
        // (server-signed) is the recommended flow.
        final refreshed = await _fetchTokenRequest(
          apiKey: apiKey,
          userId: userId,
          displayName: displayName,
          langCd: langCd,
        );
        final tokReq = refreshed['realtime_token_request'] as Map<String, dynamic>?;
        if (tokReq == null) {
          throw Exception('Server did not return a token request.');
        }
        return auth_realtime.TokenRequest.fromMap(tokReq);
      };

    _client = auth_realtime.Realtime(options: opts);
    await _client!.connection
        .on(auth_realtime.ConnectionEvent.connected)
        .first;
  }

  /// Subscribe to a room channel. The supplied callback receives every
  /// event delivered on `hb:{orgId}:room:{roomId}`. The returned
  /// [StreamSubscription] should be cancelled when the listener unmounts.
  Future<StreamSubscription<auth_realtime.Message>?> subscribeRoom(
      String roomId, void Function(auth_realtime.Message) onMessage) async {
    if (_client == null || _orgId == null) return null;
    final channel = _client!.channels.get('hb:$_orgId:room:$roomId');
    await channel.attach();
    return channel.subscribe().listen(onMessage);
  }

  /// Subscribe to the user's private inbox (call invites, system events).
  Future<StreamSubscription<auth_realtime.Message>?> subscribePrivate(
      void Function(auth_realtime.Message) onMessage) async {
    if (_client == null || _orgId == null || _userId == null) return null;
    final channel = _client!.channels.get('hb:$_orgId:private:$_userId');
    await channel.attach();
    return channel.subscribe().listen(onMessage);
  }

  /// Tear down the connection — call on logout.
  Future<void> disconnect() async {
    await _client?.close();
    _client = null;
    _orgId = null;
    _userId = null;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> _fetchTokenRequest({
    required String apiKey,
    required String userId,
    String? displayName,
    String? langCd,
  }) async {
    final resp = await _http.post(
      '/rtm/token',
      data: {
        'user_id': userId,
        if (displayName != null) 'user_name': displayName,
        if (langCd != null) 'preferred_lang_cd': langCd,
      },
      options: Options(headers: {'Authorization': 'Bearer $apiKey'}),
    );
    return resp.data as Map<String, dynamic>;
  }
}
