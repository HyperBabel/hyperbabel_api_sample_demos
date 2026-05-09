/*
 * HyperBabel API — global block list endpoints. Blocks apply across rooms.
 */
import Foundation

struct BlockedUser: Codable, Identifiable {
    var id: String { blockedId }
    let blockedId: String
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case blockedId = "blocked_id"
        case createdAt = "created_at"
    }
}

struct BlockListResponse: Codable {
    let blockedUsers: [BlockedUser]?

    enum CodingKeys: String, CodingKey {
        case blockedUsers = "blocked_users"
    }
}

enum UsersService {
    static func block(blockerId: String, blockedId: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/users/block",
            body: ["blocker_id": blockerId, "blocked_id": blockedId]
        )
    }

    static func unblock(blockerId: String, blockedId: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "DELETE", "/users/block",
            body: ["blocker_id": blockerId, "blocked_id": blockedId]
        )
    }

    static func getBlockList(userId: String) async throws -> BlockListResponse {
        try await ApiClient.shared.request("GET", "/users/\(userId)/blocks")
    }
}
