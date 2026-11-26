/*
 * HyperBabel API — Live Stream service.
 *
 * ⚠️ EVERY CALL HERE NEEDS YOUR BACKEND — IT CANNOT RUN FROM THIS APP.
 *
 *   Every `/stream/…` endpoint authenticates with your ORGANIZATION API KEY
 *   (`Authorization: Bearer hb_live_…`). Anything else is rejected up front:
 *
 *       POST /api/v1/stream/sessions
 *       -> 401 { "error": { "code": "invalid_api_key_format" } }
 *
 *   Creating a broadcast allocates paid capacity and is metered against your
 *   organization, so the caller has to be YOU, not a signed-in end user. This
 *   demo only ever holds a customer JWT (the API client refuses to carry an org
 *   key), so these calls fail here by design.
 *
 *   Ship it as:  app -> your backend (holds hb_live_…) -> HyperBabel /stream/…
 *   The paths, payloads and call order below are accurate — implement them
 *   on your server and expose a thin endpoint the app can call.
 */
package com.hyperbabel.demo.api

import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface StreamService {
    @GET("stream/sessions")
    suspend fun listSessions(): JsonObject

    @POST("stream/sessions")
    suspend fun createSession(@Body body: JsonObject): JsonObject

    @POST("stream/sessions/{sessionId}/start")
    suspend fun startSession(
        @Path("sessionId") sessionId: String,
        @Body body: Map<String, String>,
    )

    // Heartbeat — POST every ~30s while broadcasting so the server can
    // detect a host crash within minutes (rather than the 8h wall-clock
    // fallback) and bill only actual stream time.
    @POST("stream/sessions/{sessionId}/heartbeat")
    suspend fun heartbeat(
        @Path("sessionId") sessionId: String,
        @Body body: Map<String, String> = emptyMap(),
    )

    @POST("stream/sessions/{sessionId}/end")
    suspend fun endSession(
        @Path("sessionId") sessionId: String,
        @Body body: Map<String, String>,
    )

    @POST("stream/sessions/{sessionId}/viewer-token")
    suspend fun viewerToken(
        @Path("sessionId") sessionId: String,
        @Body body: Map<String, String>,
    ): JsonObject
}
