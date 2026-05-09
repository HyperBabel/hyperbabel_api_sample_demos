import 'package:dio/dio.dart';
import 'api_client.dart';

/// Low-level Chat API — used by United Chat rooms for cross-cutting concerns
/// like emoji reactions that target a single message id rather than a room.
class ChatRepository {
  final ApiClient _apiClient = ApiClient();

  /// Add an emoji reaction to a message.
  Future<void> addReaction({
    required String messageId,
    required String userId,
    required String emoji,
  }) async {
    try {
      await _apiClient.client.post(
        '/chat/messages/$messageId/reactions',
        data: {'user_id': userId, 'emoji': emoji},
      );
    } on DioException catch (e) {
      throw Exception('Failed to add reaction: ${e.message}');
    }
  }

  /// Remove an emoji reaction from a message.
  Future<void> removeReaction({
    required String messageId,
    required String userId,
    required String emoji,
  }) async {
    try {
      await _apiClient.client.delete(
        '/chat/messages/$messageId/reactions',
        data: {'user_id': userId, 'emoji': emoji},
      );
    } on DioException catch (e) {
      throw Exception('Failed to remove reaction: ${e.message}');
    }
  }
}
