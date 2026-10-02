/*
 * Settings — Profile / Privacy(Blocked Users) / API Usage / Push Tokens /
 * Logout.
 *
 * Webhooks are explicitly excluded — manage them in the HyperBabel Console.
 * There is no language-detection playground: the `/translate` endpoints take
 * an organization API key, which an end-user app must never hold (see
 * API/TranslateService.swift).
 */
import SwiftUI

struct SettingsScreen: View {
    let onBack: () -> Void
    let onOpenBlocks: () -> Void
    @EnvironmentObject var session: Session

    @State private var usage: UsageStats?
    @State private var tokens: [PushToken] = []
    @State private var loading = true

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
        let userId = session.userId
        // Fetch both in parallel; assign state back here on the main actor.
        async let usageResult = try? AuthService.getUsage()
        async let tokensResult = try? PushService.getTokens(userId: userId)
        usage = await usageResult
        tokens = await tokensResult?.tokens ?? []
        loading = false
    }
}
