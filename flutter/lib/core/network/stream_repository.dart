import 'package:dio/dio.dart';
import 'api_client.dart';
import '../video/video_quality.dart';

/// Repository for the HyperBabel Live Stream API. Hosts open a session,
/// publish video / audio, and end it; viewers exchange a viewer token to
/// join the same channel as a subscriber.
class StreamRepository {
  final ApiClient _apiClient = ApiClient();

  /// List currently-active stream sessions.
  Future<List<Map<String, dynamic>>> listSessions() async {
    try {
      final response = await _apiClient.client.get('/stream/sessions');
      final data = response.data;
      final list = data is Map ? (data['sessions'] ?? []) : (data ?? []);
      return (list as List<dynamic>).cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception('Failed to list streams: ${e.message}');
    }
  }

  /// Create a new stream session as the host. Returns a payload that
  /// includes the channel name + signed RTC token + Video app id.
  Future<Map<String, dynamic>> createSession({
    required String hostUserId,
    required String hostName,
    String? title,
  }) async {
    try {
      final response = await _apiClient.client.post(
        '/stream/sessions',
        // Wire shape per cf_workers_api/src/routes/stream.ts createStreamSchema:
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
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception('Failed to create stream: ${e.message}');
    }
  }

  /// Mark the session as broadcasting so the platform's viewer list and
  /// activity feeds promote it.
  Future<void> startSession(String sessionId, String hostUserId) async {
    try {
      await _apiClient.client.post(
        '/stream/sessions/$sessionId/start',
        data: {'user_id': hostUserId},
      );
    } on DioException catch (e) {
      throw Exception('Failed to start broadcast: ${e.message}');
    }
  }

  /// Heartbeat — call every ~30s while broadcasting. Lets the server
  /// detect a host crash within minutes (instead of 8h wall-clock) and
  /// bill only the actual stream time. Fire-and-forget — a single failed
  /// beat shouldn't kill the broadcast.
  Future<void> heartbeat(String sessionId) async {
    try {
      await _apiClient.client.post('/stream/sessions/$sessionId/heartbeat');
    } on DioException catch (_) {
      // Swallow — heartbeat failures are non-fatal.
    }
  }

  /// End the broadcast as the host.
  Future<void> endSession(String sessionId, String hostUserId) async {
    try {
      await _apiClient.client.post(
        '/stream/sessions/$sessionId/end',
        data: {'user_id': hostUserId},
      );
    } on DioException catch (e) {
      throw Exception('Failed to end broadcast: ${e.message}');
    }
  }

  /// Exchange a viewer token to join the session as a subscriber.
  Future<Map<String, dynamic>> viewerToken(String sessionId, String userId) async {
    try {
      final response = await _apiClient.client.post(
        '/stream/sessions/$sessionId/viewer-token',
        data: {'user_id': userId},
      );
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception('Failed to get viewer token: ${e.message}');
    }
  }
}
