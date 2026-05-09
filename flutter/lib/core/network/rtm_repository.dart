import 'package:dio/dio.dart';
import 'api_client.dart';

/// Token issuance for HyperBabel Real-Time and HyperBabel Video. Both
/// endpoints take an API-key Bearer and return short-lived signed tokens.
class RtmRepository {
  final ApiClient _apiClient = ApiClient();

  /// Request an RTC token to join a video / stream channel.
  Future<Map<String, dynamic>> rtcToken({
    required String channelName,
    required int uid,
    required String role, // 'publisher' or 'subscriber'
  }) async {
    try {
      final response = await _apiClient.client.post(
        '/rtm/rtc/token',
        data: {
          'channel_name': channelName,
          'uid': uid,
          'role': role,
        },
      );
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception('Failed to fetch RTC token: ${e.message}');
    }
  }
}
