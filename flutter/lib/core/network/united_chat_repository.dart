import 'package:dio/dio.dart';
import 'api_client.dart';

/// Repository for HyperBabel United Chat REST APIs.
class UnitedChatRepository {
  final ApiClient _apiClient = ApiClient();

  /// Retrieve available rooms for the user
  Future<List<dynamic>> getRooms(String userId) async {
    try {
      final response = await _apiClient.client.get('/unitedchat/rooms', queryParameters: {'user_id': userId});
      return response.data['rooms'] ?? [];
    } on DioException catch (e) {
      throw Exception('Failed to fetch rooms: ${e.message}');
    }
  }

  /// Create a new chat room (1to1, group, open)
  Future<Map<String, dynamic>> createRoom({
    required String roomType,
    required String creatorId,
    String? roomName,
    List<String>? members,
  }) async {
    try {
      final data = {
        'room_type': roomType,
        'creator_id': creatorId,
        if (roomName != null) 'room_name': roomName,
        if (members != null) 'members': members,
      };
      final response = await _apiClient.client.post('/unitedchat/rooms', data: data);
      return response.data;
    } on DioException catch (e) {
      throw Exception('Failed to create room: ${e.message}');
    }
  }

  /// Batch translate messages to a target language code
  Future<List<dynamic>> batchTranslateMessages(String roomId, List<String> messageIds, String targetLangCd) async {
    try {
      final response = await _apiClient.client.post(
        '/unitedchat/messages/batch-translate',
        data: {
          'room_id': roomId,
          'message_ids': messageIds,
          'target_lang_cd': targetLangCd,
        },
      );
      return response.data['translated'] ?? [];
    } on DioException catch (e) {
      throw Exception('Failed to translate messages: ${e.message}');
    }
  }
}
