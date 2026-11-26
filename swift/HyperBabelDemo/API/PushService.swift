/*
 * HyperBabel API — push notification token management.
 *
 * HyperBabel delivers push ONLY to FCM registration tokens — on iOS too. Send
 * the token Firebase Messaging gives you (`Messaging.messaging().token()`),
 * never the raw APNs device token and never a placeholder: tokens FCM rejects
 * are pruned on the next send. `PushRegistration.swift` shows the full flow.
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
    /// `token` must be an FCM registration token (`token_type: "fcm"`).
    /// `user_id` must be the signed-in user's own id.
    static func register(userId: String, token: String, platform: String = "ios") async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/push/register",
            body: ["user_id": userId, "token": token, "platform": platform, "token_type": "fcm"]
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
