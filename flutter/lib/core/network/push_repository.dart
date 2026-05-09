import 'package:dio/dio.dart';
import 'api_client.dart';

/// Repository for push notification token management.
///
/// FCM (Android) / APNs (iOS) tokens are registered per user — call after
/// login and on every token rotation. The platform wires the rest.
class PushRepository {
  final ApiClient _apiClient = ApiClient();

  Future<void> registerToken({
    required String userId,
    required String token,
    required String platform, // 'ios' | 'android' | 'web'
  }) async {
    try {
      await _apiClient.client.post(
        '/push/register',
        data: {'user_id': userId, 'token': token, 'platform': platform},
      );
    } on DioException catch (e) {
      throw Exception('Failed to register push token: ${e.message}');
    }
  }

  Future<void> unregisterToken({
    required String userId,
    required String token,
  }) async {
    try {
      await _apiClient.client.delete(
        '/push/unregister',
        data: {'user_id': userId, 'token': token},
      );
    } on DioException catch (e) {
      throw Exception('Failed to unregister push token: ${e.message}');
    }
  }

  Future<List<Map<String, dynamic>>> getTokens(String userId) async {
    try {
      final response = await _apiClient.client.get(
        '/push/tokens',
        queryParameters: {'user_id': userId},
      );
      final data = response.data as Map<String, dynamic>;
      final list = (data['tokens'] ?? []) as List<dynamic>;
      return list.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception('Failed to fetch push tokens: ${e.message}');
    }
  }
}
