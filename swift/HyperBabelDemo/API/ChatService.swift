/*
 * HyperBabel API — low-level Chat service. Used by United Chat rooms for
 * cross-cutting concerns (emoji reactions) that target a single message id.
 */
import Foundation

enum ChatService {
    static func addReaction(messageId: String, userId: String, emoji: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST",
            "/chat/messages/\(messageId)/reactions",
            body: ["user_id": userId, "emoji": emoji]
        )
    }

    static func removeReaction(messageId: String, userId: String, emoji: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "DELETE",
            "/chat/messages/\(messageId)/reactions",
            body: ["user_id": userId, "emoji": emoji]
        )
    }
}
