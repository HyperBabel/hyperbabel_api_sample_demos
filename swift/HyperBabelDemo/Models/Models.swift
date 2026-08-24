/*
 * HyperBabel API — wire types.
 *
 * Only the fields the demo actually reads are declared. The server may add
 * additional fields without breaking us because Swift's JSONDecoder ignores
 * unknown keys by default.
 */
import Foundation

struct Room: Codable, Hashable, Identifiable {
    let id: String
    let roomType: String
    let roomName: String?
    let memberCount: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case roomType = "room_type"
        case roomName = "room_name"
        case memberCount = "member_count"
    }
}

struct RoomListResponse: Codable {
    let rooms: [Room]?
    let memberRooms: [Room]?

    enum CodingKeys: String, CodingKey {
        case rooms
        case memberRooms = "member_rooms"
    }
}

struct CreateRoomRequest: Codable {
    let roomType: String
    let creatorId: String
    let roomName: String?
    let members: [String]?

    enum CodingKeys: String, CodingKey {
        case roomType = "room_type"
        case creatorId = "creator_id"
        case roomName = "room_name"
        case members
    }
}

/// The server sends reactions as a MAP — `{ "👍": ["user_1", "user_2"] }` —
/// not as a list of objects. `Message.reactions` uses that shape directly.
typealias ReactionMap = [String: [String]]

struct MessageMetadata: Codable, Hashable {
    let url: String?
    let filename: String?
    let mimeType: String?
    let size: Int?
    let replyTo: String?

    enum CodingKeys: String, CodingKey {
        case url, filename, size
        case mimeType = "mime_type"
        case replyTo = "reply_to"
    }
}

struct Message: Codable, Hashable, Identifiable {
    let id: String
    let senderId: String
    let senderName: String?
    let content: String?
    let messageType: String?
    let createdAt: String?
    let updatedAt: String?
    let deletedAt: String?
    /// emoji → the user ids that reacted with it.
    var reactions: ReactionMap?
    let metadata: MessageMetadata?

    enum CodingKeys: String, CodingKey {
        case id
        case senderId = "sender_id"
        case senderName = "sender_name"
        case content
        case messageType = "message_type"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
        case reactions
        case metadata
    }
}

struct MessageListResponse: Codable {
    let messages: [Message]?
}

struct SendMessageRequest: Codable {
    let senderId: String
    let senderName: String?
    let content: String
    let messageType: String

    enum CodingKeys: String, CodingKey {
        case senderId = "sender_id"
        case senderName = "sender_name"
        case content
        case messageType = "message_type"
    }
}

struct StartVideoCallRequest: Codable {
    let callerId: String
    let targetUserIds: [String]
    /// Billing tier for this call: "hd" (default) | "fhd" | "2k" | "2k_plus".
    /// Declare the tier that matches what you actually publish — the default
    /// comes from `VideoQuality.declaredQuality()`, which is derived from the
    /// same presets the client publishes with.
    let quality: String
    /// OPTIONAL self-check: what this client will actually publish at this call
    /// size. The server multiplies it by the streams each participant receives
    /// and returns `quality_warning` when the total exceeds `quality`. Never the
    /// billing basis — `quality` is.
    let publishResolution: PublishResolution

    init(callerId: String, targetUserIds: [String],
         quality: String = VideoQuality.declaredQuality(),
         publishResolution: PublishResolution? = nil) {
        self.callerId = callerId
        self.targetUserIds = targetUserIds
        self.quality = quality
        self.publishResolution = publishResolution
            ?? VideoQuality.publishResolution(forParticipantCount: 1 + max(targetUserIds.count, 1))
    }

    enum CodingKeys: String, CodingKey {
        case callerId = "caller_id"
        case targetUserIds = "target_user_ids"
        case quality
        case publishResolution = "publish_resolution"
    }
}

struct VideoCallSession: Codable {
    let sessionId: String?
    let channelName: String?
    let uid: Int?

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case channelName = "channel_name"
        case uid
    }
}

struct ActiveVideoCallResponse: Codable {
    let session: VideoCallSession?
}

struct RealtimeTokenRequest: Codable {
    let userId: String
    let userName: String?
    let preferredLangCd: String?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case userName = "user_name"
        case preferredLangCd = "preferred_lang_cd"
    }
}

struct RealtimeTokenPayload: Codable {
    let token: String?
    let clientId: String?
    let keyName: String?
    let nonce: String?
    let mac: String?
    let timestamp: Int64?
    let ttl: Int64?
    let capability: String?
}

struct RealtimeTokenResponse: Codable {
    let tokenRequest: RealtimeTokenPayload?
    let orgId: String?

    enum CodingKeys: String, CodingKey {
        case tokenRequest = "realtime_token_request"
        case orgId = "org_id"
    }
}

/// A `publisher` token REQUIRES `sessionId` — the id of a live session created
/// with `POST /video/sessions` or `POST /unitedchat/rooms/:roomId/video-call`.
/// HyperBabel verifies the caller is a participant and signs the token with the
/// session's channel name and uid, so join with the values in the *response*.
/// Live-stream hosts do not use this endpoint: `POST /stream/sessions` already
/// returns a 24-hour host token.
struct RtcTokenRequest: Codable {
    let channelName: String
    let uid: Int
    let role: String
    let sessionId: String?
    let externalUserId: String?

    init(channelName: String, uid: Int, role: String,
         sessionId: String? = nil, externalUserId: String? = nil) {
        self.channelName = channelName
        self.uid = uid
        self.role = role
        self.sessionId = sessionId
        self.externalUserId = externalUserId
    }

    enum CodingKeys: String, CodingKey {
        case channelName = "channel_name"
        case uid, role
        case sessionId = "session_id"
        case externalUserId = "external_user_id"
    }
}

struct RtcTokenResponse: Codable {
    let rtcToken: String
    let channelName: String
    let uid: Int
    let appId: String

    enum CodingKeys: String, CodingKey {
        case rtcToken = "rtc_token"
        case channelName = "channel_name"
        case uid
        case appId = "app_id"
    }
}

struct PresenceHeartbeat: Codable {
    let userId: String
    enum CodingKeys: String, CodingKey { case userId = "user_id" }
}

struct TranslateTextRequest: Codable {
    let text: String
    let targetLanguage: String
    let sourceLanguage: String?

    enum CodingKeys: String, CodingKey {
        case text
        case targetLanguage = "target_language"
        case sourceLanguage = "source_language"
    }
}
