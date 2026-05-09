/*
 * HyperBabel API — Live Stream service.
 */
package com.hyperbabel.demo.api

import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface StreamService {
    @GET("api/v1/stream/sessions")
    suspend fun listSessions(): JsonObject

    @POST("api/v1/stream/sessions")
    suspend fun createSession(@Body body: JsonObject): JsonObject

    @POST("api/v1/stream/sessions/{sessionId}/start")
    suspend fun startSession(
        @Path("sessionId") sessionId: String,
        @Body body: Map<String, String>,
    )

    @POST("api/v1/stream/sessions/{sessionId}/end")
    suspend fun endSession(
        @Path("sessionId") sessionId: String,
        @Body body: Map<String, String>,
    )

    @POST("api/v1/stream/sessions/{sessionId}/viewer-token")
    suspend fun viewerToken(
        @Path("sessionId") sessionId: String,
        @Body body: Map<String, String>,
    ): JsonObject
}
