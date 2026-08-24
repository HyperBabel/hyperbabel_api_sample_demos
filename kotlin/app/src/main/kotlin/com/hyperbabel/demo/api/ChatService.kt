/*
 * HyperBabel API — emoji reactions on United Chat room messages.
 *
 * Emoji reactions are ROOM-SCOPED.
 *
 * Use `/unitedchat/rooms/:roomId/messages/:messageId/reactions`, not the
 * `/chat/...` variant. The `/chat` route is server-to-server only and rejects
 * end-user (Session-Token) JWTs — which is what this demo signs in with, so
 * it would fail with 403.
 *
 * The response is the FULL reaction map for that message:
 *   { "reactions": { "👍": ["user_1", "user_2"] } }
 */
package com.hyperbabel.demo.api

import retrofit2.http.Body
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.Path

/** Response of both reaction calls — the full emoji → user-ids map. */
data class ReactionsResponse(
    val reactions: Map<String, List<String>> = emptyMap(),
)

interface ChatService {
    @POST("api/v1/unitedchat/rooms/{roomId}/messages/{messageId}/reactions")
    suspend fun addReaction(
        @Path("roomId") roomId: String,
        @Path("messageId") messageId: String,
        @Body body: Map<String, String>,
    ): ReactionsResponse

    @HTTP(
        method = "DELETE",
        path = "api/v1/unitedchat/rooms/{roomId}/messages/{messageId}/reactions",
        hasBody = true,
    )
    suspend fun removeReaction(
        @Path("roomId") roomId: String,
        @Path("messageId") messageId: String,
        @Body body: Map<String, String>,
    ): ReactionsResponse
}
