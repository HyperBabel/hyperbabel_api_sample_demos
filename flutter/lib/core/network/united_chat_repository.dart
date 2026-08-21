import 'package:dio/dio.dart';
import 'api_client.dart';
import '../video/video_quality.dart';

/// Repository for HyperBabel United Chat REST APIs.
class UnitedChatRepository {
  final ApiClient _apiClient = ApiClient();

  // ── Rooms ────────────────────────────────────────────────────────────────

  /// Retrieve the rooms a user belongs to.
  Future<List<dynamic>> getRooms(String userId) async {
    try {
      final response = await _apiClient.client.get(
        '/unitedchat/rooms',
        queryParameters: {'user_id': userId},
      );
      final data = response.data as Map<String, dynamic>;
      return (data['rooms'] ?? data['member_rooms'] ?? []) as List<dynamic>;
    } on DioException catch (e) {
      throw Exception('Failed to fetch rooms: ${e.message}');
    }
  }

  /// Create a new chat room (1to1, group, open).
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
      final response =
          await _apiClient.client.post('/unitedchat/rooms', data: data);
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception('Failed to create room: ${e.message}');
    }
  }

  /// Leave a room. Owners must transfer ownership before they can leave.
  Future<void> leaveRoom(String roomId, String userId) async {
    try {
      await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/leave',
        data: {'user_id': userId},
      );
    } on DioException catch (e) {
      throw Exception('Failed to leave room: ${e.message}');
    }
  }

  /// List members of a room with their roles (owner / sub_admin / member).
  Future<List<dynamic>> getMembers(String roomId) async {
    try {
      final response =
          await _apiClient.client.get('/unitedchat/rooms/$roomId/members');
      final data = response.data as Map<String, dynamic>;
      return (data['members'] ?? []) as List<dynamic>;
    } on DioException catch (e) {
      throw Exception('Failed to fetch members: ${e.message}');
    }
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  /// Fetch paginated message history (newest first as the API returns it).
  Future<List<dynamic>> getMessages(String roomId,
      {String? userId, int limit = 50}) async {
    try {
      final response = await _apiClient.client.get(
        '/unitedchat/rooms/$roomId/messages',
        queryParameters: {
          'limit': limit,
          if (userId != null) 'user_id': userId,
        },
      );
      final data = response.data as Map<String, dynamic>;
      return (data['messages'] ?? []) as List<dynamic>;
    } on DioException catch (e) {
      throw Exception('Failed to fetch messages: ${e.message}');
    }
  }

  /// Send a text or media message to a room.
  Future<Map<String, dynamic>> sendMessage(
    String roomId, {
    required String senderId,
    String? senderName,
    required String content,
    String messageType = 'text',
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final response = await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/messages',
        data: {
          'sender_id': senderId,
          if (senderName != null) 'sender_name': senderName,
          'content': content,
          'message_type': messageType,
          if (metadata != null) 'metadata': metadata,
        },
      );
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception('Failed to send message: ${e.message}');
    }
  }

  /// Soft-delete a message (only the sender or owner/sub_admin can do this).
  Future<void> deleteMessage(
      String roomId, String messageId, String userId) async {
    try {
      await _apiClient.client.delete(
        '/unitedchat/rooms/$roomId/messages/$messageId',
        queryParameters: {'user_id': userId},
      );
    } on DioException catch (e) {
      throw Exception('Failed to delete message: ${e.message}');
    }
  }

  /// Edit a text message — only the original sender can edit.
  Future<void> editMessage(
    String roomId,
    String messageId, {
    required String userId,
    required String content,
  }) async {
    try {
      await _apiClient.client.put(
        '/unitedchat/rooms/$roomId/messages/$messageId',
        data: {'user_id': userId, 'content': content},
      );
    } on DioException catch (e) {
      throw Exception('Failed to edit message: ${e.message}');
    }
  }

  /// Mark the latest message in a room as read.
  Future<void> markAsRead(String roomId, String userId) async {
    try {
      await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/read',
        data: {'user_id': userId},
      );
    } on DioException catch (_) {
      // Best-effort — don't surface read-receipt failures to the user.
    }
  }

  /// Batch translate messages to a target language code.
  Future<List<dynamic>> batchTranslateMessages(
      String roomId, List<String> messageIds, String targetLangCd) async {
    try {
      final response = await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/messages/batch-translate',
        data: {
          'message_ids': messageIds,
          'target_lang_cd': targetLangCd,
        },
      );
      return (response.data['translated'] ?? []) as List<dynamic>;
    } on DioException catch (e) {
      throw Exception('Failed to translate messages: ${e.message}');
    }
  }

  // ── Video call lifecycle (subset used by the demo) ───────────────────────

  /// Start a video call in this room. The server broadcasts a CALL_INVITE
  /// to every other member's private channel. Pass [targetUserIds] for
  /// group calls — omit it to ring the whole room.
  Future<Map<String, dynamic>?> startVideoCall(
    String roomId,
    String callerId, {
    List<String>? targetUserIds,
  }) async {
    try {
      final response = await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/video-call',
        data: {
          'caller_id': callerId,
          if (targetUserIds != null && targetUserIds.isNotEmpty)
            'target_user_ids': targetUserIds,
          // Billing tier for this call. Derived from the publishing preset in
          // core/video/video_quality.dart so the declared tier always matches
          // the pixels actually sent — change both in that file, never just one.
          'quality': VideoQuality.declaredQualityWire(),
          // Optional self-check: what we will actually publish at this call
          // size. The server multiplies it by the streams each participant
          // receives and returns `quality_warning` when the total exceeds the
          // tier above. Never the billing basis — `quality` is.
          'publish_resolution': VideoQuality.publishResolutionFor(
            1 + ((targetUserIds != null && targetUserIds.isNotEmpty) ? targetUserIds.length : 1),
          ),
        },
      );
      return response.data is Map ? Map<String, dynamic>.from(response.data) : null;
    } on DioException catch (e) {
      throw Exception('Failed to start call: ${e.message}');
    }
  }

  /// Decline an incoming video call so the server stops ringing the user.
  Future<void> rejectVideoCall(String roomId, String userId) async {
    try {
      await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/video-call/reject',
        data: {'user_id': userId},
      );
    } on DioException catch (e) {
      throw Exception('Failed to reject call: ${e.message}');
    }
  }

  /// Look up the active video call session for a room (or null if none).
  Future<Map<String, dynamic>?> getActiveVideoCall(String roomId) async {
    try {
      final response = await _apiClient.client
          .get('/unitedchat/rooms/$roomId/video-call/active');
      final data = response.data;
      if (data is Map) {
        final m = Map<String, dynamic>.from(data);
        // Server sometimes returns { session: null } when nothing's active.
        return (m['session'] is Map) ? m : null;
      }
      return null;
    } on DioException catch (e) {
      throw Exception('Failed to fetch active call: ${e.message}');
    }
  }

  // ── Moderation: Ban ──────────────────────────────────────────────────────

  /// Ban a user from the room (owner / sub_admin only).
  Future<void> banUser(String roomId, String adminId, String userId) async {
    try {
      await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/ban',
        data: {'admin_id': adminId, 'user_id': userId},
      );
    } on DioException catch (e) {
      throw Exception('Failed to ban user: ${e.message}');
    }
  }

  /// Lift a ban — the user can rejoin afterwards.
  Future<void> unbanUser(String roomId, String userId) async {
    try {
      await _apiClient.client
          .delete('/unitedchat/rooms/$roomId/ban/$userId');
    } on DioException catch (e) {
      throw Exception('Failed to unban user: ${e.message}');
    }
  }

  // ── Notifications: Mute ─────────────────────────────────────────────────

  /// Mute push notifications for a room. Pass [durationMinutes] for a
  /// timed mute, or omit for an indefinite mute.
  Future<void> muteRoom(String roomId, String userId,
      {int? durationMinutes}) async {
    try {
      await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/mute',
        data: {
          'user_id': userId,
          if (durationMinutes != null) 'duration_minutes': durationMinutes,
        },
      );
    } on DioException catch (e) {
      throw Exception('Failed to mute room: ${e.message}');
    }
  }

  /// Unmute push notifications for a room.
  Future<void> unmuteRoom(String roomId, String userId) async {
    try {
      await _apiClient.client.delete(
        '/unitedchat/rooms/$roomId/mute',
        data: {'user_id': userId},
      );
    } on DioException catch (e) {
      throw Exception('Failed to unmute room: ${e.message}');
    }
  }

  /// Check the current user's mute status for a room.
  Future<Map<String, dynamic>> getMuteStatus(
      String roomId, String userId) async {
    try {
      final response = await _apiClient.client
          .get('/unitedchat/rooms/$roomId/mute/$userId');
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception('Failed to get mute status: ${e.message}');
    }
  }

  // ── Typing indicator ─────────────────────────────────────────────────────

  /// Tell the server the user is typing in [roomId]. The server fans out a
  /// `typing` event on the room's real-time channel, throttled per the
  /// receiver's typing prefs.
  Future<void> sendTypingIndicator(
      String roomId, String userId, String? userName) async {
    try {
      await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/typing',
        data: {
          'user_id': userId,
          if (userName != null) 'display_name': userName,
        },
      );
    } on DioException catch (_) {
      // Best-effort — typing events are not critical.
    }
  }

  // ── Reply helper ─────────────────────────────────────────────────────────

  /// Send a message that quotes another. Identical to [sendMessage] except
  /// for the explicit `reply_to` field.
  Future<Map<String, dynamic>> sendReply(
    String roomId, {
    required String senderId,
    String? senderName,
    required String content,
    required String replyTo,
  }) {
    return sendMessage(
      roomId,
      senderId: senderId,
      senderName: senderName,
      content: content,
      messageType: 'text',
      metadata: {'reply_to': replyTo},
    );
  }

  // ── Sub-admin promotion (owner only) ─────────────────────────────────────

  /// Promote a member to sub_admin (owner only).
  Future<void> addSubAdmin(String roomId, String ownerId, String userId) async {
    try {
      await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/sub-admins',
        data: {'owner_id': ownerId, 'user_id': userId},
      );
    } on DioException catch (e) {
      throw Exception('Failed to promote: ${e.message}');
    }
  }

  /// Demote a sub_admin back to member (owner only).
  Future<void> removeSubAdmin(String roomId, String userId) async {
    try {
      await _apiClient.client
          .delete('/unitedchat/rooms/$roomId/sub-admins/$userId');
    } on DioException catch (e) {
      throw Exception('Failed to demote: ${e.message}');
    }
  }

  // ── Freeze ───────────────────────────────────────────────────────────────

  /// Freeze the room — only owner / sub_admin can post afterwards.
  Future<void> freezeRoom(String roomId, String userId) async {
    try {
      await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/freeze',
        data: {'user_id': userId},
      );
    } on DioException catch (e) {
      throw Exception('Failed to freeze room: ${e.message}');
    }
  }

  /// Lift a room freeze.
  Future<void> unfreezeRoom(String roomId, String userId) async {
    try {
      await _apiClient.client.delete(
        '/unitedchat/rooms/$roomId/freeze',
        data: {'user_id': userId},
      );
    } on DioException catch (e) {
      throw Exception('Failed to unfreeze room: ${e.message}');
    }
  }
}
