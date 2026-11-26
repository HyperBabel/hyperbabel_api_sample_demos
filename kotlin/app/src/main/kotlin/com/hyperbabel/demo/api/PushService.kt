/*
 * HyperBabel API — push notification token management.
 *
 * HyperBabel delivers push notifications only to FCM registration tokens
 * (on iOS too — the token from Firebase Messaging). Tokens FCM rejects are pruned
 * on the server, so never register a placeholder — register the token
 * Firebase Messaging gives this device, as [PushRegistration] does.
 */
package com.hyperbabel.demo.api

import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import com.hyperbabel.demo.data.Session
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.Query
import java.util.concurrent.atomic.AtomicBoolean

interface PushService {
    /** Body: `{ user_id, token, platform, token_type? }` — `user_id` must be your own. */
    @POST("push/register")
    suspend fun registerToken(@Body body: Map<String, String>)

    @HTTP(method = "DELETE", path = "push/unregister", hasBody = true)
    suspend fun unregisterToken(@Body body: Map<String, String>)

    @GET("push/tokens")
    suspend fun getTokens(@Query("user_id") userId: String): JsonObject
}

/**
 * Registers this device's FCM token for the signed-in user.
 *
 * This is the one place the app hands its push token to HyperBabel. It runs
 * once per app launch while someone is signed in (MainActivity), which also
 * picks up a token Firebase rotated since the last launch. A production app
 * should additionally call [registerToken] from its
 * `FirebaseMessagingService.onNewToken`, and on Android 13+ request the
 * POST_NOTIFICATIONS permission before notifications can be shown.
 *
 * The registered token is remembered in [Session.pushToken] so sign-out can
 * pass it to `POST /customer/logout`, which deletes it on the server.
 */
object PushRegistration {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val started = AtomicBoolean(false)

    /** Fire-and-forget. A failure never blocks the app — push is optional. */
    fun registerThisDevice() {
        if (!FirebaseAuthService.isFirebaseReady) return
        if (!started.compareAndSet(false, true)) return
        val userId = Session.userId
        if (userId.isBlank()) { started.set(false); return }
        scope.launch {
            try {
                val token = FirebaseMessaging.getInstance().token.await()
                if (token.isNullOrBlank()) return@launch
                ApiClient.push.registerToken(
                    mapOf(
                        "user_id"    to userId,
                        "token"      to token,
                        "platform"   to "android",
                        "token_type" to "fcm",
                    ),
                )
                // Signed out (or switched user) while the request was in flight.
                if (Session.userId == userId) Session.pushToken = token
            } catch (t: Throwable) {
                // No Google Play services, no network, … — try again on the next launch.
                Log.w("PushRegistration", "FCM token registration failed: ${t.message}")
                started.set(false)
            }
        }
    }

    /** Call on sign-out so the next user registers again. */
    fun reset() {
        started.set(false)
    }
}
