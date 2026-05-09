/*
 * Login screen — captures the user's identity for this demo session.
 *
 * The HyperBabel Console is the source of truth for production accounts;
 * this screen is a simulator that simply seeds Session state so the rest
 * of the demo has someone to talk to.
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

    @State private var userId: String = ""
    @State private var displayName: String = ""
    @State private var apiKey: String = ApiClient.defaultApiKey
    @State private var apiUrl: String = ApiClient.defaultApiUrl
    @State private var langCd: String = "en"
    @State private var error: String = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Sign in to the demo").font(.title2).bold()
                Text("Enter a user identity for this demo session. In production these fields come from your own auth flow.")
                    .font(.callout).foregroundStyle(.secondary)

                field(label: "User ID", text: $userId, placeholder: "e.g. developer-001")
                field(label: "Display Name", text: $displayName, placeholder: "Alice")

                Text("Preferred Language").font(.caption).foregroundStyle(.secondary)
                Picker("Preferred Language", selection: $langCd) {
                    ForEach(LANGS, id: \.0) { code, label in Text(label).tag(code) }
                }.pickerStyle(.menu)

                field(label: "API Key", text: $apiKey, placeholder: "hb_live_…")
                field(label: "API Base URL", text: $apiUrl, placeholder: "https://api.hyperbabel.com/api/v1")

                Text("Use http://localhost:8787/api/v1 to talk to a local HyperBabel API server (wrangler dev) on the iOS Simulator.")
                    .font(.caption2).foregroundStyle(.secondary)

                if !error.isEmpty {
                    Text(error).foregroundStyle(.red).font(.caption)
                }

                Button {
                    let trimmedId = userId.trimmingCharacters(in: .whitespaces)
                    if trimmedId.isEmpty { error = "User ID is required."; return }
                    if apiKey.trimmingCharacters(in: .whitespaces).isEmpty { error = "API Key is required."; return }
                    session.signIn(
                        userId: trimmedId,
                        displayName: displayName.trimmingCharacters(in: .whitespaces),
                        langCd: langCd,
                        apiKey: apiKey.trimmingCharacters(in: .whitespaces),
                        apiUrl: apiUrl.trimmingCharacters(in: .whitespaces)
                    )
                    // Auto-register a synthetic iOS push token so the
                    // platform notification surface lights up end-to-end.
                    // Production apps swap this for the real APNs token.
                    Task {
                        let token = "demo-ios-\(Int(Date().timeIntervalSince1970))"
                        _ = try? await PushService.register(
                            userId: trimmedId,
                            token: token,
                            platform: "ios"
                        )
                    }
                } label: {
                    Text("Sign in →").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .padding(.top, 8)
            }
            .padding(20)
        }
        .navigationTitle("HyperBabel Demo")
    }

    @ViewBuilder
    private func field(label: String, text: Binding<String>, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            TextField(placeholder, text: text)
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled(true)
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif
        }
    }
}
