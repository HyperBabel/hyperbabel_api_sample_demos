/*
 * HyperBabel API — AI Translation service.
 */
package com.hyperbabel.demo.api

import com.hyperbabel.demo.data.TranslateTextRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface TranslateService {
    @POST("api/v1/translate/text")
    suspend fun translate(@Body body: TranslateTextRequest): Map<String, String>

    @POST("api/v1/translate/detect")
    suspend fun detect(@Body body: Map<String, String>): Map<String, String>

    @GET("api/v1/translate/languages")
    suspend fun languages(): Map<String, Any>
}
