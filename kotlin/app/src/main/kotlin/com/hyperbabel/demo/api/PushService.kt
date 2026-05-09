/*
 * HyperBabel API — push notification token management.
 */
package com.hyperbabel.demo.api

import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.Query

interface PushService {
    @POST("api/v1/push/register")
    suspend fun registerToken(@Body body: Map<String, String>)

    @HTTP(method = "DELETE", path = "api/v1/push/unregister", hasBody = true)
    suspend fun unregisterToken(@Body body: Map<String, String>)

    @GET("api/v1/push/tokens")
    suspend fun getTokens(@Query("user_id") userId: String): JsonObject
}
