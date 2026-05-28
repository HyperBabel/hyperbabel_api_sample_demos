/*
 * Session — identity + preferences kept in @Published state for SwiftUI,
 * backed by UserDefaults for restart-survival. The customer JWT pair
 * lives in Keychain (see SecureStore.swift) so ApiClient can rotate it
 * without round-tripping through SwiftUI.
 *
 * Single mode: Customer Auth pattern B1 (Firebase Direct Exchange).
 * See https://hyperbabel.com/docs#customer-auth for the full architecture.
 */
import Foundation
import Combine

final class Session: ObservableObject {
    static let shared = Session()

    @Published var userId: String
    @Published var displayName: String
    @Published var preferredLangCd: String
    @Published var apiUrl: String

    private let defaults = UserDefaults.standard
    private enum Keys {
        static let userId   = "hb_user_id"
        static let display  = "hb_user_name"
        static let lang     = "hb_lang"
        static let apiUrl   = "hb_api_url"
    }

    private init() {
        self.userId          = defaults.string(forKey: Keys.userId)  ?? ""
        self.displayName     = defaults.string(forKey: Keys.display) ?? ""
        self.preferredLangCd = defaults.string(forKey: Keys.lang)    ?? "en"
        self.apiUrl          = defaults.string(forKey: Keys.apiUrl)
            ?? ApiClient.defaultApiUrl
    }

    /// True iff we have an identity AND a customer JWT in Keychain.
    var isSignedIn: Bool {
        !userId.isEmpty && SecureStore.read(.accessToken) != nil
    }

    // ── Persist the result of a Firebase Direct Exchange ───────────────

    func persist(_ result: FirebaseExchangeResult, fallbackDisplayName: String?, langCode: String) {
        SecureStore.write(.accessToken,  result.access_token)
        SecureStore.write(.refreshToken, result.refresh_token)
        SecureStore.writeInt(.expiresAt, result.expires_at)

        let resolvedName = (fallbackDisplayName?.trimmingCharacters(in: .whitespaces).isEmpty == false)
            ? fallbackDisplayName!.trimmingCharacters(in: .whitespaces)
            : String(result.external_user_id.prefix(8))
        let resolvedLang = result.preferred_lang_cd ?? langCode

        userId          = result.external_user_id
        displayName     = resolvedName
        preferredLangCd = resolvedLang

        defaults.set(result.external_user_id, forKey: Keys.userId)
        defaults.set(resolvedName,            forKey: Keys.display)
        defaults.set(resolvedLang,            forKey: Keys.lang)
    }

    func updateLang(_ langCode: String) {
        preferredLangCd = langCode
        defaults.set(langCode, forKey: Keys.lang)
    }

    func setApiUrl(_ url: String) {
        let trimmed = url.trimmingCharacters(in: .whitespaces)
        apiUrl = trimmed.isEmpty ? ApiClient.defaultApiUrl : trimmed
        defaults.set(apiUrl, forKey: Keys.apiUrl)
    }

    func signOut() {
        SecureStore.clearAll()
        FirebaseAuthService.signOut()
        userId = ""
        displayName = ""
        defaults.removeObject(forKey: Keys.userId)
        defaults.removeObject(forKey: Keys.display)
        // Keep lang + apiUrl across sessions — they aren't identity-bound.
    }
}
