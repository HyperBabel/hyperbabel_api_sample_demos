/*
 * HyperBabel API — push notification token management.
 */
import Foundation

struct PushToken: Codable, Identifiable {
    var id: String { token }
    let token: String
    let platform: String
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case token, platform
        case createdAt = "created_at"
    }
}

struct PushTokenList: Codable {
    let tokens: [PushToken]?
}

enum PushService {
    static func register(userId: String, token: String, platform: String = "ios") async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/push/register",
            body: ["user_id": userId, "token": token, "platform": platform]
        )
    }

    static func unregister(userId: String, token: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "DELETE", "/push/unregister",
            body: ["user_id": userId, "token": token]
        )
    }

    static func getTokens(userId: String) async throws -> PushTokenList {
        try await ApiClient.shared.request(
            "GET", "/push/tokens",
            query: [("user_id", userId)]
        )
    }
}
