/*
 * HyperBabel API — United Chat service.
 *
 * Covers the room and message endpoints used by this demo. The full surface
 * is documented at https://hyperbabel.com/docs. Paths are relative to the
 * `/api/v1/` base URL (see ApiClient).
 *
 * DELETE routes that take a JSON body (unban, demote, unfreeze, unmute,
 * delete message) are declared with `@HTTP(method = "DELETE", hasBody = true)`.
 * Sending them without a body — or with the ids as query parameters — fails
 * JSON parsing on the server and comes back as an error.
 */
package com.hyperbabel.demo.api

import com.hyperbabel.demo.data.ActiveVideoCallResponse
import com.hyperbabel.demo.data.BatchTranslateRequest
import com.hyperbabel.demo.data.BatchTranslateResponse
import com.hyperbabel.demo.data.CreateRoomRequest
import com.hyperbabel.demo.data.JoinedRtcResponse
import com.hyperbabel.demo.data.MessageListResponse
import com.hyperbabel.demo.data.RenewTokenResponse
import com.hyperbabel.demo.data.RoomListResponse
import com.hyperbabel.demo.data.RoomResponse
import com.hyperbabel.demo.data.SendMessageRequest
import com.hyperbabel.demo.data.SendMessageResponse
import com.hyperbabel.demo.data.StartVideoCallRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface UnitedChatService {

    @GET("unitedchat/rooms")
    suspend fun listRooms(@Query("user_id") userId: String): RoomListResponse

    @POST("unitedchat/rooms")
    suspend fun createRoom(@Body body: CreateRoomRequest): RoomResponse

    @GET("unitedchat/rooms/{roomId}")
    suspend fun getRoom(
        @Path("roomId") roomId: String,
        @Query("user_id") userId: String,
    ): RoomResponse

    /** Answers `{ "message": { … } }` — the stored message, wrapped. */
    @POST("unitedchat/rooms/{roomId}/messages")
    suspend fun sendMessage(
        @Path("roomId") roomId: String,
        @Body body: SendMessageRequest,
    ): SendMessageResponse

    @GET("unitedchat/rooms/{roomId}/messages")
    suspend fun getMessages(
        @Path("roomId") roomId: String,
        @Query("user_id") userId: String,
        @Query("limit") limit: Int = 50,
    ): MessageListResponse

    @POST("unitedchat/rooms/{roomId}/read")
    suspend fun markRead(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    // ── Video calls ──────────────────────────────────────────────────────
    //
    // Every call action below needs BOTH `user_id` and `session_id` in the
    // body (400 otherwise). The session id is `session.id` from
    // startVideoCall / getActiveVideoCall, or `sessionId` from the
    // CALL_INVITE signal on the callee side.

    /**
     * Group rooms must list who to ring in `target_user_ids`; 1:1 rooms ring
     * the other member, so send none. Open rooms have no calls.
     *
     * The participant cap depends on your plan: with group video, at most 2
     * targets (3 people per call, else 400 `limit_exceeded`); without it,
     * every call is 1:1 (2 people) and more answers 400
     * `plan_upgrade_required`. A call nobody joins is ended by the server
     * after 3 minutes. The response carries `session.id` and the caller's own
     * `caller.rtc_token` / `uid`.
     */
    @POST("unitedchat/rooms/{roomId}/video-call")
    suspend fun startVideoCall(
        @Path("roomId") roomId: String,
        @Body body: StartVideoCallRequest,
    )

    /** Body: `{ user_id, session_id }`. 410 when the caller already hung up. */
    @POST("unitedchat/rooms/{roomId}/video-call/accept")
    suspend fun acceptVideoCall(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    /** Body: `{ user_id, session_id, reason? }`. */
    @POST("unitedchat/rooms/{roomId}/video-call/reject")
    suspend fun rejectVideoCall(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    /** Ends the call for EVERYONE. Body: `{ user_id, session_id }`. Caller, owner or sub_admin only. */
    @POST("unitedchat/rooms/{roomId}/video-call/end")
    suspend fun endVideoCall(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    /**
     * Leave the CALL (not the chat room — that is [leaveRoom]).
     * Body: `{ user_id, session_id }`. The server ends the session when the
     * last active participant leaves.
     */
    @POST("unitedchat/rooms/{roomId}/video-call/leave")
    suspend fun leaveVideoCall(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    @GET("unitedchat/rooms/{roomId}/video-call/active")
    suspend fun getActiveVideoCall(
        @Path("roomId") roomId: String,
    ): ActiveVideoCallResponse

    /**
     * Body: `{ user_id, session_id }`. Send right after joining the RTC channel;
     * retry while `matched` is false. Without it (and without heartbeats) the
     * server treats the call as never connected and may end it.
     */
    @POST("unitedchat/rooms/{roomId}/video-call/joined-rtc")
    suspend fun markJoinedRtc(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    ): JoinedRtcResponse

    /** Body: `{ user_id, session_id }`. Every 60 s while on the call. */
    @POST("unitedchat/rooms/{roomId}/video-call/heartbeat")
    suspend fun videoCallHeartbeat(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    /** Body: `{ user_id, session_id }`. RTC tokens last 1 hour — renew before they expire. */
    @POST("unitedchat/rooms/{roomId}/video-call/renew-token")
    suspend fun renewVideoCallToken(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    ): RenewTokenResponse

    /**
     * Translate chat messages with the end-user token. (The standalone
     * `/translate/…` endpoints accept only an organization API key, so they
     * are not callable from an app — see README.)
     */
    @POST("unitedchat/rooms/{roomId}/messages/batch-translate")
    suspend fun batchTranslateMessages(
        @Path("roomId") roomId: String,
        @Body body: BatchTranslateRequest,
    ): BatchTranslateResponse

    /** Body: `{ user_id }` — the sender, or an owner / sub_admin. */
    @HTTP(method = "DELETE", path = "unitedchat/rooms/{roomId}/messages/{messageId}", hasBody = true)
    suspend fun deleteMessage(
        @Path("roomId") roomId: String,
        @Path("messageId") messageId: String,
        @Body body: Map<String, String>,
    )

    // ── Member management & moderation ───────────────────────────────────

    /** Leave the chat ROOM. Never use this to hang up a call — see [leaveVideoCall]. */
    @POST("unitedchat/rooms/{roomId}/leave")
    suspend fun leaveRoom(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    @GET("unitedchat/rooms/{roomId}/members")
    suspend fun getMembers(@Path("roomId") roomId: String): kotlinx.serialization.json.JsonObject

    @POST("unitedchat/rooms/{roomId}/typing")
    suspend fun sendTyping(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    /** Body: `{ user_id, content }`. Text messages only. */
    @retrofit2.http.PUT("unitedchat/rooms/{roomId}/messages/{messageId}")
    suspend fun editMessage(
        @Path("roomId") roomId: String,
        @Path("messageId") messageId: String,
        @Body body: Map<String, String>,
    )

    /** Body: `{ user_id, banned_by }` — `banned_by` is you (owner / sub_admin). */
    @POST("unitedchat/rooms/{roomId}/ban")
    suspend fun banUser(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    /** Body: `{ unbanned_by }` — you (owner / sub_admin). */
    @HTTP(method = "DELETE", path = "unitedchat/rooms/{roomId}/ban/{userId}", hasBody = true)
    suspend fun unbanUser(
        @Path("roomId") roomId: String,
        @Path("userId") userId: String,
        @Body body: Map<String, String>,
    )

    /** Body: `{ user_id, owner_id }` — `owner_id` is you (room owner only). */
    @POST("unitedchat/rooms/{roomId}/sub-admins")
    suspend fun addSubAdmin(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    /** Body: `{ owner_id }` — you (room owner only). */
    @HTTP(method = "DELETE", path = "unitedchat/rooms/{roomId}/sub-admins/{userId}", hasBody = true)
    suspend fun removeSubAdmin(
        @Path("roomId") roomId: String,
        @Path("userId") userId: String,
        @Body body: Map<String, String>,
    )

    /**
     * Body: `{ user_id }` — you (owner / sub_admin). Every member then gets
     * `room.updated` with `data.is_frozen` on the room's real-time channel.
     */
    @POST("unitedchat/rooms/{roomId}/freeze")
    suspend fun freezeRoom(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    /** Body: `{ user_id }` — you (owner / sub_admin). */
    @HTTP(method = "DELETE", path = "unitedchat/rooms/{roomId}/freeze", hasBody = true)
    suspend fun unfreezeRoom(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    /** Body: `{ user_id, duration_minutes? }` — mutes the room's notifications for you. */
    @POST("unitedchat/rooms/{roomId}/mute")
    suspend fun muteRoom(
        @Path("roomId") roomId: String,
        @Body body: kotlinx.serialization.json.JsonObject,
    )

    /** Body: `{ user_id }`. */
    @HTTP(method = "DELETE", path = "unitedchat/rooms/{roomId}/mute", hasBody = true)
    suspend fun unmuteRoom(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    @GET("unitedchat/rooms/{roomId}/mute/{userId}")
    suspend fun getMuteStatus(
        @Path("roomId") roomId: String,
        @Path("userId") userId: String,
    ): kotlinx.serialization.json.JsonObject
}
