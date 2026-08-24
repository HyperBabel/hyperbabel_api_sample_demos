import 'package:dio/dio.dart';
import 'api_client.dart';

/// Low-level Chat API — used by United Chat rooms for cross-cutting concerns
/// like emoji reactions that target a single message id rather than a room.
class ChatRepository {
  final ApiClient _apiClient = ApiClient();

  /// Add an emoji reaction to a message.
  /// Add an emoji reaction. ROOM-SCOPED on purpose — the `/chat/...` variant is
  /// server-to-server only and rejects the end-user (Session-Token) JWT this
  /// demo signs in with (403).
  ///
  /// Returns the FULL reaction map: `{ "👍": ["user_1", "user_2"] }`.
  Future<Map<String, List<String>>> addReaction({
    required String roomId,
    required String messageId,
    required String userId,
    required String emoji,
  }) async {
    try {
      final res = await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/messages/$messageId/reactions',
        data: {'user_id': userId, 'emoji': emoji},
      );
      return _parseReactions(res.data);
    } on DioException catch (e) {
      throw Exception('Failed to add reaction: ${e.message}');
    }
  }

  Map<String, List<String>> _parseReactions(dynamic data) {
    final raw = (data is Map ? data['reactions'] : null) as Map?;
    if (raw == null) return const {};
    return raw.map((k, v) => MapEntry(
          k as String,
          ((v as List?) ?? const []).map((e) => e.toString()).toList(),
        ));
  }

  /// Remove an emoji reaction from a message.
  /// Remove an emoji reaction. Same room-scoped path; returns the updated map.
  Future<Map<String, List<String>>> removeReaction({
    required String roomId,
    required String messageId,
    required String userId,
    required String emoji,
  }) async {
    try {
      final res = await _apiClient.client.delete(
        '/unitedchat/rooms/$roomId/messages/$messageId/reactions',
        data: {'user_id': userId, 'emoji': emoji},
      );
      return _parseReactions(res.data);
    } on DioException catch (e) {
      throw Exception('Failed to remove reaction: ${e.message}');
    }
  }
}
