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
 *
 * Base URL: `Session.apiUrl` already ends in `/api/v1` (default
 * `https://api.hyperbabel.com/api/v1`). Every Retrofit path in the
 * service interfaces is RELATIVE to it — `unitedchat/rooms`, never
 * `api/v1/unitedchat/rooms` (that would request /api/v1/api/v1/… → 404)
 * and never a leading `/` (that would drop the /api/v1 segment).
 *
 * Errors: every non-2xx answer is thrown as [ApiException], whose message
 * keeps the server's own error text (see [parseApiError]).
 */
package com.hyperbabel.demo.api

import com.hyperbabel.demo.BuildConfig
import com.hyperbabel.demo.data.SecureStore
import com.hyperbabel.demo.data.Session
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import okhttp3.Authenticator
import okhttp3.Interceptor
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
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * A non-2xx HyperBabel API answer. [message] is "HTTP <status>: <server
 * message>"; [code] is the machine-readable `error.code` when the server
 * sent one (e.g. `plan_upgrade_required`, `forbidden`).
 */
class ApiException(
    val status: Int,
    val code: String?,
    message: String,
) : IOException(message)

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

    @Serializable
    private data class LogoutRequest(
        val refresh_token: String,
        val push_tokens:   List<String>,
    )

    /** Shared inflight refresh so a burst of expirations only triggers
     *  a single POST /customer/refresh round-trip. */
    private val refreshInflight = AtomicReference<String?>(null)
    private val refreshLock = Any()

    // ── Error parsing ───────────────────────────────────────────────────

    /**
     * Turn a non-2xx answer into an [ApiException] that keeps the server's
     * message. The API uses two error shapes — handle both:
     *
     *   { "error": { "code": "forbidden", "message": "…" } }
     *   { "error": "Firebase project \"…\" is not registered with HyperBabel" }
     */
    fun parseApiError(status: Int, body: String?): ApiException {
        val error = runCatching {
            (json.parseToJsonElement(body.orEmpty()) as? JsonObject)?.get("error")
        }.getOrNull()
        var code: String? = null
        val serverMessage: String? = when (error) {
            is JsonObject -> {
                code = (error["code"] as? JsonPrimitive)?.contentOrNull
                (error["message"] as? JsonPrimitive)?.contentOrNull ?: code
            }
            is JsonPrimitive -> error.contentOrNull
            else -> null
        }
        val text = serverMessage
            ?: body?.trim()?.take(200)?.takeIf { it.isNotEmpty() }
            ?: "request failed"
        return ApiException(status, code, "HTTP $status: $text")
    }

    /** Outermost interceptor: runs after the 401 refresh retry has settled. */
    private val errorInterceptor = Interceptor { chain ->
        val response = chain.proceed(chain.request())
        if (response.isSuccessful) return@Interceptor response
        val body = runCatching { response.peekBody(64 * 1024L).string() }.getOrNull()
        response.close()
        throw parseApiError(response.code, body)
    }

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

    // ── Logout ──────────────────────────────────────────────────────────

    /**
     * Sign this device out on the server: `POST /customer/logout
     * { refresh_token, push_tokens }`. It revokes the session behind the
     * refresh token (which otherwise stays valid for 30 days) and deletes the
     * push tokens this device registered, so the device stops receiving the
     * previous user's notifications.
     *
     * Call it BEFORE clearing local state — it needs the stored refresh token.
     * It takes no Authorization header (the refresh token in the body is the
     * credential), so it goes out on the bare client. Best-effort: any failure
     * is ignored so sign-out always completes locally.
     */
    suspend fun logout(pushTokens: List<String>) {
        val refreshToken = SecureStore.read(SecureStore.KEY_REFRESH_TOKEN) ?: return
        withContext(Dispatchers.IO) {
            runCatching {
                val body = json.encodeToString(
                    LogoutRequest.serializer(),
                    LogoutRequest(refresh_token = refreshToken, push_tokens = pushTokens.distinct()),
                ).toRequestBody("application/json".toMediaType())
                val req = Request.Builder()
                    .url("${Session.apiUrl.trimEnd('/')}/customer/logout")
                    .post(body)
                    .build()
                // Bounded, so a slow network cannot hold the user on the screen.
                bareClient.newBuilder()
                    .callTimeout(5, TimeUnit.SECONDS)
                    .build()
                    .newCall(req)
                    .execute()
                    .close()
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
            .addInterceptor(errorInterceptor)
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

    // No Translation (`/translate/*`) service here on purpose: those endpoints
    // accept only an organization API key, which never ships in an app. Chat
    // messages are translated with `unitedChat.batchTranslateMessages`.
    val unitedChat: UnitedChatService by lazy { retrofit.create(UnitedChatService::class.java) }
    val presence:   PresenceService   by lazy { retrofit.create(PresenceService::class.java) }
    val rtm:        RtmService        by lazy { retrofit.create(RtmService::class.java) }
    val chat:       ChatService       by lazy { retrofit.create(ChatService::class.java) }
    val users:      UsersService      by lazy { retrofit.create(UsersService::class.java) }
    val profile:    ProfileService    by lazy { retrofit.create(ProfileService::class.java) }
    val push:       PushService       by lazy { retrofit.create(PushService::class.java) }
    val stream:     StreamService     by lazy { retrofit.create(StreamService::class.java) }
    val storage:    StorageService    by lazy { retrofit.create(StorageService::class.java) }

    val defaultApiUrl: String get() = BuildConfig.HB_API_URL

    private fun String.ensureTrailingSlash(): String = if (endsWith("/")) this else "$this/"
}
