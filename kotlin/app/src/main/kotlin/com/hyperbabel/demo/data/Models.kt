/*
 * HyperBabel API — wire types.
 *
 * Only the fields the demo actually reads are declared. The server may add
 * additional fields without breaking us because kotlinx.serialization is
 * configured to ignore unknown keys (see ApiClient).
 */
package com.hyperbabel.demo.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import com.hyperbabel.demo.video.VideoQuality

@Serializable
data class Room(
    val id: String,
    /**
     * "1to1" | "group" | "open". Room objects carry it as `channel_type`
     * (`room_type` is the field name in the CREATE request body).
     *
     * Defaults to "" because `POST /unitedchat/rooms` omits it when it returns
     * an EXISTING 1:1 room (`{ room: { id, already_exists: true } }`).
     */
    @SerialName("channel_type") val roomType: String = "",
    @SerialName("room_name") val roomName: String? = null,
    @SerialName("member_count") val memberCount: Int? = null,
    /**
     * The room's real-time channel name, supplied by the API.
     *
     * Pass this verbatim to `HyperBabelRealtime.subscribeRoom()`. It cannot be
     * derived from [id] — the server builds it from values the client does not
     * have, so a hand-built name subscribes to a channel nobody publishes on.
     */
    @SerialName("realtime_channel") val realtimeChannel: String? = null,
)

/**
 * Single-room endpoints answer with the room WRAPPED — `{ "room": { … } }`.
 * Decoding straight into [Room] fails, and because the failure surfaces as a
 * generic error the screen looks broken while the request actually succeeded.
 */
@Serializable
data class RoomResponse(
    val room: Room,
)

/** GET /unitedchat/rooms — `{ rooms, open_rooms }`; `open_rooms` (public rooms to join) is not used here. */
@Serializable
data class RoomListResponse(
    val rooms: List<Room> = emptyList(),
)

@Serializable
data class CreateRoomRequest(
    @SerialName("room_type") val roomType: String,
    @SerialName("creator_id") val creatorId: String,
    @SerialName("room_name") val roomName: String? = null,
    val members: List<String>? = null,
)

@Serializable
data class Message(
    val id: String,
    @SerialName("sender_id") val senderId: String,
    @SerialName("sender_name") val senderName: String? = null,
    /** Text for "text" messages; the file URL for "image" / "video" / "audio" / "file". */
    val content: String? = null,
    @SerialName("message_type") val messageType: String? = null,
    /** Id of the message this one replies to (top-level `reply_to`, not inside metadata). */
    @SerialName("reply_to") val replyTo: String? = null,
    /** Free-form JSON. Attachments sent by this demo put `filename` here. */
    val metadata: JsonElement? = null,
    @SerialName("created_at") val createdAt: String? = null,
    /** Set only once the message has been edited. */
    @SerialName("edited_at") val editedAt: String? = null,
    /** Present on reply snapshots whose original was deleted. */
    @SerialName("deleted_at") val deletedAt: String? = null,
) {
    /** Original file name of an attachment, when the sender recorded one. */
    val fileName: String?
        get() = ((metadata as? JsonObject)?.get("filename") as? JsonPrimitive)?.contentOrNull
}

@Serializable
data class MessageListResponse(
    /** Newest first. */
    val messages: List<Message> = emptyList(),
    /**
     * The messages that [Message.replyTo] points at, keyed by id — so a reply
     * can quote a parent outside the loaded page (deleted parents included).
     */
    @SerialName("reply_snapshots") val replySnapshots: Map<String, Message> = emptyMap(),
)

@Serializable
data class SendMessageRequest(
    @SerialName("sender_id") val senderId: String,
    @SerialName("sender_name") val senderName: String? = null,
    val content: String,
    /**
     * "text" | "image" | "video" | "audio" | "file" | "location" | "contact".
     * For uploads, send the `message_type` that `POST /storage/confirm` returns.
     */
    @SerialName("message_type") val messageType: String = "text",
    /** Id of the message being replied to (must be a message id, i.e. a UUID). */
    @SerialName("reply_to") val replyTo: String? = null,
    val metadata: JsonObject? = null,
)

/** `POST /unitedchat/rooms/:roomId/messages` answers `{ "message": { … } }` — wrapped, not bare. */
@Serializable
data class SendMessageResponse(
    val message: Message,
)

@Serializable
data class BatchTranslateRequest(
    /** 1 to 100 message ids from this room. */
    @SerialName("message_ids") val messageIds: List<String>,
    @SerialName("target_lang") val targetLang: String,
)

@Serializable
data class BatchTranslateResponse(
    /** Message id → translated text. Attachments and same-language messages are skipped. */
    val translations: Map<String, String> = emptyMap(),
    /** True when the daily translation allowance ran out before every message was translated. */
    val limited: Boolean = false,
)

@Serializable
data class StartVideoCallRequest(
    @SerialName("caller_id") val callerId: String,
    @SerialName("target_user_ids") val targetUserIds: List<String> = emptyList(),
    /**
     * Billing tier for this call: "hd" (default) | "fhd" | "2k" | "2k_plus".
     * Declare the tier that matches what you actually publish — the default
     * comes from [com.hyperbabel.demo.video.VideoQuality.declaredQuality].
     */
    @SerialName("quality") val quality: String = VideoQuality.declaredQuality(),
    /**
     * OPTIONAL self-check: what this client will actually publish at this call
     * size. The server multiplies it by the streams each participant receives
     * and returns `quality_warning` when the total exceeds [quality]. Never the
     * billing basis — [quality] is.
     */
    @SerialName("publish_resolution")
    val publishResolution: com.hyperbabel.demo.video.PublishResolution =
        VideoQuality.publishResolutionFor(1 + targetUserIds.size.coerceAtLeast(1)),
)

/**
 * The call session inside `GET …/video-call/active` (and `POST …/video-call`).
 *
 * The session id is [id] — there is no `session_id` field. Every call action
 * (`/accept`, `/reject`, `/leave`, `/end`) must send it back as `session_id`,
 * together with `user_id`, or the server answers 400.
 */
@Serializable
data class VideoCallSession(
    val id: String? = null,
    @SerialName("channel_name") val channelName: String? = null,
    /** "1to1" | "group" — by the number of people rung, not by the room type. */
    @SerialName("call_type") val callType: String? = null,
    val participants: List<VideoCallParticipant> = emptyList(),
)

@Serializable
data class VideoCallParticipant(
    @SerialName("user_id") val userId: String? = null,
    /** The RTC uid the server assigned to this participant for this session. */
    val uid: Int? = null,
    /** "invited" | "active" | "left" */
    val status: String? = null,
    /** True for the participant who started the call. */
    @SerialName("is_caller") val isCaller: Boolean = false,
)

/** `matched: false` = the server could not stamp you yet — retry shortly. */
@Serializable
data class JoinedRtcResponse(
    val success: Boolean = false,
    val matched: Boolean = false,
)

/** A fresh 1-hour RTC token for the same channel and uid. */
@Serializable
data class RenewTokenResponse(
    @SerialName("rtc_token") val rtcToken: String,
    @SerialName("channel_name") val channelName: String? = null,
    val uid: Int? = null,
    @SerialName("expires_in") val expiresIn: Int? = null,
)

/** `{ active: false, session: null }` when the room has no live call. */
@Serializable
data class ActiveVideoCallResponse(
    val active: Boolean = false,
    val session: VideoCallSession? = null,
)

@Serializable
data class RealtimeTokenRequest(
    @SerialName("user_id") val userId: String,
    @SerialName("user_name") val userName: String? = null,
    @SerialName("preferred_lang_cd") val preferredLangCd: String? = null,
)

@Serializable
data class RealtimeTokenResponse(
    @SerialName("realtime_token_request") val tokenRequest: RealtimeTokenPayload? = null,
    @SerialName("org_id") val orgId: String? = null,
)

@Serializable
data class RealtimeTokenPayload(
    val token: String? = null,
    @SerialName("clientId") val clientId: String? = null,
    @SerialName("keyName") val keyName: String? = null,
    @SerialName("nonce") val nonce: String? = null,
    @SerialName("mac") val mac: String? = null,
    @SerialName("timestamp") val timestamp: Long? = null,
    @SerialName("ttl") val ttl: Long? = null,
    @SerialName("capability") val capability: String? = null,
)

/**
 * A `publisher` token REQUIRES [sessionId] — the id of a live session created
 * with `POST /video/sessions` or `POST /unitedchat/rooms/:roomId/video-call`.
 * HyperBabel verifies the caller is a participant and signs the token with the
 * session's channel name and uid, so join with **the values in the response**.
 * Live-stream hosts do not use this endpoint: `POST /stream/sessions` already
 * returns a 24-hour host token.
 */
@Serializable
data class RtcTokenRequest(
    @SerialName("channel_name") val channelName: String,
    val uid: Int,
    val role: String,
    /** REQUIRED when [role] is "publisher". */
    @SerialName("session_id") val sessionId: String? = null,
    /** Which of your users this token is for (API-key callers). */
    @SerialName("external_user_id") val externalUserId: String? = null,
)

@Serializable
data class RtcTokenResponse(
    @SerialName("rtc_token") val rtcToken: String,
    @SerialName("channel_name") val channelName: String,
    val uid: Int,
    @SerialName("app_id") val appId: String,
)

@Serializable
data class PresenceHeartbeat(@SerialName("user_id") val userId: String)
