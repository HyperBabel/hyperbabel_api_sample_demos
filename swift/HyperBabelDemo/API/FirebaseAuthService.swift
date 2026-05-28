/*
 * HyperBabel Swift Demo — Firebase Auth → Customer JWT bridge
 *
 * Implements pattern B1 from https://hyperbabel.com/docs#customer-auth (Firebase Direct Exchange):
 *
 *   1. The user signs in (or signs up) with Firebase Auth on device.
 *   2. We pull the Firebase ID token from the Firebase user.
 *   3. POST /api/v1/customer/auth/firebase-exchange exchanges the ID
 *      token for a HyperBabel customer JWT pair (access + refresh).
 *   4. The caller (LoginScreen, SignUpScreen) hands the result to
 *      Session.persist(...) which writes the JWT pair to Keychain via
 *      SecureStore. ApiClient attaches it to every subsequent request
 *      and refreshes transparently on 401. The Firebase ID token never
 *      leaves the device after exchange.
 *
 * The app never sees the integrator's org API key — the HyperBabel
 * Worker resolves the org from the Firebase project ID claim after
 * verifying the signature against Google JWKS.
 *
 * Prerequisites:
 *   1. `firebase/GoogleService-Info.plist` installed via Xcode (drag
 *      into Runner target — see firebase/README.md).
 *   2. The chosen sign-in providers (Email/Password, Anonymous, …)
 *      enabled in Firebase Console → Authentication → Sign-in method.
 *   3. Your Firebase project ID allow-listed in HyperBabel Console
 *      → Customer Auth → Add Firebase project.
 */
import Foundation
import FirebaseAuth
import FirebaseCore

struct FirebaseExchangeResult: Decodable {
    let access_token:       String
    let refresh_token:      String
    let expires_at:         Int
    let refresh_expires_at: Int
    let user_id:            String
    let external_user_id:   String
    let org_id:             String
    let session_id:         String
    let preferred_lang_cd:  String?
    let token_type:         String
}

enum FirebaseAuthError: Error, LocalizedError {
    case notConfigured
    case exchangeFailed(message: String)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Firebase is not configured. See README → Quickstart."
        case .exchangeFailed(let message):
            return message
        }
    }
}

enum FirebaseAuthService {
    /// True iff `FirebaseApp.configure()` has been called and at least
    /// one Firebase app is initialised. The sign-in UI uses this to
    /// render a setup notice instead of crashing on the first auth call.
    static var isFirebaseReady: Bool {
        FirebaseApp.app() != nil
    }

    // ── Public flows ────────────────────────────────────────────────────

    static func signInWithEmail(
        _ email: String,
        password: String,
        preferredLangCd: String? = nil,
    ) async throws -> FirebaseExchangeResult {
        guard isFirebaseReady else { throw FirebaseAuthError.notConfigured }
        let result = try await Auth.auth().signIn(withEmail: email, password: password)
        return try await exchange(user: result.user, preferredLangCd: preferredLangCd)
    }

    static func signUpWithEmail(
        _ email: String,
        password: String,
        preferredLangCd: String? = nil,
    ) async throws -> FirebaseExchangeResult {
        guard isFirebaseReady else { throw FirebaseAuthError.notConfigured }
        let result = try await Auth.auth().createUser(withEmail: email, password: password)
        return try await exchange(user: result.user, preferredLangCd: preferredLangCd)
    }

    static func signInAnonymously(
        preferredLangCd: String? = nil,
    ) async throws -> FirebaseExchangeResult {
        guard isFirebaseReady else { throw FirebaseAuthError.notConfigured }
        let result = try await Auth.auth().signInAnonymously()
        return try await exchange(user: result.user, preferredLangCd: preferredLangCd)
    }

    /// Exchange the currently-signed-in Firebase user's ID token for a
    /// customer JWT. Use this after wiring your own provider flow
    /// (Sign in with Apple, Google Sign-In, etc.) once the Firebase
    /// user is already authenticated.
    static func exchangeCurrentUser(
        preferredLangCd: String? = nil,
    ) async throws -> FirebaseExchangeResult {
        guard let user = Auth.auth().currentUser else {
            throw FirebaseAuthError.exchangeFailed(message: "No Firebase user is currently signed in")
        }
        return try await exchange(user: user, preferredLangCd: preferredLangCd)
    }

    static func signOut() {
        try? Auth.auth().signOut()
    }

    // ── Internals ───────────────────────────────────────────────────────

    private static func exchange(
        user: User,
        preferredLangCd: String?,
    ) async throws -> FirebaseExchangeResult {
        let idToken = try await user.getIDToken(forcingRefresh: true)
        let baseUrl = Session.shared.apiUrl
        guard let url = URL(string: "\(baseUrl)/customer/auth/firebase-exchange") else {
            throw FirebaseAuthError.exchangeFailed(message: "Invalid base URL")
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.addValue("application/json",       forHTTPHeaderField: "Content-Type")
        req.addValue("Bearer \(idToken)",      forHTTPHeaderField: "Authorization")

        let body: [String: Any] = preferredLangCd.map { ["preferred_lang_cd": $0] } ?? [:]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            let message = String(data: data, encoding: .utf8) ?? "HTTP \(status)"
            throw FirebaseAuthError.exchangeFailed(message: message)
        }
        do {
            return try JSONDecoder().decode(FirebaseExchangeResult.self, from: data)
        } catch {
            throw FirebaseAuthError.exchangeFailed(message: "Decode failed: \(error.localizedDescription)")
        }
    }
}
