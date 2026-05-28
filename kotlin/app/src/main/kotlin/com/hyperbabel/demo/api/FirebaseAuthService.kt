/*
 * HyperBabel Kotlin Demo — Firebase Auth → Customer JWT bridge
 *
 * Implements pattern B1 from https://hyperbabel.com/docs#customer-auth (Firebase Direct
 * Exchange):
 *
 *   1. The user signs in (or signs up) with Firebase Auth on device.
 *   2. We pull the Firebase ID token from the FirebaseUser.
 *   3. POST /api/v1/customer/auth/firebase-exchange exchanges the ID
 *      token for a HyperBabel customer JWT pair (access + refresh).
 *   4. The caller (LoginScreen, SignUpScreen) hands the result to
 *      Session.persist(...) which writes the JWT pair to
 *      EncryptedSharedPreferences via SecureStore. ApiClient attaches
 *      it to every subsequent request and refreshes transparently on
 *      401. The Firebase ID token never leaves the device after
 *      exchange.
 *
 * The app never sees the integrator's org API key — the HyperBabel
 * Worker resolves the org from the Firebase project ID claim after
 * verifying the signature against Google JWKS.
 *
 * Prerequisites:
 *   1. firebase/google-services.json present at the project root (the
 *      copy task in app/build.gradle.kts moves it to app/ on every
 *      build — see firebase/README.md).
 *   2. Sign-in providers (Email/Password, Anonymous, …) enabled in
 *      Firebase Console → Authentication → Sign-in method.
 *   3. Your Firebase project ID allow-listed in HyperBabel Console
 *      → Customer Auth → Add Firebase project.
 */
package com.hyperbabel.demo.api

import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.hyperbabel.demo.data.Session
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Serializable
data class FirebaseExchangeResult(
    val access_token:       String,
    val refresh_token:      String,
    val expires_at:         Long,
    val refresh_expires_at: Long,
    val user_id:            String,
    val external_user_id:   String,
    val org_id:             String,
    val session_id:         String,
    val preferred_lang_cd:  String? = null,
    val token_type:         String  = "Bearer",
)

@Serializable
private data class ExchangeRequest(val preferred_lang_cd: String? = null)

class FirebaseNotConfiguredException :
    IllegalStateException("Firebase is not configured. See README → Quickstart.")

class ExchangeException(message: String) : IOException(message)

object FirebaseAuthService {
    private val http: OkHttpClient by lazy { OkHttpClient() }
    private val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    /** True iff FirebaseApp has been initialised. The sign-in UI uses
     *  this to render a setup notice instead of crashing on the first
     *  auth call. */
    val isFirebaseReady: Boolean
        get() = try {
            FirebaseApp.getInstance(); true
        } catch (_: IllegalStateException) { false }

    // ── Public flows ────────────────────────────────────────────────────

    suspend fun signInWithEmail(
        email: String,
        password: String,
        preferredLangCd: String? = null,
    ): FirebaseExchangeResult {
        if (!isFirebaseReady) throw FirebaseNotConfiguredException()
        val result = FirebaseAuth.getInstance()
            .signInWithEmailAndPassword(email, password).await()
        return exchange(result.user ?: error("No user from sign-in"), preferredLangCd)
    }

    suspend fun signUpWithEmail(
        email: String,
        password: String,
        preferredLangCd: String? = null,
    ): FirebaseExchangeResult {
        if (!isFirebaseReady) throw FirebaseNotConfiguredException()
        val result = FirebaseAuth.getInstance()
            .createUserWithEmailAndPassword(email, password).await()
        return exchange(result.user ?: error("No user from sign-up"), preferredLangCd)
    }

    suspend fun signInAnonymously(
        preferredLangCd: String? = null,
    ): FirebaseExchangeResult {
        if (!isFirebaseReady) throw FirebaseNotConfiguredException()
        val result = FirebaseAuth.getInstance().signInAnonymously().await()
        return exchange(result.user ?: error("No user from anonymous sign-in"), preferredLangCd)
    }

    /** Exchange the currently signed-in Firebase user's ID token for a
     *  customer JWT. Use after wiring your own provider flow
     *  (Google Sign-In, Email Link, etc.) once the Firebase user is
     *  already authenticated. */
    suspend fun exchangeCurrentUser(
        preferredLangCd: String? = null,
    ): FirebaseExchangeResult {
        val user = FirebaseAuth.getInstance().currentUser
            ?: throw ExchangeException("No Firebase user is currently signed in")
        return exchange(user, preferredLangCd)
    }

    fun signOut() {
        runCatching { FirebaseAuth.getInstance().signOut() }
    }

    // ── Internals ───────────────────────────────────────────────────────

    private suspend fun exchange(
        user: FirebaseUser,
        preferredLangCd: String?,
    ): FirebaseExchangeResult = withContext(Dispatchers.IO) {
        val idToken = user.getIdToken(true).await().token
            ?: throw ExchangeException("Failed to obtain Firebase ID token")

        val body = json.encodeToString(
            ExchangeRequest.serializer(),
            ExchangeRequest(preferred_lang_cd = preferredLangCd),
        ).toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url("${Session.apiUrl.trimEnd('/')}/customer/auth/firebase-exchange")
            .addHeader("Authorization", "Bearer $idToken")
            .addHeader("Content-Type", "application/json")
            .post(body)
            .build()

        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw ExchangeException("Exchange failed: HTTP ${response.code} — $text")
            }
            json.decodeFromString(FirebaseExchangeResult.serializer(), text)
        }
    }
}
