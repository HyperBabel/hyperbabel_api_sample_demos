import 'package:dio/dio.dart';
import 'api_client.dart';

/// Repository handling Presence and Heartbeat functionality.
class PresenceRepository {
  final ApiClient _apiClient = ApiClient();

  /// Send a heartbeat to keep the user online
  Future<void> heartbeat(String userId, String platform) async {
    try {
      await _apiClient.client.post('/presence/heartbeat', data: {
        'user_id': userId,
        'platform': platform,
      });
    } on DioException catch (e) {
      throw Exception('Failed to send heartbeat: ${e.message}');
    }
  }

  /// Query online status of multiple users
  Future<Map<String, dynamic>> getPresence(List<String> userIds) async {
    try {
      final response = await _apiClient.client.post('/presence/status', data: {
        'user_ids': userIds,
      });
      return response.data;
    } on DioException catch (e) {
      throw Exception('Failed to fetch presence: ${e.message}');
    }
  }
}
