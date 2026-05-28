/*
 * Sign-up screen — Customer Auth pattern B1.
 *
 * Creates a brand-new Firebase user with email + password, then
 * exchanges the resulting ID token for a HyperBabel customer JWT. The
 * matching `com_users` row is created server-side during exchange, so
 * no extra "create user" call is needed.
 */
import SwiftUI

struct SignUpScreen: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var session: Session

    @State private var email: String = ""
    @State private var password: String = ""
    @State private var displayName: String = ""
    @State private var langCd: String = "en"
    @State private var loading: Bool = false
    @State private var errorMessage: String = ""

    private var firebaseReady: Bool { FirebaseAuthService.isFirebaseReady }

    private static let langs: [(String, String)] = [
        ("en", "English"),
        ("ko", "한국어 (Korean)"),
        ("ja", "日本語 (Japanese)"),
        ("zh", "中文 (Chinese)"),
        ("es", "Español (Spanish)"),
        ("fr", "Français (French)"),
        ("de", "Deutsch (German)"),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Create your account").font(.title2).bold()

                if !firebaseReady {
                    firebaseMissingBanner
                } else {
                    Text("We use Firebase Auth on device, then exchange the ID token for a short-lived HyperBabel customer JWT.")
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
                        Text("Password (at least 6 chars)").font(.caption).foregroundStyle(.secondary)
                        SecureField("••••••••", text: $password)
                            .textFieldStyle(.roundedBorder)
                            #if os(iOS)
                            .textContentType(.newPassword)
                            #endif
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Display Name (optional)").font(.caption).foregroundStyle(.secondary)
                        TextField("Alice", text: $displayName)
                            .textFieldStyle(.roundedBorder)
                    }

                    Text("Preferred Language").font(.caption).foregroundStyle(.secondary)
                    Picker("Preferred Language", selection: $langCd) {
                        ForEach(Self.langs, id: \.0) { code, label in Text(label).tag(code) }
                    }.pickerStyle(.menu)

                    if !errorMessage.isEmpty {
                        Text(errorMessage).foregroundStyle(.red).font(.caption)
                    }

                    Button {
                        Task { await handleSignUp() }
                    } label: {
                        if loading {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text("Create account").frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(loading)
                    .padding(.top, 8)
                }
            }
            .padding(20)
        }
        .navigationTitle("Sign up")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
        }
    }

    private func handleSignUp() async {
        errorMessage = ""
        let em = email.trimmingCharacters(in: .whitespaces)
        if !isValidEmail(em) {
            errorMessage = "Please enter a valid email address."
            return
        }
        if password.count < 6 {
            errorMessage = "Password must be at least 6 characters (Firebase minimum)."
            return
        }
        loading = true
        defer { loading = false }
        do {
            let result = try await FirebaseAuthService.signUpWithEmail(
                em, password: password, preferredLangCd: langCd,
            )
            session.persist(result, fallbackDisplayName: displayName, langCode: langCd)
            await MainActor.run { dismiss() }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func isValidEmail(_ s: String) -> Bool {
        let pattern = #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#
        return s.range(of: pattern, options: .regularExpression) != nil
    }

    private var firebaseMissingBanner: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Firebase config missing").font(.headline).foregroundStyle(.orange)
            Text("Add `GoogleService-Info.plist` to the app bundle (drag from `firebase/` into Xcode). See README → Quickstart for the full setup path.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(12)
        .background(Color.orange.opacity(0.10))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.orange))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}
