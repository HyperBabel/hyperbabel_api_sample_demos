/*
 * HyperBabel API — Retrofit-backed HTTP client (Customer Auth B1).
 *
 * Reads the customer JWT from EncryptedSharedPreferences on every
 * request, attaches it as `Authorization: Bearer …`, and refreshes
 * transparently via POST /customer/refresh on 401 (Retrofit
 * Authenticator).
 *
 * The integrator's organization API key (`hb_live_…` / `hb_test_…`)
 * MUST NOT ship in the app binary. The client throws on any request
 * that would carry one — that catches accidental copies from
 * server-side examples before they reach production.
 */
package com.hyperbabel.demo.api

import com.hyperbabel.demo.BuildConfig
import com.hyperbabel.demo.data.SecureStore
import com.hyperbabel.demo.data.Session
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.io.IOException
import java.util.concurrent.atomic.AtomicReference

object ApiClient {

    /** Refresh proactively when fewer than this many seconds remain.
     *  Matches https://hyperbabel.com/docs#customer-auth guidance. */
    private const val REFRESH_LEAD_SECONDS: Long = 300L

    val json: Json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = false
    }

    @Serializable
    private data class RefreshRequest(val refresh_token: String)

    @Serializable
    private data class RefreshResponse(
        val access_token:  String,
        val refresh_token: String,
        val expires_at:    Long,
    )

    /** Shared inflight refresh so a burst of expirations only triggers
     *  a single POST /customer/refresh round-trip. */
    private val refreshInflight = AtomicReference<String?>(null)
    private val refreshLock = Any()

    // ── Startup guard ───────────────────────────────────────────────────

    private fun assertNotOrgKey(token: String) {
        if (token.startsWith("hb_live_") || token.startsWith("hb_test_")) {
            throw IOException(
                "HyperBabel security: refusing to send an org API key from " +
                "the device. Only customer JWTs (issued by " +
                "/customer/auth/firebase-exchange or /customer/issue-token) " +
                "belong here.",
            )
        }
    }

    // ── Token helpers ───────────────────────────────────────────────────

    private fun currentAccessToken(): String? {
        val token = SecureStore.read(SecureStore.KEY_ACCESS_TOKEN) ?: return null
        if (token.isBlank()) return null
        val expiresAt = SecureStore.readLong(SecureStore.KEY_EXPIRES_AT) ?: return token
        val secondsLeft = expiresAt - (System.currentTimeMillis() / 1000)
        if (secondsLeft > REFRESH_LEAD_SECONDS) return token
        return attemptRefresh() ?: token
    }

    private fun attemptRefresh(): String? {
        synchronized(refreshLock) {
            val refreshToken = SecureStore.read(SecureStore.KEY_REFRESH_TOKEN) ?: return null
            if (refreshToken.isBlank()) return null

            // Use the bare OkHttpClient (not our intercepted one) so this
            // call doesn't recurse through the authenticator.
            val body = json.encodeToString(
                RefreshRequest.serializer(),
                RefreshRequest(refresh_token = refreshToken),
            ).toRequestBody("application/json".toMediaType())
            val req = Request.Builder()
                .url("${Session.apiUrl.trimEnd('/')}/customer/refresh")
                .post(body)
                .addHeader("Content-Type", "application/json")
                .build()
            return try {
                bareClient.newCall(req).execute().use { response ->
                    if (!response.isSuccessful) return null
                    val text = response.body?.string() ?: return null
                    val refreshed = json.decodeFromString(RefreshResponse.serializer(), text)
                    SecureStore.write(SecureStore.KEY_ACCESS_TOKEN,  refreshed.access_token)
                    SecureStore.write(SecureStore.KEY_REFRESH_TOKEN, refreshed.refresh_token)
                    SecureStore.writeLong(SecureStore.KEY_EXPIRES_AT, refreshed.expires_at)
                    refreshed.access_token
                }
            } catch (_: Exception) {
                null
            }
        }
    }

    // ── HTTP stack ──────────────────────────────────────────────────────

    private val bareClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor(HttpLoggingInterceptor().setLevel(HttpLoggingInterceptor.Level.BASIC))
            .build()
    }

    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor { chain ->
                val token = currentAccessToken()
                val req = if (token != null) {
                    assertNotOrgKey(token)
                    chain.request().newBuilder()
                        .addHeader("Authorization", "Bearer $token")
                        .build()
                } else chain.request()
                chain.proceed(req)
            }
            .authenticator(refreshAuthenticator)
            .addInterceptor(HttpLoggingInterceptor().setLevel(HttpLoggingInterceptor.Level.BASIC))
            .build()
    }

    /** Retrofit Authenticator triggered on every 401 — single retry with
     *  the refreshed token. */
    private val refreshAuthenticator = Authenticator { _: Route?, response: Response ->
        // Avoid an infinite loop if the 401 is from the retry itself.
        if (response.priorResponse != null) return@Authenticator null
        val refreshed = attemptRefresh() ?: return@Authenticator null
        response.request.newBuilder()
            .header("Authorization", "Bearer $refreshed")
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

    private fun String.ensureTrailingSlash(): String = if (endsWith("/")) this else "$this/"
}
