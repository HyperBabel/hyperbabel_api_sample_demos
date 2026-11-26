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

    /// Save the name the user typed to their HyperBabel profile
    /// (PATCH /customer/users/me), right after the token exchange.
    ///
    /// Other members see the profile name, not this device's copy. Without
    /// this call a new user is named after the Firebase account — its display
    /// name, or else its email address. Nothing is sent when the field was
    /// left empty, so an existing profile name is kept.
    @MainActor
    func publishDisplayName(_ typed: String?) async {
        // The server accepts 1–60 characters, counted in UTF-16 units (an
        // emoji can take two), so trim by that count without splitting one.
        var name = ""
        for ch in (typed ?? "").trimmingCharacters(in: .whitespacesAndNewlines) {
            if name.utf16.count + String(ch).utf16.count > 60 { break }
            name.append(ch)
        }
        guard !name.isEmpty else { return }
        do {
            _ = try await UsersService.updateMyDisplayName(name)
        } catch {
            print("[Session] could not save the display name: \(error.localizedDescription)")
        }
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

    /// Sign out on the server first, then on the device.
    ///
    /// POST /customer/logout revokes this device's refresh token (it would
    /// otherwise stay valid for 30 days) and deletes the push token this device
    /// registered, so it stops receiving the previous user's notifications.
    /// A failure there is ignored — local state is cleared either way.
    @MainActor
    func signOut() async {
        if let refreshToken = SecureStore.read(.refreshToken), !refreshToken.isEmpty {
            let pushTokens = PushRegistration.shared.registeredToken.map { [$0] } ?? []
            await ApiClient.shared.logout(refreshToken: refreshToken, pushTokens: pushTokens)
        }
        PushRegistration.shared.forget()
        SecureStore.clearAll()
        FirebaseAuthService.signOut()
        userId = ""
        displayName = ""
        defaults.removeObject(forKey: Keys.userId)
        defaults.removeObject(forKey: Keys.display)
        // Keep lang + apiUrl across sessions — they aren't identity-bound.
    }
}
