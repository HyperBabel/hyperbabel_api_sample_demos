import 'package:dio/dio.dart';
import 'api_client.dart';
import 'api_error.dart';

/// Repository handling Presence and Heartbeat functionality.
class PresenceRepository {
  final ApiClient _apiClient = ApiClient();

  /// Send a heartbeat to keep the user online — every 30 s while the app is
  /// in the foreground. [device] is a free-form label stored with the
  /// presence row (e.g. 'mobile').
  Future<void> heartbeat(String userId, String device) async {
    try {
      await _apiClient.client.post('/presence/heartbeat', data: {
        'user_id': userId,
        'device': device,
      });
    } on DioException catch (e) {
      throw Exception('Failed to send heartbeat: ${apiErrorMessage(e)}');
    }
  }

  /// Read the presence of up to 100 users:
  /// `GET /presence?user_ids=a,b,c` →
  /// `{ presence: [{ user_id, status, last_seen, device }], offline_threshold_seconds }`.
  /// Unknown users come back as `status: 'offline'`. (`POST /presence/status`
  /// SETS your own status — it is not a bulk read.) No screen in this demo
  /// calls it; it is here for your own UI.
  Future<List<Map<String, dynamic>>> getPresence(List<String> userIds) async {
    try {
      final response = await _apiClient.client.get(
        '/presence',
        queryParameters: {'user_ids': userIds.join(',')},
      );
      final list = ((response.data as Map)['presence'] as List?) ?? const [];
      return list.whereType<Map>().map(Map<String, dynamic>.from).toList();
    } on DioException catch (e) {
      throw Exception('Failed to fetch presence: ${apiErrorMessage(e)}');
    }
  }
}
