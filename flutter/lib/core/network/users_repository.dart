import 'package:dio/dio.dart';
import 'api_client.dart';

/// Repository for the global block list endpoints.
///
/// Blocks are scoped per (blocker, blocked) pair and apply across every room.
class UsersRepository {
  final ApiClient _apiClient = ApiClient();

  Future<void> blockUser(String blockerId, String blockedId) async {
    try {
      await _apiClient.client.post(
        '/users/block',
        data: {'blocker_id': blockerId, 'blocked_id': blockedId},
      );
    } on DioException catch (e) {
      throw Exception('Failed to block user: ${e.message}');
    }
  }

  Future<void> unblockUser(String blockerId, String blockedId) async {
    try {
      await _apiClient.client.delete(
        '/users/block',
        data: {'blocker_id': blockerId, 'blocked_id': blockedId},
      );
    } on DioException catch (e) {
      throw Exception('Failed to unblock user: ${e.message}');
    }
  }

  Future<List<Map<String, dynamic>>> getBlockList(String userId) async {
    try {
      final response = await _apiClient.client.get('/users/$userId/blocks');
      final data = response.data as Map<String, dynamic>;
      final list = (data['blocked_users'] ?? []) as List<dynamic>;
      return list.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception('Failed to fetch block list: ${e.message}');
    }
  }
}
