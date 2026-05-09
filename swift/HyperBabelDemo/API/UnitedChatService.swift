/*
 * HyperBabel API — United Chat service.
 *
 * Covers the room and message endpoints used by this demo. The full surface
 * is documented at https://hyperbabel.com/docs.
 */
import Foundation

enum UnitedChatService {
    static func listRooms(userId: String) async throws -> RoomListResponse {
        try await ApiClient.shared.request(
            "GET", "/unitedchat/rooms",
            query: [("user_id", userId)]
        )
    }

    static func createRoom(_ body: CreateRoomRequest) async throws -> Room {
        try await ApiClient.shared.request("POST", "/unitedchat/rooms", body: body)
    }

    static func getRoom(roomId: String, userId: String) async throws -> Room {
        try await ApiClient.shared.request(
            "GET", "/unitedchat/rooms/\(roomId)",
            query: [("user_id", userId)]
        )
    }

    static func sendMessage(roomId: String, body: SendMessageRequest) async throws -> Message {
        try await ApiClient.shared.request("POST", "/unitedchat/rooms/\(roomId)/messages", body: body)
    }

    static func getMessages(roomId: String, userId: String, limit: Int = 50) async throws -> MessageListResponse {
        try await ApiClient.shared.request(
            "GET", "/unitedchat/rooms/\(roomId)/messages",
            query: [("user_id", userId), ("limit", "\(limit)")]
        )
    }

    static func markRead(roomId: String, userId: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/unitedchat/rooms/\(roomId)/read",
            body: ["user_id": userId]
        )
    }

    static func startVideoCall(roomId: String, body: StartVideoCallRequest) async throws -> EmptyResponse {
        try await ApiClient.shared.request("POST", "/unitedchat/rooms/\(roomId)/video-call", body: body)
    }

    static func acceptVideoCall(roomId: String, userId: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/unitedchat/rooms/\(roomId)/video-call/accept",
            body: ["user_id": userId]
        )
    }

    static func rejectVideoCall(roomId: String, userId: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/unitedchat/rooms/\(roomId)/video-call/reject",
            body: ["user_id": userId]
        )
    }

    static func endVideoCall(roomId: String, userId: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/unitedchat/rooms/\(roomId)/video-call/end",
            body: ["user_id": userId]
        )
    }

    static func leaveVideoCall(roomId: String, userId: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/unitedchat/rooms/\(roomId)/video-call/leave",
            body: ["user_id": userId]
        )
    }

    static func getActiveVideoCall(roomId: String) async throws -> ActiveVideoCallResponse {
        try await ApiClient.shared.request("GET", "/unitedchat/rooms/\(roomId)/video-call/active")
    }

    static func batchTranslateMessages(
        roomId: String, messageIds: [String], targetLangCd: String
    ) async throws -> EmptyResponse {
        struct Body: Codable { let message_ids: [String]; let target_lang: String }
        return try await ApiClient.shared.request(
            "POST",
            "/unitedchat/rooms/\(roomId)/messages/batch-translate",
            // Server zod field is `target_lang`, not `target_lang_cd`.
            body: Body(message_ids: messageIds, target_lang: targetLangCd)
        )
    }

    static func deleteMessage(roomId: String, messageId: String, userId: String) async throws -> EmptyResponse {
        // Server reads `user_id` from body, not query string.
        try await ApiClient.shared.request(
            "DELETE",
            "/unitedchat/rooms/\(roomId)/messages/\(messageId)",
            body: ["user_id": userId]
        )
    }

    static func editMessage(roomId: String, messageId: String, userId: String, content: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "PUT",
            "/unitedchat/rooms/\(roomId)/messages/\(messageId)",
            body: ["user_id": userId, "content": content]
        )
    }

    static func sendTyping(roomId: String, userId: String, displayName: String?) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/unitedchat/rooms/\(roomId)/typing",
            body: ["user_id": userId, "display_name": displayName ?? userId]
        )
    }

    static func leaveRoom(roomId: String, userId: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/unitedchat/rooms/\(roomId)/leave",
            body: ["user_id": userId]
        )
    }

    struct MembersResponse: Codable {
        let members: [RoomMember]?
    }
    struct RoomMember: Codable, Identifiable {
        let userId: String
        let userName: String?
        let role: String
        var id: String { userId }
        enum CodingKeys: String, CodingKey {
            case userId = "user_id"
            case userName = "user_name"
            case role
        }
    }
    static func getMembers(roomId: String) async throws -> MembersResponse {
        try await ApiClient.shared.request("GET", "/unitedchat/rooms/\(roomId)/members")
    }

    static func ban(roomId: String, adminId: String, userId: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/unitedchat/rooms/\(roomId)/ban",
            body: ["admin_id": adminId, "user_id": userId]
        )
    }
    static func unban(roomId: String, userId: String, unbannedBy: String) async throws -> EmptyResponse {
        // Server requires { unbanned_by } in the request body.
        try await ApiClient.shared.request(
            "DELETE", "/unitedchat/rooms/\(roomId)/ban/\(userId)",
            body: ["unbanned_by": unbannedBy]
        )
    }
    static func addSubAdmin(roomId: String, ownerId: String, userId: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/unitedchat/rooms/\(roomId)/sub-admins",
            body: ["owner_id": ownerId, "user_id": userId]
        )
    }
    static func removeSubAdmin(roomId: String, userId: String, ownerId: String) async throws -> EmptyResponse {
        // Server requires { owner_id } in the request body.
        try await ApiClient.shared.request(
            "DELETE", "/unitedchat/rooms/\(roomId)/sub-admins/\(userId)",
            body: ["owner_id": ownerId]
        )
    }
    static func freezeRoom(roomId: String, userId: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/unitedchat/rooms/\(roomId)/freeze",
            body: ["user_id": userId]
        )
    }
    static func unfreezeRoom(roomId: String, userId: String) async throws -> EmptyResponse {
        // Server requires { user_id } in the request body.
        try await ApiClient.shared.request(
            "DELETE", "/unitedchat/rooms/\(roomId)/freeze",
            body: ["user_id": userId]
        )
    }

    struct MuteRequest: Codable {
        let userId: String
        let durationMinutes: Int?
        enum CodingKeys: String, CodingKey {
            case userId = "user_id"
            case durationMinutes = "duration_minutes"
        }
    }
    struct MuteStatus: Codable {
        let isMuted: Bool?
        let mutedUntil: String?
        enum CodingKeys: String, CodingKey {
            case isMuted = "is_muted"
            case mutedUntil = "muted_until"
        }
    }
    static func mute(roomId: String, userId: String, durationMinutes: Int? = nil) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/unitedchat/rooms/\(roomId)/mute",
            body: MuteRequest(userId: userId, durationMinutes: durationMinutes)
        )
    }
    static func unmute(roomId: String, userId: String) async throws -> EmptyResponse {
        // Server requires { user_id } in the request body.
        try await ApiClient.shared.request(
            "DELETE", "/unitedchat/rooms/\(roomId)/mute",
            body: ["user_id": userId]
        )
    }
    static func muteStatus(roomId: String, userId: String) async throws -> MuteStatus {
        try await ApiClient.shared.request("GET", "/unitedchat/rooms/\(roomId)/mute/\(userId)")
    }
}
