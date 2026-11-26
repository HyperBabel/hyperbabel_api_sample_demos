/*
 * HyperBabel API — wire types.
 *
 * Only the fields the demo actually reads are declared. The server may add
 * additional fields without breaking us because Swift's JSONDecoder ignores
 * unknown keys by default.
 */
import Foundation

extension KeyedDecodingContainer {
    /// Decodes an integer the API may send either as a JSON number or as a
    /// numeric STRING. 64-bit database integers (counts such as COUNT(*)) are
    /// serialized as strings (`"3"`), and a plain `decode(Int.self, …)` throws
    /// on them — failing the whole response.
    func decodeLossyIntIfPresent(forKey key: Key) -> Int? {
        if let n = try? decodeIfPresent(Int.self, forKey: key) { return n }
        if let s = try? decodeIfPresent(String.self, forKey: key) { return Int(s) }
        return nil
    }
}

struct Room: Codable, Hashable, Identifiable {
    let id: String
    /// `room_type` on `POST /unitedchat/rooms`; the list and detail endpoints
    /// carry the same value as `channel_type`, so decoding falls back to it.
    /// Optional because `POST /unitedchat/rooms` omits both when it returns an
    /// EXISTING room (`{ room: { id, already_exists: true } }`).
    let roomType: String?
    let roomName: String?
    /// `member_count` is a database COUNT, which the API serializes as a JSON
    /// STRING (`"3"`), not a number. Decoding it as `Int` throws and the whole
    /// room list fails to load, so `init(from:)` below accepts either form
    /// (`decodeLossyIntIfPresent`).
    let memberCount: Int?
    /// The room's real-time channel name, supplied by the API.
    ///
    /// Pass this verbatim to `HyperBabelRealtime.subscribeRoom(_:onEvent:)`.
    /// It cannot be derived from `id` — the server builds it from values the
    /// client does not have, so a hand-built name subscribes to a channel
    /// nobody publishes on.
    let realtimeChannel: String?
    /// True while an owner / sub_admin has frozen the room — only they can
    /// post. `GET /unitedchat/rooms/:roomId` carries it; live changes arrive as
    /// the room channel's `room.updated` event (`data.is_frozen`).
    let isFrozen: Bool?
    /// True for `open` (public) rooms. Video calls are not available there —
    /// the server answers 400, so the chat screen hides the call button.
    let isOpen: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case roomType = "room_type"
        case roomName = "room_name"
        case memberCount = "member_count"
        case realtimeChannel = "realtime_channel"
        case isFrozen = "is_frozen"
        case isOpen = "is_open"
    }

    /// Keys that are read but never written back.
    private enum FallbackKeys: String, CodingKey {
        case channelType = "channel_type"
    }
}

extension Room {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let fallback = try decoder.container(keyedBy: FallbackKeys.self)
        id = try c.decode(String.self, forKey: .id)
        roomType = try c.decodeIfPresent(String.self, forKey: .roomType)
            ?? fallback.decodeIfPresent(String.self, forKey: .channelType)
        roomName = try c.decodeIfPresent(String.self, forKey: .roomName)
        memberCount = c.decodeLossyIntIfPresent(forKey: .memberCount)
        realtimeChannel = try c.decodeIfPresent(String.self, forKey: .realtimeChannel)
        isFrozen = try? c.decodeIfPresent(Bool.self, forKey: .isFrozen)
        isOpen = try? c.decodeIfPresent(Bool.self, forKey: .isOpen)
    }

    /// Video calls can be placed from 1:1 and group rooms, never from `open` ones.
    var allowsVideoCall: Bool { roomType != "open" && isOpen != true }
}

/// Single-room endpoints answer with the room WRAPPED — `{ "room": { … } }`.
/// Decoding straight into `Room` throws, and because the throw surfaces as a
/// generic error the screen looks broken while the request actually succeeded.
struct RoomResponse: Codable {
    let room: Room
}

/// GET /unitedchat/rooms — `{ rooms, open_rooms }`. `rooms` are the rooms the
/// user belongs to; `open_rooms` (public rooms they can join) is not used here.
struct RoomListResponse: Codable {
    let rooms: [Room]?
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
    /// Attachment URL (from `POST /storage/confirm`). Attachments also carry
    /// it as the message `content`.
    let url: String?
    let filename: String?
    let mimeType: String?
    let size: Int?
    let sizeBytes: Int?
    /// Read only as a fallback — replies are linked by the top-level
    /// `Message.replyTo` (`reply_to`). Some clients also copy it here.
    let replyTo: String?
    /// On `video_call` system messages: `call_started`, `call_accepted`,
    /// `call_ended`, `call_rejected`, `call_missed` or `call_busy`.
    let event: String?

    enum CodingKeys: String, CodingKey {
        case url, filename, size, event
        case mimeType = "mime_type"
        case sizeBytes = "size_bytes"
        case replyTo = "reply_to"
    }
}

/// `metadata` sent with an attachment message — the same shape the other
/// HyperBabel sample demos send, so every client can render the others' files.
struct AttachmentMetadata: Codable {
    let url: String
    let filename: String
    let mimeType: String
    let sizeBytes: Int?

    enum CodingKeys: String, CodingKey {
        case url, filename
        case mimeType = "mime_type"
        case sizeBytes = "size_bytes"
    }
}

extension MessageMetadata {
    /// Lenient: `metadata` is free-form and written by every client, so a field
    /// of an unexpected type is dropped instead of failing the whole message
    /// list.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        url = try? c.decodeIfPresent(String.self, forKey: .url)
        filename = try? c.decodeIfPresent(String.self, forKey: .filename)
        mimeType = try? c.decodeIfPresent(String.self, forKey: .mimeType)
        size = c.decodeLossyIntIfPresent(forKey: .size)
        sizeBytes = c.decodeLossyIntIfPresent(forKey: .sizeBytes)
        replyTo = try? c.decodeIfPresent(String.self, forKey: .replyTo)
        event = try? c.decodeIfPresent(String.self, forKey: .event)
    }

    /// Builds metadata from a real-time payload's `metadata` object. Nil when
    /// it is missing or does not decode — the message itself still shows.
    init?(json: Any?) {
        guard let dict = json as? [String: Any],
              JSONSerialization.isValidJSONObject(dict),
              let data = try? JSONSerialization.data(withJSONObject: dict),
              let decoded = try? JSONDecoder().decode(MessageMetadata.self, from: data)
        else { return nil }
        self = decoded
    }
}

struct Message: Codable, Hashable, Identifiable {
    let id: String
    let senderId: String
    let senderName: String?
    var content: String?
    let messageType: String?
    let createdAt: String?
    /// Set once the message has been edited. Messages carry `edited_at` —
    /// there is no `updated_at` field on a message.
    var editedAt: String?
    var deletedAt: String?
    /// emoji → the user ids that reacted with it.
    var reactions: ReactionMap?
    let metadata: MessageMetadata?
    /// Id of the message this one replies to (`reply_to`), or nil.
    let replyTo: String?

    enum CodingKeys: String, CodingKey {
        case id
        case senderId = "sender_id"
        case senderName = "sender_name"
        case content
        case messageType = "message_type"
        case createdAt = "created_at"
        case editedAt = "edited_at"
        case deletedAt = "deleted_at"
        case reactions
        case metadata
        case replyTo = "reply_to"
    }
}

struct MessageListResponse: Codable {
    let messages: [Message]?
}

struct SendMessageRequest: Codable {
    let senderId: String
    /// Not used by the server for signed-in end users: the name other members
    /// see is the sender's profile `display_name` (set with
    /// `UsersService.updateMyDisplayName`).
    let senderName: String?
    /// Text for `text` messages; the uploaded file's URL for attachments.
    let content: String
    /// `text`, or for attachments `image` | `video` | `audio` | `file`.
    let messageType: String
    /// Id of the message being replied to. Omitted from the body when nil —
    /// the server rejects `reply_to: null`.
    var replyTo: String? = nil
    /// Attachment details (URL, file name, MIME type, size). Omitted when nil.
    var metadata: AttachmentMetadata? = nil

    enum CodingKeys: String, CodingKey {
        case senderId = "sender_id"
        case senderName = "sender_name"
        case content
        case messageType = "message_type"
        case replyTo = "reply_to"
        case metadata
    }
}

/// `POST /unitedchat/rooms/:roomId/messages` answers with the new message
/// WRAPPED — `{ "message": { … } }`. Decoding it as a bare `Message` throws
/// after a successful send, which made the screen restore the text and
/// invite a duplicate send.
struct SendMessageResponse: Codable {
    let message: Message
}

/// `POST /unitedchat/rooms/:roomId/messages/batch-translate` →
/// `{ "translations": { "<messageId>": "<text>" } }`, plus `"limited": true`
/// when the user's daily translation allowance stopped new translations.
struct BatchTranslateResponse: Codable {
    let translations: [String: String]?
    let limited: Bool?
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

/// `session` in `GET /unitedchat/rooms/:roomId/video-call/active`. The session
/// id is `id` — there is no `session_id` field — and it is what accept,
/// reject, end, leave and the publisher RTC token request all need.
struct VideoCallSession: Codable {
    let id: String?
    let channelName: String?
    /// `1to1` (one person rung) or `group`.
    let callType: String?
    let participants: [VideoCallParticipant]?

    enum CodingKeys: String, CodingKey {
        case id
        case channelName = "channel_name"
        case callType = "call_type"
        case participants
    }
}

struct VideoCallParticipant: Codable {
    let userId: String?
    let uid: Int?
    /// True for the participant who started the call.
    let isCaller: Bool?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case uid
        case isCaller = "is_caller"
    }
}

/// `{ active: false, session: null }` when no call is ringing or running.
struct ActiveVideoCallResponse: Codable {
    let active: Bool?
    let session: VideoCallSession?
}

/// `POST …/video-call/joined-rtc`. `matched: false` means the stamp did not
/// land yet (for example the callee's accept is not stored yet) — retry.
struct JoinedRtcResponse: Codable {
    let success: Bool?
    let matched: Bool?
}

/// `POST …/video-call/renew-token` — a fresh RTC token for the same channel
/// and uid. Pass `rtc_token` to the video engine's token renewal.
struct RenewRtcTokenResponse: Codable {
    let sessionId: String?
    let channelName: String?
    let uid: Int?
    let rtcToken: String?
    let expiresIn: Int?

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case channelName = "channel_name"
        case uid
        case rtcToken = "rtc_token"
        case expiresIn = "expires_in"
    }
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
