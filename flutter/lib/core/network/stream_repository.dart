import 'package:dio/dio.dart';
import 'api_client.dart';
import 'api_error.dart';
import '../video/video_quality.dart';

/// Repository for the HyperBabel Live Stream API. Hosts open a session,
/// publish video / audio, and end it; viewers exchange a viewer token to
/// join the same channel as a subscriber.
///
/// ⚠️ EVERY CALL HERE NEEDS YOUR BACKEND — IT CANNOT RUN FROM THIS APP.
///
///   `/stream/*` authenticates with your ORGANIZATION API KEY
///   (`Authorization: Bearer hb_live_…`). Anything else is rejected up front:
///
///       POST /api/v1/stream/sessions
///       -> 401 { "error": { "code": "invalid_api_key_format" } }
///
///   Creating a broadcast allocates paid capacity and is metered against your
///   organization, so the caller has to be YOU, not a signed-in end user. This
///   demo only ever holds a customer JWT (the API client refuses to carry an org
///   key), so these calls fail here by design.
///
///   Ship it as:  app -> your backend (holds hb_live_…) -> HyperBabel /stream/*
///   The paths, payloads and call order below are accurate — implement them
///   on your server and expose a thin endpoint the app can call.
class StreamRepository {
  final ApiClient _apiClient = ApiClient();

  /// List live stream sessions:
  /// `{ sessions: [{ id, title, status, host: { user_id, display_name },
  /// viewer_count, started_at, created_at }], total }`.
  Future<List<Map<String, dynamic>>> listSessions() async {
    try {
      final response = await _apiClient.client.get('/stream/sessions');
      final list = ((response.data as Map)['sessions'] as List?) ?? const [];
      return list.whereType<Map>().map(Map<String, dynamic>.from).toList();
    } on DioException catch (e) {
      throw Exception('Failed to list streams: ${apiErrorMessage(e)}');
    }
  }

  /// Create a new stream session as the host and return the `session`
  /// object. The API wraps it:
  ///
  ///     { session: { id, channel_name, rtm_channel, title, status,
  ///                  host: { user_id, display_name, profile_image_url,
  ///                          preferred_lang_cd, uid, rtc_token },
  ///                  app_id, quality, quality_warning? } }
  ///
  /// The host publishes with `session.host.rtc_token` and `session.host.uid`
  /// (a 24-hour publisher token). There is no top-level `rtc_token`.
  Future<Map<String, dynamic>> createSession({
    required String hostUserId,
    required String hostName,
    String? title,
  }) async {
    try {
      final response = await _apiClient.client.post(
        '/stream/sessions',
        // Wire shape per the HyperBabel Stream API (POST /stream/sessions):
        // flat { title, host_user_id, host_display_name?, quality? }.
        // `title` and `host_user_id` are both required.
        data: {
          'title': title ?? 'Live from $hostName',
          'host_user_id': hostUserId,
          'host_display_name': hostName,
          // Billing tier for this broadcast. Derived from the publishing
          // preset in core/video/video_quality.dart so the declared tier
          // always matches the pixels actually sent.
          'quality': VideoQuality.declaredQualityWire(),
          // Optional self-check. A viewer subscribes to the host stream only,
          // so a broadcast's aggregate is this resolution itself — pass 1.
          'publish_resolution': VideoQuality.publishResolutionFor(1),
        },
      );
      return Map<String, dynamic>.from((response.data as Map)['session'] as Map);
    } on DioException catch (e) {
      throw Exception('Failed to create stream: ${apiErrorMessage(e)}');
    }
  }

  /// Mark the session as broadcasting (`status: 'live'`) so it shows up in
  /// [listSessions].
  Future<void> startSession(String sessionId) async {
    try {
      await _apiClient.client.post('/stream/sessions/$sessionId/start');
    } on DioException catch (e) {
      throw Exception('Failed to start broadcast: ${apiErrorMessage(e)}');
    }
  }

  /// Heartbeat — call every ~30s while broadcasting. A live session whose
  /// host has not sent one for 5 minutes is ended by the server, and billing
  /// stops at the last heartbeat. Fire-and-forget — a single failed beat
  /// shouldn't kill the broadcast.
  Future<void> heartbeat(String sessionId) async {
    try {
      await _apiClient.client.post('/stream/sessions/$sessionId/heartbeat');
    } on DioException catch (_) {
      // Swallow — heartbeat failures are non-fatal.
    }
  }

  /// End the broadcast as the host.
  Future<void> endSession(String sessionId) async {
    try {
      await _apiClient.client.post('/stream/sessions/$sessionId/end');
    } on DioException catch (e) {
      throw Exception('Failed to end broadcast: ${apiErrorMessage(e)}');
    }
  }

  /// Get a subscriber token to watch the session. The response is FLAT (not
  /// wrapped in `session`):
  ///
  ///     { channel_name, uid, token, display_name, profile_image_url,
  ///       preferred_lang_cd, host_user_id, host_display_name, title, app_id }
  ///
  /// `token` is a subscriber token valid for one hour — it cannot publish,
  /// so a host never joins with it.
  Future<Map<String, dynamic>> viewerToken(String sessionId, String userId) async {
    try {
      final response = await _apiClient.client.post(
        '/stream/sessions/$sessionId/viewer-token',
        data: {'user_id': userId},
      );
      return Map<String, dynamic>.from(response.data as Map);
    } on DioException catch (e) {
      throw Exception('Failed to get viewer token: ${apiErrorMessage(e)}');
    }
  }
}
