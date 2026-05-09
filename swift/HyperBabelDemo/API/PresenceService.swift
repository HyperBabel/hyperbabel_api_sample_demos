/*
 * HyperBabel API — Presence service.
 */
import Foundation

enum PresenceService {
    static func heartbeat(userId: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/presence/heartbeat",
            body: PresenceHeartbeat(userId: userId)
        )
    }

    static func setStatus(userId: String, status: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/presence/status",
            body: ["user_id": userId, "status": status]
        )
    }

    static func list(userIds: [String]) async throws -> [String: String] {
        try await ApiClient.shared.request(
            "GET", "/presence",
            query: [("user_ids", userIds.joined(separator: ","))]
        )
    }
}
