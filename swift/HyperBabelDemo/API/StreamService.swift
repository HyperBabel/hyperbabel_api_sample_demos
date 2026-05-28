/*
 * HyperBabel API — Live Stream service.
 *
 * Wire shapes:
 *   POST /stream/sessions                   → { session: { id, channel_name, app_id, host: { uid, rtc_token } } }
 *   GET  /stream/sessions                   → { sessions: [{ id, title, host_user_id, host_name, viewer_count }, …] }
 *   POST /stream/sessions/:id/viewer-token  → { channel_name, uid, token, app_id, host_user_id, title }
 *   POST /stream/sessions/:id/start         → { … } (success ack)
 *   POST /stream/sessions/:id/end           → { … } (success ack)
 */
import Foundation

/// A row in the public list of active broadcasts. Doesn't carry RTC
/// credentials — callers must request a viewer token to join.
struct StreamSession: Codable, Identifiable {
    let sessionId: String?
    let id_: String?
    let title: String?
    let hostName: String?
    let hostUserId: String?
    let viewerCount: Int?
    /// `GET /stream/sessions` returns the host as a nested object on Workers
    /// (`{ host: { user_id, display_name } }`), unlike the legacy hb_api
    /// surface which spread `host_user_id` / `host_name` flat. Decode both
    /// shapes so the row renders regardless of which backend serves us.
    let host: StreamRowHost?

    var id: String { sessionId ?? id_ ?? UUID().uuidString }
    var resolvedHostName: String? { hostName ?? host?.displayName ?? host?.userId ?? hostUserId }
    var resolvedHostUserId: String? { hostUserId ?? host?.userId }

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case id_ = "id"
        case title
        case hostName = "host_name"
        case hostUserId = "host_user_id"
        case viewerCount = "viewer_count"
        case host
    }
}

struct StreamRowHost: Codable {
    let userId: String?
    let displayName: String?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case displayName = "display_name"
    }
}

struct StreamListResponse: Codable {
    let sessions: [StreamSession]?
}

/// Returned by `POST /stream/sessions`. The host receives a ready-to-use
/// publisher RTC token alongside the session metadata so it can start
/// broadcasting without an extra round-trip.
struct StreamCreateResponse: Codable {
    let session: StreamSessionDetail?
}

struct StreamSessionDetail: Codable {
    let id: String?
    let channelName: String?
    let title: String?
    let status: String?
    let appId: String?
    let host: StreamHostCredentials?

    enum CodingKeys: String, CodingKey {
        case id
        case channelName = "channel_name"
        case title, status
        case appId = "app_id"
        case host
    }
}

struct StreamHostCredentials: Codable {
    let userId: String?
    let displayName: String?
    let uid: Int?
    let rtcToken: String?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case displayName = "display_name"
        case uid
        case rtcToken = "rtc_token"
    }
}

/// Returned by `POST /stream/sessions/:id/viewer-token`. Flat shape (the
/// server doesn't wrap it under "session" the way the create endpoint does).
struct StreamViewerTokenResponse: Codable {
    let channelName: String?
    let uid: Int?
    let token: String?
    let appId: String?
    let hostUserId: String?
    let hostDisplayName: String?
    let title: String?

    enum CodingKeys: String, CodingKey {
        case channelName = "channel_name"
        case uid, token
        case appId = "app_id"
        case hostUserId = "host_user_id"
        case hostDisplayName = "host_display_name"
        case title
    }
}

/// Wire shape per cf_workers_api/src/routes/stream.ts createStreamSchema:
/// flat `{ title, host_user_id, host_display_name? }`. `title` is required
/// (zod min-length 1).
struct CreateStreamRequest: Codable {
    let title: String
    let hostUserId: String
    let hostDisplayName: String?

    enum CodingKeys: String, CodingKey {
        case title
        case hostUserId = "host_user_id"
        case hostDisplayName = "host_display_name"
    }
}

enum StreamService {
    static func list() async throws -> StreamListResponse {
        try await ApiClient.shared.request("GET", "/stream/sessions")
    }

    static func create(hostUserId: String, hostName: String, title: String?) async throws -> StreamCreateResponse {
        try await ApiClient.shared.request(
            "POST", "/stream/sessions",
            body: CreateStreamRequest(
                title: title?.isEmpty == false ? title! : "Live from \(hostName)",
                hostUserId: hostUserId,
                hostDisplayName: hostName.isEmpty ? nil : hostName
            )
        )
    }

    static func start(sessionId: String, hostUserId: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/stream/sessions/\(sessionId)/start",
            body: ["user_id": hostUserId]
        )
    }

    /// Heartbeat — call every ~30s while broadcasting. The server uses
    /// this to detect a host crash within minutes (instead of an 8h
    /// wall-clock fallback) and bill only the actual stream time.
    static func heartbeat(sessionId: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/stream/sessions/\(sessionId)/heartbeat",
            body: [String: String]()
        )
    }

    static func end(sessionId: String, hostUserId: String) async throws -> EmptyResponse {
        try await ApiClient.shared.request(
            "POST", "/stream/sessions/\(sessionId)/end",
            body: ["user_id": hostUserId]
        )
    }

    static func viewerToken(sessionId: String, userId: String) async throws -> StreamViewerTokenResponse {
        try await ApiClient.shared.request(
            "POST", "/stream/sessions/\(sessionId)/viewer-token",
            body: ["user_id": userId]
        )
    }
}
