/*
 * HyperBabel API — United Chat service.
 *
 * Covers the room and message endpoints used by this demo. The full surface
 * is documented at https://hyperbabel.com/docs.
 */
package com.hyperbabel.demo.api

import com.hyperbabel.demo.data.ActiveVideoCallResponse
import com.hyperbabel.demo.data.CreateRoomRequest
import com.hyperbabel.demo.data.Message
import com.hyperbabel.demo.data.MessageListResponse
import com.hyperbabel.demo.data.Room
import com.hyperbabel.demo.data.RoomListResponse
import com.hyperbabel.demo.data.SendMessageRequest
import com.hyperbabel.demo.data.StartVideoCallRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface UnitedChatService {

    @GET("api/v1/unitedchat/rooms")
    suspend fun listRooms(@Query("user_id") userId: String): RoomListResponse

    @POST("api/v1/unitedchat/rooms")
    suspend fun createRoom(@Body body: CreateRoomRequest): Room

    @GET("api/v1/unitedchat/rooms/{roomId}")
    suspend fun getRoom(
        @Path("roomId") roomId: String,
        @Query("user_id") userId: String,
    ): Room

    @POST("api/v1/unitedchat/rooms/{roomId}/messages")
    suspend fun sendMessage(
        @Path("roomId") roomId: String,
        @Body body: SendMessageRequest,
    ): Message

    @GET("api/v1/unitedchat/rooms/{roomId}/messages")
    suspend fun getMessages(
        @Path("roomId") roomId: String,
        @Query("user_id") userId: String,
        @Query("limit") limit: Int = 50,
    ): MessageListResponse

    @POST("api/v1/unitedchat/rooms/{roomId}/read")
    suspend fun markRead(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    @POST("api/v1/unitedchat/rooms/{roomId}/video-call")
    suspend fun startVideoCall(
        @Path("roomId") roomId: String,
        @Body body: StartVideoCallRequest,
    )

    @POST("api/v1/unitedchat/rooms/{roomId}/video-call/accept")
    suspend fun acceptVideoCall(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    @POST("api/v1/unitedchat/rooms/{roomId}/video-call/reject")
    suspend fun rejectVideoCall(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    @POST("api/v1/unitedchat/rooms/{roomId}/video-call/end")
    suspend fun endVideoCall(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    @POST("api/v1/unitedchat/rooms/{roomId}/video-call/leave")
    suspend fun leaveVideoCall(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    @GET("api/v1/unitedchat/rooms/{roomId}/video-call/active")
    suspend fun getActiveVideoCall(
        @Path("roomId") roomId: String,
    ): ActiveVideoCallResponse

    @POST("api/v1/unitedchat/rooms/{roomId}/messages/batch-translate")
    suspend fun batchTranslateMessages(
        @Path("roomId") roomId: String,
        @Body body: Map<String, Any>,
    )

    @DELETE("api/v1/unitedchat/rooms/{roomId}/messages/{messageId}")
    suspend fun deleteMessage(
        @Path("roomId") roomId: String,
        @Path("messageId") messageId: String,
        @Query("user_id") userId: String,
    )

    // ── Member management & moderation ───────────────────────────────────

    @POST("api/v1/unitedchat/rooms/{roomId}/leave")
    suspend fun leaveRoom(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    @retrofit2.http.GET("api/v1/unitedchat/rooms/{roomId}/members")
    suspend fun getMembers(@Path("roomId") roomId: String): kotlinx.serialization.json.JsonObject

    @POST("api/v1/unitedchat/rooms/{roomId}/typing")
    suspend fun sendTyping(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    @retrofit2.http.PUT("api/v1/unitedchat/rooms/{roomId}/messages/{messageId}")
    suspend fun editMessage(
        @Path("roomId") roomId: String,
        @Path("messageId") messageId: String,
        @Body body: Map<String, String>,
    )

    @POST("api/v1/unitedchat/rooms/{roomId}/ban")
    suspend fun banUser(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    @retrofit2.http.HTTP(method = "DELETE", path = "api/v1/unitedchat/rooms/{roomId}/ban/{userId}", hasBody = false)
    suspend fun unbanUser(
        @Path("roomId") roomId: String,
        @Path("userId") userId: String,
    )

    @POST("api/v1/unitedchat/rooms/{roomId}/sub-admins")
    suspend fun addSubAdmin(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    @retrofit2.http.HTTP(method = "DELETE", path = "api/v1/unitedchat/rooms/{roomId}/sub-admins/{userId}", hasBody = false)
    suspend fun removeSubAdmin(
        @Path("roomId") roomId: String,
        @Path("userId") userId: String,
    )

    @POST("api/v1/unitedchat/rooms/{roomId}/freeze")
    suspend fun freezeRoom(
        @Path("roomId") roomId: String,
        @Body body: Map<String, String>,
    )

    @retrofit2.http.HTTP(method = "DELETE", path = "api/v1/unitedchat/rooms/{roomId}/freeze", hasBody = false)
    suspend fun unfreezeRoom(@Path("roomId") roomId: String)

    @POST("api/v1/unitedchat/rooms/{roomId}/mute")
    suspend fun muteRoom(
        @Path("roomId") roomId: String,
        @Body body: kotlinx.serialization.json.JsonObject,
    )

    @retrofit2.http.HTTP(method = "DELETE", path = "api/v1/unitedchat/rooms/{roomId}/mute", hasBody = false)
    suspend fun unmuteRoom(@Path("roomId") roomId: String)

    @retrofit2.http.GET("api/v1/unitedchat/rooms/{roomId}/mute/{userId}")
    suspend fun getMuteStatus(
        @Path("roomId") roomId: String,
        @Path("userId") userId: String,
    ): kotlinx.serialization.json.JsonObject
}
