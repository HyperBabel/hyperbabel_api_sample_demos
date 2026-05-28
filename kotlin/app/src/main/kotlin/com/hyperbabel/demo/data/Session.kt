/*
 * Session — identity + preferences, persisted across launches.
 *
 * The customer JWT pair lives in EncryptedSharedPreferences (see
 * SecureStore.kt) so ApiClient can rotate it on 401 without
 * round-tripping through Compose state.
 *
 * Single mode: Customer Auth pattern B1 (Firebase Direct Exchange).
 * See https://hyperbabel.com/docs#customer-auth for the full architecture.
 */
package com.hyperbabel.demo.data

import android.content.Context
import android.content.SharedPreferences
import com.hyperbabel.demo.BuildConfig
import com.hyperbabel.demo.api.FirebaseAuthService
import com.hyperbabel.demo.api.FirebaseExchangeResult

object Session {
    private const val FILE_NAME = "hb_session"

    private const val KEY_USER_ID  = "hb_user_id"
    private const val KEY_USERNAME = "hb_user_name"
    private const val KEY_LANG     = "hb_lang"
    private const val KEY_API_URL  = "hb_api_url"

    @Volatile private var prefs: SharedPreferences? = null

    /** Must be called from MainActivity before any field is read. */
    fun init(context: Context) {
        if (prefs != null) return
        synchronized(this) {
            if (prefs != null) return
            prefs = context.applicationContext
                .getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
        }
    }

    private val store: SharedPreferences
        get() = prefs ?: error(
            "Session.init(context) was not called — call it from MainActivity.onCreate()",
        )

    var userId: String
        get() = store.getString(KEY_USER_ID, "") ?: ""
        private set(value) { store.edit().putString(KEY_USER_ID, value).apply() }

    var displayName: String
        get() = store.getString(KEY_USERNAME, "") ?: ""
        private set(value) { store.edit().putString(KEY_USERNAME, value).apply() }

    var preferredLangCd: String
        get() = store.getString(KEY_LANG, "en") ?: "en"
        private set(value) { store.edit().putString(KEY_LANG, value).apply() }

    var apiUrl: String
        get() = store.getString(KEY_API_URL, BuildConfig.HB_API_URL) ?: BuildConfig.HB_API_URL
        set(value) {
            val trimmed = value.trim()
            store.edit().putString(KEY_API_URL, trimmed.ifEmpty { BuildConfig.HB_API_URL }).apply()
        }

    /** True iff we have an identity AND a customer JWT in secure storage. */
    val isSignedIn: Boolean
        get() = userId.isNotBlank() &&
            !SecureStore.read(SecureStore.KEY_ACCESS_TOKEN).isNullOrBlank()

    /** Persist the result of a Firebase Direct Exchange. */
    fun persist(
        result: FirebaseExchangeResult,
        fallbackDisplayName: String?,
        langCode: String,
    ) {
        SecureStore.write(SecureStore.KEY_ACCESS_TOKEN,  result.access_token)
        SecureStore.write(SecureStore.KEY_REFRESH_TOKEN, result.refresh_token)
        SecureStore.writeLong(SecureStore.KEY_EXPIRES_AT, result.expires_at)

        val trimmed = fallbackDisplayName?.trim().orEmpty()
        val resolvedName = if (trimmed.isNotEmpty()) trimmed
            else result.external_user_id.take(8)
        val resolvedLang = result.preferred_lang_cd ?: langCode

        userId          = result.external_user_id
        displayName     = resolvedName
        preferredLangCd = resolvedLang
    }

    fun updateLang(langCode: String) {
        preferredLangCd = langCode
    }

    fun signOut() {
        SecureStore.clearAll()
        FirebaseAuthService.signOut()
        userId = ""
        displayName = ""
        // Keep lang + apiUrl across sessions — they aren't identity-bound.
    }
}
