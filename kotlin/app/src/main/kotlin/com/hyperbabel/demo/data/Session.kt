/*
 * In-memory session — survives navigation but not process death. Production
 * apps should persist this to EncryptedSharedPreferences or DataStore.
 */
package com.hyperbabel.demo.data

import com.hyperbabel.demo.BuildConfig

object Session {
    var userId: String = ""
    var displayName: String = ""
    var preferredLangCd: String = "en"
    var apiUrl: String = BuildConfig.HB_API_URL
    var apiKey: String = BuildConfig.HB_API_KEY
    val isSignedIn: Boolean get() = userId.isNotBlank() && apiKey.isNotBlank()
}
