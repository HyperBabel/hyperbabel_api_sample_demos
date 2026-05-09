/*
 * HyperBabel API — global block list endpoints. Blocks apply across rooms.
 */
package com.hyperbabel.demo.api

import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.Path

interface UsersService {
    @POST("api/v1/users/block")
    suspend fun blockUser(@Body body: Map<String, String>)

    @HTTP(method = "DELETE", path = "api/v1/users/block", hasBody = true)
    suspend fun unblockUser(@Body body: Map<String, String>)

    @GET("api/v1/users/{userId}/blocks")
    suspend fun getBlockList(@Path("userId") userId: String): JsonObject
}
