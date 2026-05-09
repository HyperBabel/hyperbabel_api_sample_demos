/*
 * In-memory session — survives navigation but not process death. Production
 * apps should persist this to Keychain.
 */
import Foundation
import Combine

final class Session: ObservableObject {
    static let shared = Session()

    @Published var userId: String = ""
    @Published var displayName: String = ""
    @Published var preferredLangCd: String = "en"
    @Published var apiUrl: String = ApiClient.defaultApiUrl
    @Published var apiKey: String = ApiClient.defaultApiKey

    var isSignedIn: Bool { !userId.isEmpty && !apiKey.isEmpty }

    func signIn(userId: String, displayName: String, langCd: String, apiKey: String, apiUrl: String) {
        self.userId = userId
        self.displayName = displayName.isEmpty ? userId : displayName
        self.preferredLangCd = langCd
        self.apiKey = apiKey
        self.apiUrl = apiUrl.isEmpty ? ApiClient.defaultApiUrl : apiUrl
    }

    func signOut() {
        userId = ""
        displayName = ""
    }
}
