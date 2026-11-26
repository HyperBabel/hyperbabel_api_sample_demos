/*
 * HyperBabel API — the signed-in user's own profile, and the global block
 * list (blocks apply across rooms).
 */
import Foundation

/// The part of `PATCH /customer/users/me`'s response this demo reads.
struct MyProfile: Codable {
    let displayName: String?

    enum CodingKeys: String, CodingKey {
        case displayName = "display_name"
    }
}

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
    /// Set the name other members see — PATCH /customer/users/me (1–60 chars).
    ///
    /// On first sign-in HyperBabel names the user after the Firebase account
    /// (its display name, or else its EMAIL). Send the name the user typed
    /// right after the token exchange so the email is never shown to others.
    static func updateMyDisplayName(_ name: String) async throws -> MyProfile {
        try await ApiClient.shared.request(
            "PATCH", "/customer/users/me",
            body: ["display_name": name]
        )
    }

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
