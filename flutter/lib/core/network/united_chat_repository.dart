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
      // `{ rooms, open_rooms }` — `open_rooms` (public rooms to join) is not used here.
      return (data['rooms'] ?? []) as List<dynamic>;
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

  /// Fetch a single room, including its `realtime_channel`.
  ///
  /// The real-time channel name CANNOT be derived from the room id — always
  /// read it from this endpoint and pass it to `subscribeRoom()` verbatim.
  Future<Map<String, dynamic>> getRoom(String roomId) async {
    try {
      final response =
          await _apiClient.client.get('/unitedchat/rooms/$roomId');
      final data = response.data as Map<String, dynamic>;
      return (data['room'] ?? data) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception('Failed to fetch room: ${e.message}');
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

  /// Send a text or media message to a room. Pass [replyTo] (the quoted
  /// message's `id`) to send a reply — it is a top-level field, not metadata.
  ///
  /// Returns the stored message. The API wraps it as `{ message: { ... } }`.
  Future<Map<String, dynamic>> sendMessage(
    String roomId, {
    required String senderId,
    String? senderName,
    required String content,
    String messageType = 'text',
    String? replyTo,
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
          if (replyTo != null) 'reply_to': replyTo,
          if (metadata != null) 'metadata': metadata,
        },
      );
      final data = response.data as Map<String, dynamic>;
      return Map<String, dynamic>.from((data['message'] ?? data) as Map);
    } on DioException catch (e) {
      throw Exception('Failed to send message: ${e.message}');
    }
  }

  /// Soft-delete a message (only the sender or owner/sub_admin can do this).
  /// `user_id` travels in a JSON body — the endpoint does not read the query.
  Future<void> deleteMessage(
      String roomId, String messageId, String userId) async {
    try {
      await _apiClient.client.delete(
        '/unitedchat/rooms/$roomId/messages/$messageId',
        data: {'user_id': userId},
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

  /// Batch translate up to 100 messages of this room to a target language
  /// code. This is the end-user translation endpoint — the `/translate/*`
  /// APIs need your organization API key and belong on your backend.
  ///
  /// Returns `{ messageId: translatedText }`. Messages that need no
  /// translation (already in the target language, media, …) are absent. The
  /// response's `limited: true` flag — set when the daily translation limit
  /// stopped new translations — is not surfaced by this helper.
  Future<Map<String, String>> batchTranslateMessages(
      String roomId, List<String> messageIds, String targetLang) async {
    try {
      final response = await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/messages/batch-translate',
        data: {
          'message_ids': messageIds,
          'target_lang': targetLang,
        },
      );
      final raw = (response.data as Map)['translations'];
      if (raw is! Map) return const {};
      return raw.map((k, v) => MapEntry('$k', '$v'));
    } on DioException catch (e) {
      throw Exception('Failed to translate messages: ${e.message}');
    }
  }

  // ── Video call lifecycle (subset used by the demo) ───────────────────────

  /// Start a video call in this room. The server sends a `CALL_INVITE`
  /// signal to each callee's private channel. In a 1:1 room the other member
  /// is rung — send no targets. A group room REQUIRES [targetUserIds] (400
  /// without them), at most 2 of them: a call holds 3 people at most.
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

  /// Accept an incoming video call. [sessionId] is the `sessionId` carried by
  /// the `CALL_INVITE` signal; the API answers 400 without it, and 410 when
  /// the call has already ended.
  Future<void> acceptVideoCall(
    String roomId, {
    required String userId,
    required String sessionId,
  }) async {
    try {
      await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/video-call/accept',
        data: {'user_id': userId, 'session_id': sessionId},
      );
    } on DioException catch (e) {
      if (e.response?.statusCode == 410) {
        throw Exception('This call has already ended.');
      }
      throw Exception('Failed to accept call: ${e.message}');
    }
  }

  /// Decline an incoming video call. [sessionId] is the `sessionId` carried
  /// by the `CALL_INVITE` signal. Pass [reason] `'missed'` when the call rang
  /// out unanswered (`'busy'` is the other special value). The server posts
  /// `call_rejected` / `call_missed` / `call_busy` to the room; the session
  /// itself stays open.
  Future<void> rejectVideoCall(
    String roomId, {
    required String userId,
    required String sessionId,
    String? reason,
  }) async {
    try {
      await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/video-call/reject',
        data: {
          'user_id': userId,
          'session_id': sessionId,
          if (reason != null) 'reason': reason,
        },
      );
    } on DioException catch (e) {
      throw Exception('Failed to reject call: ${e.message}');
    }
  }

  /// Tell the server this device reached the RTC channel — call once from the
  /// video engine's join-success event. The stamp is how HyperBabel knows the
  /// call connected (billing and stale-call cleanup both rely on it).
  /// Returns `matched`: false means it did not land yet, so retry.
  Future<bool> markJoinedRtc(
    String roomId, {
    required String userId,
    required String sessionId,
  }) async {
    try {
      final response = await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/video-call/joined-rtc',
        data: {'user_id': userId, 'session_id': sessionId},
      );
      return (response.data as Map)['matched'] == true;
    } on DioException catch (e) {
      throw Exception('Failed to mark RTC join: ${e.message}');
    }
  }

  /// Liveness ping — every 60 s while on the call screen. The server ends a
  /// call whose newest ping is 10 minutes old. A ping the server could not
  /// store still answers 200 (`success: false`) — the next one corrects it.
  Future<void> sendCallHeartbeat(
    String roomId, {
    required String userId,
    required String sessionId,
  }) async {
    try {
      await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/video-call/heartbeat',
        data: {'user_id': userId, 'session_id': sessionId},
      );
    } on DioException catch (e) {
      throw Exception('Failed to send call heartbeat: ${e.message}');
    }
  }

  /// A fresh 1-hour RTC token for this user's slot in the call:
  /// `{ session_id, channel_name, uid, rtc_token, app_id, expires_in }`.
  /// 404 once the call is no longer live, 403 for a non-participant.
  Future<Map<String, dynamic>> renewCallToken(
    String roomId, {
    required String userId,
    required String sessionId,
  }) async {
    try {
      final response = await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/video-call/renew-token',
        data: {'user_id': userId, 'session_id': sessionId},
      );
      return Map<String, dynamic>.from(response.data as Map);
    } on DioException catch (e) {
      throw Exception('Failed to renew call token: ${e.message}');
    }
  }

  /// Hang up: leave the CALL (not the chat room — that is [leaveRoom]).
  /// Any participant may leave; once at most one active participant remains,
  /// the server ends the session for everyone.
  Future<void> leaveVideoCall(
    String roomId, {
    required String userId,
    required String sessionId,
  }) async {
    try {
      await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/video-call/leave',
        data: {'user_id': userId, 'session_id': sessionId},
      );
    } on DioException catch (e) {
      throw Exception('Failed to leave call: ${e.message}');
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

  /// Ban a user from the room (owner / sub_admin only). [bannedBy] is the
  /// moderator acting — the signed-in user.
  Future<void> banUser(String roomId, String bannedBy, String userId) async {
    try {
      await _apiClient.client.post(
        '/unitedchat/rooms/$roomId/ban',
        data: {'banned_by': bannedBy, 'user_id': userId},
      );
    } on DioException catch (e) {
      throw Exception('Failed to ban user: ${e.message}');
    }
  }

  /// Lift a ban — the user can rejoin afterwards. [unbannedBy] is the
  /// moderator acting (owner / sub_admin), sent in a JSON body.
  Future<void> unbanUser(
      String roomId, String unbannedBy, String userId) async {
    try {
      await _apiClient.client.delete(
        '/unitedchat/rooms/$roomId/ban/$userId',
        data: {'unbanned_by': unbannedBy},
      );
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
  /// for the explicit `reply_to` field (the quoted message's `id`).
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
      replyTo: replyTo,
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

  /// Demote a sub_admin back to member (owner only). [ownerId] is the room
  /// owner acting — the signed-in user — sent in a JSON body.
  Future<void> removeSubAdmin(
      String roomId, String ownerId, String userId) async {
    try {
      await _apiClient.client.delete(
        '/unitedchat/rooms/$roomId/sub-admins/$userId',
        data: {'owner_id': ownerId},
      );
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
