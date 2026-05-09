/*
 * HyperBabel API — low-level Chat service. Used by United Chat rooms for
 * cross-cutting concerns (emoji reactions) that target a single message id.
 */
package com.hyperbabel.demo.api

import retrofit2.http.Body
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.Path

interface ChatService {
    @POST("api/v1/chat/messages/{messageId}/reactions")
    suspend fun addReaction(
        @Path("messageId") messageId: String,
        @Body body: Map<String, String>,
    )

    @HTTP(method = "DELETE", path = "api/v1/chat/messages/{messageId}/reactions", hasBody = true)
    suspend fun removeReaction(
        @Path("messageId") messageId: String,
        @Body body: Map<String, String>,
    )
}
