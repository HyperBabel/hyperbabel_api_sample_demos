/*
 * Global incoming-call overlay. `IncomingCallStore.listen(signedIn:)`
 * subscribes to the user's HyperBabel private channel
 * (`user:{orgId}:{userId}`); when a `signal` event whose `type` is
 * `CALL_INVITE` arrives, a fullscreen Accept / Reject prompt is shown.
 * Mounted near the root of the SwiftUI scene.
 *
 * While it rings, the store also listens on the invite's room channel
 * (`roomSignalChannel`): a `call_ended` event for this session (the caller
 * hung up) dismisses the prompt. After 45 s of ringing it posts a reject
 * with reason `missed` and dismisses.
 *
 * `onAccept` and `onReject` receive the room id and the call's session id;
 * the App entry point wires them to the server's accept/reject endpoints
 * (both require `session_id`) and, for accept, pushes the .video route via
 * the shared NavStore.
 */
import SwiftUI

@MainActor
final class IncomingCallStore: ObservableObject {
    static let shared = IncomingCallStore()

    /// How long an invite rings before it counts as missed.
    private static let ringTimeoutNanos: UInt64 = 45_000_000_000

    /// The CALL_INVITE fields the overlay uses — `roomId`, `sessionId`,
    /// `callerId`, `callerName`, `callType`, `roomSignalChannel` — keyed as
    /// the server sends them.
    @Published var invite: [String: String]?

    private var unsubscribe: (() -> Void)?
    /// Bumped by every `listen` call, so a listen that is still waiting on the
    /// real-time connection cannot subscribe after the user signed out.
    private var generation = 0
    /// Room-channel listener and ring timer of the invite on screen.
    private var unsubscribeRinging: (() -> Void)?
    private var ringTimeoutTask: Task<Void, Never>?

    func show(_ invite: [String: String]) {
        stopRinging()
        self.invite = invite
        let sessionId = invite["sessionId"] ?? ""
        if let channel = invite["roomSignalChannel"], !channel.isEmpty {
            // Adds a listener only. Removing it later must not detach the
            // channel — the chat screen may be subscribed to the same room.
            unsubscribeRinging = HyperBabelRealtime.shared.subscribeRoom(channel) { [weak self] name, raw in
                guard name == "message",
                      let data = (raw as? [String: Any])?["data"] as? [String: Any],
                      (data["message_type"] as? String) == "video_call",
                      let meta = data["metadata"] as? [String: Any],
                      (meta["event"] as? String) == "call_ended",
                      (meta["session_id"] as? String) == sessionId
                else { return }
                self?.clear()   // the caller hung up
            }
        }
        ringTimeoutTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: Self.ringTimeoutNanos)
            guard !Task.isCancelled else { return }
            self?.missed()
        }
    }

    /// Closes the prompt (accept, reject, caller hung up, missed, sign-out).
    func clear() {
        stopRinging()
        invite = nil
    }

    private func stopRinging() {
        unsubscribeRinging?()
        unsubscribeRinging = nil
        ringTimeoutTask?.cancel()
        ringTimeoutTask = nil
    }

    /// 45 s without an answer: tell the server it was missed, then dismiss.
    private func missed() {
        guard let invite else { return }
        let roomId = invite["roomId"] ?? ""
        let sessionId = invite["sessionId"] ?? ""
        clear()
        guard !roomId.isEmpty, !sessionId.isEmpty else { return }
        let userId = Session.shared.userId
        Task {
            _ = try? await UnitedChatService.rejectVideoCall(
                roomId: roomId, sessionId: sessionId, userId: userId, reason: "missed"
            )
        }
    }

    /// Start listening for incoming calls on the signed-in user's private
    /// channel, or stop (and close the real-time connection) after sign-out.
    func listen(signedIn: Bool) async {
        generation += 1
        let current = generation
        unsubscribe?()
        unsubscribe = nil
        guard signedIn else {
            clear()
            HyperBabelRealtime.shared.disconnect()
            return
        }
        do {
            try await HyperBabelRealtime.shared.connect()
        } catch {
            // Keep going: a dropped connection recovers on its own and the
            // subscription below attaches once it is back.
            print("[IncomingCall] real-time connect failed: \(error.localizedDescription)")
        }
        guard current == generation else { return }
        unsubscribe = HyperBabelRealtime.shared.subscribeUserSignals { [weak self] data in
            // Every peer signal is published under the event name `signal`;
            // `type` tells them apart. Only an invite opens the overlay.
            guard (data["type"] as? String) == "CALL_INVITE" else { return }
            self?.show(Self.inviteFields(of: data))
        }
    }

    /// Copies only the fields the overlay and the accept / reject / ringing
    /// logic use. (The payload also carries a deprecated duplicate of
    /// `roomSignalChannel`; it is deliberately not read.)
    private static func inviteFields(of data: [String: Any]) -> [String: String] {
        let keys = ["roomId", "sessionId", "callerId", "callerName", "callType", "roomSignalChannel"]
        var out: [String: String] = [:]
        for key in keys {
            if let s = data[key] as? String { out[key] = s }
        }
        return out
    }
}

struct IncomingCallOverlay: View {
    @EnvironmentObject var store: IncomingCallStore
    /// (roomId, sessionId)
    let onAccept: (String, String) -> Void
    /// (roomId, sessionId)
    let onReject: (String, String) -> Void

    var body: some View {
        if let invite = store.invite {
            let roomId    = invite["roomId"] ?? ""
            let sessionId = invite["sessionId"] ?? ""
            let caller    = invite["callerName"] ?? invite["callerId"] ?? "Unknown"
            let callType  = invite["callType"] ?? "1to1"
            ZStack {
                Color.black.opacity(0.85).ignoresSafeArea()
                VStack(spacing: 12) {
                    Image(systemName: "video.fill")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 80, height: 80)
                        .foregroundStyle(Color.accentColor)
                    Text("Incoming \(callType) call")
                        .foregroundStyle(.white.opacity(0.7))
                    Text(caller)
                        .font(.title)
                        .foregroundStyle(.white)
                    Text("Room: \(roomId)")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.4))
                    HStack(spacing: 48) {
                        Button {
                            store.clear()
                            onReject(roomId, sessionId)
                        } label: {
                            Image(systemName: "phone.down.fill")
                                .resizable().scaledToFit()
                                .frame(width: 28, height: 28)
                                .padding(20)
                                .background(Color.red, in: Circle())
                                .foregroundStyle(.white)
                        }
                        Button {
                            store.clear()
                            onAccept(roomId, sessionId)
                        } label: {
                            Image(systemName: "phone.fill")
                                .resizable().scaledToFit()
                                .frame(width: 28, height: 28)
                                .padding(20)
                                .background(Color.green, in: Circle())
                                .foregroundStyle(.white)
                        }
                    }.padding(.top, 24)
                }
                .padding(32)
            }
        }
    }
}
