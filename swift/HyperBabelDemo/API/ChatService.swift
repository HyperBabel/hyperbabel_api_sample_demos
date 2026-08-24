/*
 * HyperBabel API — emoji reactions on United Chat room messages.
 *
 * Emoji reactions are ROOM-SCOPED.
 *
 * Use `/unitedchat/rooms/:roomId/messages/:messageId/reactions`, not the
 * `/chat/...` variant. The `/chat` route is server-to-server only and rejects
 * end-user (Session-Token) JWTs — which is what this demo signs in with, so
 * it would fail with 403.
 *
 * The response is the FULL reaction map for that message:
 *   { "reactions": { "👍": ["user_1", "user_2"] } }
 */
import Foundation

enum ChatService {
    struct ReactionsResponse: Decodable {
        /// Map of emoji → the user ids that reacted with it.
        let reactions: [String: [String]]
    }

    static func addReaction(roomId: String, messageId: String, userId: String, emoji: String) async throws -> ReactionsResponse {
        try await ApiClient.shared.request(
            "POST",
            "/unitedchat/rooms/\(roomId)/messages/\(messageId)/reactions",
            body: ["user_id": userId, "emoji": emoji]
        )
    }

    static func removeReaction(roomId: String, messageId: String, userId: String, emoji: String) async throws -> ReactionsResponse {
        try await ApiClient.shared.request(
            "DELETE",
            "/unitedchat/rooms/\(roomId)/messages/\(messageId)/reactions",
            body: ["user_id": userId, "emoji": emoji]
        )
    }
}
