/*
 * Login screen — Customer Auth pattern B1 (Firebase Direct Exchange).
 *
 *   1. The user signs in with Firebase Auth (Email/Password by default;
 *      a one-tap "Anonymous" button is exposed for kiosk-style use).
 *   2. We exchange the resulting Firebase ID token for a HyperBabel
 *      customer JWT via POST /customer/auth/firebase-exchange.
 *   3. Session.persist(...) writes the JWT pair to Keychain via
 *      SecureStore; ApiClient attaches it to every subsequent request.
 *
 * If Firebase isn't initialised (no GoogleService-Info.plist in the
 * bundle) the screen renders a setup-help banner instead of the form.
 */
import SwiftUI

private let LANGS: [(String, String)] = [
    ("en", "English"),
    ("ko", "한국어 (Korean)"),
    ("ja", "日本語 (Japanese)"),
    ("zh", "中文 (Chinese)"),
    ("es", "Español (Spanish)"),
    ("fr", "Français (French)"),
    ("de", "Deutsch (German)"),
]

struct LoginScreen: View {
    @EnvironmentObject var session: Session

    @State private var email: String = ""
    @State private var password: String = ""
    @State private var displayName: String = ""
    @State private var langCd: String = "en"
    @State private var loading: Bool = false
    @State private var errorMessage: String = ""
    @State private var showSignUp: Bool = false

    private var firebaseReady: Bool { FirebaseAuthService.isFirebaseReady }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Sign in to the demo").font(.title2).bold()

                if !firebaseReady {
                    firebaseMissingBanner
                } else {
                    Text("Sign in with Firebase. We exchange the ID token for a short-lived HyperBabel customer JWT — your org API key never ships in this app.")
                        .font(.callout).foregroundStyle(.secondary)

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Email").font(.caption).foregroundStyle(.secondary)
                        TextField("you@example.com", text: $email)
                            .textFieldStyle(.roundedBorder)
                            .autocorrectionDisabled(true)
                            #if os(iOS)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .textContentType(.emailAddress)
                            #endif
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Password").font(.caption).foregroundStyle(.secondary)
                        SecureField("••••••••", text: $password)
                            .textFieldStyle(.roundedBorder)
                            #if os(iOS)
                            .textContentType(.password)
                            #endif
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Display Name (optional)").font(.caption).foregroundStyle(.secondary)
                        TextField("Alice", text: $displayName)
                            .textFieldStyle(.roundedBorder)
                    }

                    Text("Preferred Language").font(.caption).foregroundStyle(.secondary)
                    Picker("Preferred Language", selection: $langCd) {
                        ForEach(LANGS, id: \.0) { code, label in Text(label).tag(code) }
                    }.pickerStyle(.menu)

                    if !errorMessage.isEmpty {
                        Text(errorMessage).foregroundStyle(.red).font(.caption)
                    }

                    Button {
                        Task { await handleEmailSignIn() }
                    } label: {
                        if loading {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text("Sign in →").frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(loading)
                    .padding(.top, 8)

                    HStack {
                        VStack { Divider() }
                        Text("or").font(.caption2).foregroundStyle(.secondary)
                        VStack { Divider() }
                    }
                    .padding(.vertical, 4)

                    Button {
                        Task { await handleAnonymousSignIn() }
                    } label: {
                        Text("Continue anonymously (kiosk mode)")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .disabled(loading)

                    Button("New here? Create an account") {
                        showSignUp = true
                    }
                    .font(.callout)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 12)
                }
            }
            .padding(20)
        }
        .navigationTitle("HyperBabel Demo")
        .sheet(isPresented: $showSignUp) {
            NavigationStack {
                SignUpScreen().environmentObject(session)
            }
        }
    }

    // ── Handlers ────────────────────────────────────────────────────────

    private func handleEmailSignIn() async {
        errorMessage = ""
        let em = email.trimmingCharacters(in: .whitespaces)
        if em.isEmpty || password.isEmpty {
            errorMessage = "Please enter your email and password."
            return
        }
        loading = true
        defer { loading = false }
        do {
            let result = try await FirebaseAuthService.signInWithEmail(
                em, password: password, preferredLangCd: langCd,
            )
            await finishSignIn(result)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func handleAnonymousSignIn() async {
        errorMessage = ""
        loading = true
        defer { loading = false }
        do {
            let result = try await FirebaseAuthService.signInAnonymously(
                preferredLangCd: langCd,
            )
            await finishSignIn(result)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func finishSignIn(_ result: FirebaseExchangeResult) async {
        session.persist(result, fallbackDisplayName: displayName, langCode: langCd)
        // Best-effort push token registration. Failures don't block sign-in
        // and don't surface to the user — production apps swap the synthetic
        // token below for the real APNs token.
        Task {
            let token = "demo-ios-\(Int(Date().timeIntervalSince1970))"
            _ = try? await PushService.register(
                userId: result.external_user_id,
                token: token,
                platform: "ios",
            )
        }
    }

    private var firebaseMissingBanner: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Firebase config missing").font(.headline).foregroundStyle(.orange)
            Text("Add `GoogleService-Info.plist` to the app bundle (drag from `firebase/` into Xcode). See README → Quickstart and `firebase/README.md` for the full setup path, including how to allow-list your Firebase project in HyperBabel Console → Customer Auth.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(12)
        .background(Color.orange.opacity(0.10))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.orange))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}
