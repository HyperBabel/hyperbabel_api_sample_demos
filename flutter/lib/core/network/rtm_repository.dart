import 'package:dio/dio.dart';
import 'api_client.dart';

/// Token issuance for HyperBabel Real-Time and HyperBabel Video. Both
/// endpoints take an API-key Bearer and return short-lived signed tokens.
class RtmRepository {
  final ApiClient _apiClient = ApiClient();

  /// Request an RTC token to join a video channel.
  ///
  /// A `publisher` token REQUIRES [sessionId] — the id of a live session created
  /// with `POST /video/sessions` or `POST /unitedchat/rooms/:roomId/video-call`.
  /// HyperBabel verifies the caller is a participant and signs the token with
  /// the session's channel name and uid, so join with the values in the
  /// **response**, not the ones passed here.
  ///
  /// Live-stream hosts do not use this endpoint: `POST /stream/sessions`
  /// already returns a 24-hour host token.
  Future<Map<String, dynamic>> rtcToken({
    required String channelName,
    required int uid,
    required String role, // 'publisher' or 'subscriber'
    String? sessionId,
    String? externalUserId,
  }) async {
    try {
      final response = await _apiClient.client.post(
        '/rtm/rtc/token',
        data: {
          'channel_name': channelName,
          'uid': uid,
          'role': role,
          if (sessionId != null) 'session_id': sessionId,
          if (externalUserId != null) 'external_user_id': externalUserId,
        },
      );
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception('Failed to fetch RTC token: ${e.message}');
    }
  }
}
