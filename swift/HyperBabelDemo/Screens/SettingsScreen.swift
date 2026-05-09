/*
 * Settings — Profile / Privacy(Blocked Users) / API Usage / Push Tokens /
 * Language Detection playground / Logout.
 *
 * Webhooks are explicitly excluded — manage them in the HyperBabel Console.
 */
import SwiftUI

struct SettingsScreen: View {
    let onBack: () -> Void
    let onOpenBlocks: () -> Void
    @EnvironmentObject var session: Session

    @State private var usage: UsageStats?
    @State private var tokens: [PushToken] = []
    @State private var loading = true
    @State private var detectInput: String = ""
    @State private var detectResult: String = ""
    @State private var detecting = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Button("← Back", action: onBack).buttonStyle(.bordered)
                    Text("Settings").font(.title2).bold()
                }
                section("Profile")
                row("User ID", session.userId)
                row("API Base URL", session.apiUrl)

                section("Privacy")
                Button(action: onOpenBlocks) {
                    HStack {
                        Text("🚫  Blocked Users")
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                    }.padding(.vertical, 8)
                }.buttonStyle(.plain)

                section("API Usage")
                if loading { Text("Loading…").foregroundStyle(.secondary) }
                else if let u = usage {
                    row("Plan",           u.planName ?? "—")
                    row("Chat Messages",  "\(u.messagesSent ?? 0)")
                    row("Video Minutes",  "\(u.videoMinutes)")
                    row("Stream Minutes", "\(u.streamMinutes)")
                    row("Translate Chars", "\(u.translateChars ?? 0)")
                } else {
                    Text("Unable to load usage stats.").foregroundStyle(.red)
                }

                section("Push Tokens")
                if tokens.isEmpty && !loading {
                    Text("No push tokens registered for this user yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(tokens) { t in
                        HStack {
                            Text(t.platform.uppercased())
                                .font(.caption2.bold())
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Color.accentColor)
                                .foregroundStyle(.white)
                                .cornerRadius(4)
                            Text(short(t.token))
                                .font(.caption.monospaced())
                                .lineLimit(1)
                            Spacer()
                        }
                    }
                }

                section("Language Detection")
                Text("Type any text and tap Detect to see what language the AI Translation engine identifies it as.")
                    .font(.caption).foregroundStyle(.secondary)
                HStack {
                    TextField("Type to detect…", text: $detectInput)
                        .textFieldStyle(.roundedBorder)
                        .autocorrectionDisabled(true)
                    Button(detecting ? "…" : "Detect") {
                        Task { await detect() }
                    }.disabled(detecting)
                }
                if !detectResult.isEmpty {
                    Text(detectResult).padding(8).background(Color.secondary.opacity(0.1)).cornerRadius(8)
                }

                Button(role: .destructive, action: {
                    session.signOut()
                    onBack()
                }) {
                    Text("Logout").frame(maxWidth: .infinity)
                }.buttonStyle(.borderedProminent).padding(.top, 16)
            }
            .padding(16)
        }
        .navigationBarBackButtonHidden(true)
        .task { await load() }
    }

    private func section(_ label: String) -> some View {
        Text(label.uppercased())
            .font(.caption.bold())
            .foregroundStyle(.secondary)
            .padding(.top, 8)
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.subheadline.bold()).lineLimit(1)
        }.padding(.vertical, 4)
    }

    private func short(_ tok: String) -> String {
        guard tok.count > 24 else { return tok }
        return "\(tok.prefix(16))…\(tok.suffix(4))"
    }

    private func load() async {
        loading = true
        async let usageTask: () = (try? AuthService.getUsage()).map { usage = $0 } as Void? ?? ()
        async let tokensTask: () = (try? PushService.getTokens(userId: session.userId)).map { tokens = $0.tokens ?? [] } as Void? ?? ()
        _ = await (usageTask, tokensTask)
        loading = false
    }

    private func detect() async {
        let text = detectInput.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        detecting = true
        detectResult = ""
        do {
            let res = try await TranslateService.detect(text: text)
            let confidenceStr = res.confidence.map { String(format: "%.2f", $0) } ?? "?"
            detectResult = "\(res.detectedLanguage) (\(confidenceStr))"
        } catch {
            detectResult = "Error: \(error.localizedDescription)"
        }
        detecting = false
    }
}
