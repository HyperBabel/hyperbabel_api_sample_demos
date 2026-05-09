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

@Serializable
data class Room(
    val id: String,
    @SerialName("room_type") val roomType: String,
    @SerialName("room_name") val roomName: String? = null,
    @SerialName("member_count") val memberCount: Int? = null,
)

@Serializable
data class RoomListResponse(
    val rooms: List<Room> = emptyList(),
    @SerialName("member_rooms") val memberRooms: List<Room> = emptyList(),
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
    val content: String? = null,
    @SerialName("message_type") val messageType: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class MessageListResponse(
    val messages: List<Message> = emptyList(),
)

@Serializable
data class SendMessageRequest(
    @SerialName("sender_id") val senderId: String,
    @SerialName("sender_name") val senderName: String? = null,
    val content: String,
    @SerialName("message_type") val messageType: String = "text",
)

@Serializable
data class StartVideoCallRequest(
    @SerialName("caller_id") val callerId: String,
    @SerialName("target_user_ids") val targetUserIds: List<String> = emptyList(),
)

@Serializable
data class VideoCallSession(
    @SerialName("session_id") val sessionId: String? = null,
    @SerialName("channel_name") val channelName: String? = null,
    val uid: Int? = null,
)

@Serializable
data class ActiveVideoCallResponse(
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
    @SerialName("ably_token_request") val tokenRequest: RealtimeTokenPayload? = null,
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

@Serializable
data class RtcTokenRequest(
    @SerialName("channel_name") val channelName: String,
    val uid: Int,
    val role: String,
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

@Serializable
data class TranslateTextRequest(
    val text: String,
    @SerialName("target_language") val targetLanguage: String,
    @SerialName("source_language") val sourceLanguage: String? = null,
)
