/*
 * Video call screen — joins the active call session for a room and surfaces
 * a status line. Rendering remote video tracks would require UIKit interop
 * (UIViewRepresentable + the SDK's video canvas type); this skeleton focuses
 * on the API + token + join lifecycle that customers most often need to copy.
 */
import SwiftUI
#if canImport(AgoraRtcKit)
import AgoraRtcKit
#endif

struct VideoCallScreen: View {
    let roomId: String
    let onHangup: () -> Void

    @EnvironmentObject var session: Session
    @State private var status: String = "Connecting…"

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Video call").font(.title2).bold()
            Text(status).foregroundStyle(.secondary)
            Spacer()
            Button(role: .destructive, action: { hangup() }) {
                Text("Hang up").frame(maxWidth: .infinity)
            }.buttonStyle(.borderedProminent)
        }
        .padding(20)
        .navigationBarBackButtonHidden(true)
        .task { await join() }
    }

    private func join() async {
        do {
            let active = try await UnitedChatService.getActiveVideoCall(roomId: roomId)
            // Named `callSession` so it does not shadow the app's `session`
            // (the EnvironmentObject that holds the signed-in user id).
            guard let callSession = active.session, let channelName = callSession.channelName else {
                status = "No active session for this room."
                return
            }
            guard let sessionId = callSession.sessionId else {
                status = "Session has no id — cannot request a token."
                return
            }
            let uid = callSession.uid ?? Int.random(in: 1...1_000_000)
            // Publisher tokens are session-scoped: the server checks that this
            // user is a participant and signs the token with the session's
            // channel + uid, which the response echoes back.
            let token = try await RtmService.rtcToken(
                RtcTokenRequest(channelName: channelName, uid: uid, role: "publisher",
                                sessionId: sessionId, externalUserId: session.userId)
            )
            HyperBabelVideo.shared.initialize(appId: token.appId, delegate: nil)
            try await HyperBabelVideo.shared.joinWithToken(
                channelName: token.channelName, rtcToken: token.rtcToken,
                uid: token.uid, role: "publisher"
            )
            status = "Joined \(token.channelName)"
        } catch {
            status = "Failed to start call: \((error as? ApiError)?.errorDescription ?? error.localizedDescription)"
        }
    }

    private func hangup() {
        HyperBabelVideo.shared.leaveCall()
        Task {
            _ = try? await UnitedChatService.leaveVideoCall(roomId: roomId, userId: session.userId)
            await MainActor.run { onHangup() }
        }
        HyperBabelVideo.shared.release()
    }
}
