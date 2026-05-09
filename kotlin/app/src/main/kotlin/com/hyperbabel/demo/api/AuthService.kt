/*
 * HyperBabel API — auth-level read endpoints. Webhook CRUD lives in the
 * HyperBabel Console at https://console.hyperbabel.com.
 */
package com.hyperbabel.demo.api

import kotlinx.serialization.json.JsonObject
import retrofit2.http.GET

interface AuthService {
    @GET("api/v1/auth/usage")
    suspend fun getUsage(): JsonObject
}
