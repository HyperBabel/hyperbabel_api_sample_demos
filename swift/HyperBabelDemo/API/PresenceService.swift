/*
 * HyperBabel API — Presence service.
 */
import Foundation

/// One row of `GET /presence?user_ids=…`. Unknown users and users whose last
/// heartbeat is older than `offline_threshold_seconds` report `offline`.
struct PresenceEntry: Codable, Identifiable {
    let userId: String
    /// `online` | `away` | `dnd` | `offline`.
    let status: String
    let lastSeen: String?
    let device: String?

    var id: String { userId }

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case status
        case lastSeen = "last_seen"
        case device
    }
}

/// `GET /presence?user_ids=a,b` → `{ presence: [...], offline_threshold_seconds }`.
struct PresenceListResponse: Codable {
    let presence: [PresenceEntry]
    let offlineThresholdSeconds: Int?

    enum CodingKeys: String, CodingKey {
        case presence
        case offlineThresholdSeconds = "offline_threshold_seconds"
    }
}

enum PresenceService {
    /// Send every 30 s while the app is in use. Keeps an `away` / `dnd`
    /// status as it is; only `offline` turns back into `online`.
    static func heartbeat(userId: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/presence/heartbeat",
            body: PresenceHeartbeat(userId: userId)
        )
    }

    /// `status`: `online` | `away` | `dnd` | `offline`.
    static func setStatus(userId: String, status: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/presence/status",
            body: ["user_id": userId, "status": status]
        )
    }

    /// Bulk read, up to 100 ids per call.
    static func list(userIds: [String]) async throws -> PresenceListResponse {
        try await ApiClient.shared.request(
            "GET", "/presence",
            query: [("user_ids", userIds.joined(separator: ","))]
        )
    }
}
