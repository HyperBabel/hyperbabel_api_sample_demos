/*
 * HyperBabel API — Retrofit-backed HTTP client.
 *
 * Single-instance OkHttp client with a Bearer-token interceptor. The token
 * is read from the in-memory Session object so the Login screen can rotate
 * it without rebuilding the client.
 */
package com.hyperbabel.demo.api

import com.hyperbabel.demo.BuildConfig
import com.hyperbabel.demo.data.Session
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory

object ApiClient {

    val json: Json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = false
    }

    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor { chain ->
                val key = Session.apiKey
                val req = if (key.isNotBlank()) {
                    chain.request().newBuilder()
                        .addHeader("Authorization", "Bearer $key")
                        .build()
                } else chain.request()
                chain.proceed(req)
            }
            .addInterceptor(HttpLoggingInterceptor().setLevel(HttpLoggingInterceptor.Level.BASIC))
            .build()
    }

    private val retrofit: Retrofit by lazy {
        Retrofit.Builder()
            .baseUrl(Session.apiUrl.ensureTrailingSlash())
            .client(httpClient)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
    }

    val unitedChat: UnitedChatService by lazy { retrofit.create(UnitedChatService::class.java) }
    val translate:  TranslateService  by lazy { retrofit.create(TranslateService::class.java) }
    val presence:   PresenceService   by lazy { retrofit.create(PresenceService::class.java) }
    val rtm:        RtmService        by lazy { retrofit.create(RtmService::class.java) }
    val chat:       ChatService       by lazy { retrofit.create(ChatService::class.java) }
    val users:      UsersService      by lazy { retrofit.create(UsersService::class.java) }
    val push:       PushService       by lazy { retrofit.create(PushService::class.java) }
    val auth:       AuthService       by lazy { retrofit.create(AuthService::class.java) }
    val stream:     StreamService     by lazy { retrofit.create(StreamService::class.java) }
    val storage:    StorageService    by lazy { retrofit.create(StorageService::class.java) }

    val defaultApiUrl: String get() = BuildConfig.HB_API_URL
    val defaultApiKey: String get() = BuildConfig.HB_API_KEY

    private fun String.ensureTrailingSlash(): String = if (endsWith("/")) this else "$this/"
}
