/*
 * HyperBabel API — Presence service.
 */
package com.hyperbabel.demo.api

import com.hyperbabel.demo.data.PresenceHeartbeat
import com.hyperbabel.demo.data.PresenceListResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface PresenceService {
    /** Body: `{ user_id }`. Every 30 s while the app is in the foreground. */
    @POST("presence/heartbeat")
    suspend fun heartbeat(@Body body: PresenceHeartbeat)

    /** Body: `{ user_id, status }` — status is "online" | "away" | "dnd" | "offline". */
    @POST("presence/status")
    suspend fun status(@Body body: Map<String, String>)

    /**
     * Bulk read: `GET /presence?user_ids=alice,bob` (comma-separated, at most
     * 100 ids) → `{ presence: [{ user_id, status, last_seen, device }],
     * offline_threshold_seconds }`. Unknown ids come back as "offline".
     * There is no bulk read via POST.
     */
    @GET("presence")
    suspend fun list(@Query("user_ids") userIds: String): PresenceListResponse
}
