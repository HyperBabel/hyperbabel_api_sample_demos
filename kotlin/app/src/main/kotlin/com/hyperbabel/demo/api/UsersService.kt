/*
 * HyperBabel API — global block list endpoints (blocks apply across rooms)
 * and the signed-in user's own profile.
 */
package com.hyperbabel.demo.api

import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

interface UsersService {
    @POST("users/block")
    suspend fun blockUser(@Body body: Map<String, String>)

    @HTTP(method = "DELETE", path = "users/block", hasBody = true)
    suspend fun unblockUser(@Body body: Map<String, String>)

    @GET("users/{userId}/blocks")
    suspend fun getBlockList(@Path("userId") userId: String): JsonObject
}

interface ProfileService {
    /**
     * `PATCH /customer/users/me` with the customer JWT — updates YOUR profile.
     * Every field is optional; `display_name` is 1 to 60 characters. Answers
     * the updated profile.
     */
    @PATCH("customer/users/me")
    suspend fun updateMe(@Body body: Map<String, String>): JsonObject
}
