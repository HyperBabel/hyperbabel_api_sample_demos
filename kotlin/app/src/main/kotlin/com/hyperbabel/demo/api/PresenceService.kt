/*
 * HyperBabel API — Presence service.
 */
package com.hyperbabel.demo.api

import com.hyperbabel.demo.data.PresenceHeartbeat
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface PresenceService {
    @POST("api/v1/presence/heartbeat")
    suspend fun heartbeat(@Body body: PresenceHeartbeat)

    @POST("api/v1/presence/status")
    suspend fun status(@Body body: Map<String, String>)

    @GET("api/v1/presence")
    suspend fun list(@Query("user_ids") userIds: String): Map<String, Any>
}
