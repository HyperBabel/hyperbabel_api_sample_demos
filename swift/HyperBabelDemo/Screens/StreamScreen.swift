/*
 * Live Stream surface — list / host / viewer 3-mode with real RTC join:
 *   - Host: POST /stream/sessions returns app_id + channel_name + a publisher
 *     rtc_token + uid embedded under `session.host`. We init the engine and
 *     join as broadcaster, surfacing the local camera in a video canvas.
 *   - Viewer: POST /stream/sessions/:id/viewer-token returns app_id +
 *     channel_name + token + uid (flat shape). We init the engine, join as
 *     audience, and bind the host's uid to a remote canvas.
 *
 * Rendering uses the SwiftUI bridge (`VideoCanvasView`) declared next to
 * HyperBabelVideo so each customer can swap in their own UIKit / SwiftUI
 * layer without touching the lifecycle.
 */
import SwiftUI

private enum StreamMode { case list, hosting, watching }

struct StreamScreen: View {
    let onBack: () -> Void
    @EnvironmentObject var session: Session
    @State private var mode: StreamMode = .list
    @State private var sessions: [StreamSession] = []
    @State private var loading = true
    @State private var error: String = ""
    @State private var activeSessionId: String?
    @State private var activeTitle: String = ""
    @State private var hostUid: UInt = 0
    @State private var status: String = ""
    @State private var heartbeatTask: Task<Void, Never>?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Button("← Back", action: onBack).buttonStyle(.bordered)
                Text("Live Streams").font(.title3).bold()
            }
            switch mode {
            case .list: list
            case .hosting: hosting
            case .watching: watching
            }
            Spacer()
        }
        .padding(16)
        .navigationBarBackButtonHidden(true)
        .task { await refresh() }
    }

    // ── List ─────────────────────────────────────────────────────────────────

    private var list: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: { Task { await goLive() } }) {
                Text("📡  Go Live (Host)").frame(maxWidth: .infinity)
            }.buttonStyle(.borderedProminent)

            if loading { Text("Loading…").foregroundStyle(.secondary) }
            else if !error.isEmpty { Text(error).foregroundStyle(.red) }
            else if sessions.isEmpty {
                Text("Nobody is streaming right now — be the first.")
                    .foregroundStyle(.secondary)
            } else {
                List(sessions) { s in
                    Button(action: { Task { await watch(s) } }) {
                        VStack(alignment: .leading) {
                            Text(s.title ?? "Untitled stream").font(.subheadline).bold()
                            Text("Host: \(s.resolvedHostName ?? "—")")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }.buttonStyle(.plain)
                }.listStyle(.plain)
            }
        }
    }

    // ── Host ─────────────────────────────────────────────────────────────────

    private var hosting: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("🔴  \(activeTitle.isEmpty ? "You are live" : activeTitle)")
                .font(.title3).bold()
            VideoCanvasView(bind: .local)
                .frame(height: 280)
                .cornerRadius(12)
            if !status.isEmpty {
                Text(status).font(.caption).foregroundStyle(.secondary)
            }
            Button(role: .destructive, action: { Task { await leave() } }) {
                Text("End Stream").frame(maxWidth: .infinity)
            }.buttonStyle(.borderedProminent)
        }
    }

    // ── Viewer ───────────────────────────────────────────────────────────────

    private var watching: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("📺  Watching \(activeTitle.isEmpty ? "live stream" : activeTitle)")
                .font(.title3).bold()
            VideoCanvasView(bind: .remote(uid: hostUid))
                .frame(height: 280)
                .cornerRadius(12)
            if !status.isEmpty {
                Text(status).font(.caption).foregroundStyle(.secondary)
            }
            Button(action: { Task { await leave() } }) {
                Text("Leave").frame(maxWidth: .infinity)
            }.buttonStyle(.bordered)
        }
    }

    // ── API + RTC ────────────────────────────────────────────────────────────

    private func refresh() async {
        loading = true
        error = ""
        do {
            let resp = try await StreamService.list()
            sessions = resp.sessions ?? []
        } catch { self.error = (error as? ApiError)?.errorDescription ?? error.localizedDescription }
        loading = false
    }

    private func goLive() async {
        do {
            let resp = try await StreamService.create(
                hostUserId: session.userId,
                hostName: session.displayName,
                title: "Live from \(session.displayName)"
            )
            guard let detail = resp.session,
                  let sid = detail.id,
                  let appId = detail.appId,
                  let channelName = detail.channelName,
                  let host = detail.host,
                  let rtcToken = host.rtcToken,
                  let uid = host.uid
            else {
                self.error = "Server response missing RTC credentials."
                return
            }
            activeSessionId = sid
            activeTitle = detail.title ?? ""

            // Toggle the session into 'live' state — fire and forget; viewers
            // can already join based on the create response.
            Task { _ = try? await StreamService.start(sessionId: sid, hostUserId: session.userId) }

            // Initialise the RTC engine and join as broadcaster.
            HyperBabelVideo.shared.initialize(appId: appId, delegate: nil)
            try await HyperBabelVideo.shared.joinWithToken(
                channelName: channelName,
                rtcToken: rtcToken,
                uid: uid,
                role: "publisher"
            )
            status = "Joined channel \(channelName) as host."
            mode = .hosting
            startHeartbeat(sessionId: sid)
        } catch {
            self.error = (error as? ApiError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Fires a heartbeat every 30s while broadcasting so the server can
    /// detect a host crash within minutes and bill only the actual stream
    /// time. Cancelled in `leave()` or when the host explicitly ends.
    private func startHeartbeat(sessionId: String) {
        heartbeatTask?.cancel()
        heartbeatTask = Task {
            _ = try? await StreamService.heartbeat(sessionId: sessionId)
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30 * 1_000_000_000)
                if Task.isCancelled { break }
                _ = try? await StreamService.heartbeat(sessionId: sessionId)
            }
        }
    }

    private func watch(_ s: StreamSession) async {
        guard let sid = s.sessionId ?? s.id_ else { return }
        do {
            let token = try await StreamService.viewerToken(sessionId: sid, userId: session.userId)
            guard let appId = token.appId,
                  let channelName = token.channelName,
                  let rtcToken = token.token,
                  let uid = token.uid
            else {
                self.error = "Server response missing viewer credentials."
                return
            }
            activeSessionId = sid
            activeTitle = token.title ?? s.title ?? ""

            // The host's uid is what we need to bind the remote canvas to.
            // Stream sessions broadcast a single host stream, so we publish
            // it via the host's uid. The server doesn't expose `host_uid`
            // explicitly on the viewer-token response, so we let the engine
            // surface it via the userJoined delegate — for the skeleton we
            // approximate with `0`, which renders the first remote stream
            // the engine sees on this channel.
            hostUid = 0

            HyperBabelVideo.shared.initialize(appId: appId, delegate: nil)
            try await HyperBabelVideo.shared.joinWithToken(
                channelName: channelName,
                rtcToken: rtcToken,
                uid: uid,
                role: "subscriber"
            )
            status = "Joined channel \(channelName) as viewer."
            mode = .watching
        } catch {
            self.error = (error as? ApiError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func leave() async {
        heartbeatTask?.cancel()
        heartbeatTask = nil
        if mode == .hosting, let sid = activeSessionId {
            _ = try? await StreamService.end(sessionId: sid, hostUserId: session.userId)
        }
        HyperBabelVideo.shared.leaveCall()
        HyperBabelVideo.shared.release()
        activeSessionId = nil
        activeTitle = ""
        status = ""
        hostUid = 0
        mode = .list
        await refresh()
    }
}
