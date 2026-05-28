/*
 * SecureStore — EncryptedSharedPreferences wrapper for HyperBabel customer
 * JWT pair.
 *
 * Backed by the Android Keystore (AES-256-GCM for values, AES-256-SIV for
 * keys). The HyperBabel customer JWT pair (access + refresh + expires_at)
 * lives here so the API client can rotate it without surfacing the token
 * to UI code.
 *
 * Identity (user_id, display_name, lang) lives in a plain
 * SharedPreferences instance — see Session.kt — because it isn't secret
 * and the user edits it through the Settings screen.
 *
 * Must be initialised from MainActivity before the first ApiClient
 * request (call `SecureStore.init(applicationContext)`).
 */
package com.hyperbabel.demo.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

object SecureStore {
    private const val FILE_NAME = "hb_customer_auth"

    const val KEY_ACCESS_TOKEN  = "hb_access_token"
    const val KEY_REFRESH_TOKEN = "hb_refresh_token"
    const val KEY_EXPIRES_AT    = "hb_expires_at"

    @Volatile private var prefs: SharedPreferences? = null

    fun init(context: Context) {
        if (prefs != null) return
        synchronized(this) {
            if (prefs != null) return
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            prefs = EncryptedSharedPreferences.create(
                context.applicationContext,
                FILE_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        }
    }

    private val store: SharedPreferences
        get() = prefs ?: error(
            "SecureStore.init(context) was not called — call it from MainActivity.onCreate()",
        )

    fun read(key: String): String? = store.getString(key, null)?.takeIf { it.isNotEmpty() }
    fun readLong(key: String): Long? = store.getLong(key, -1L).takeIf { it >= 0L }

    fun write(key: String, value: String) {
        store.edit().putString(key, value).apply()
    }
    fun writeLong(key: String, value: Long) {
        store.edit().putLong(key, value).apply()
    }

    fun clearAll() {
        store.edit()
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .remove(KEY_EXPIRES_AT)
            .apply()
    }
}
