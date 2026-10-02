/*
 * Video call screen — joins the active call session for a room and surfaces
 * a status line. Rendering remote video tracks would require UIKit interop
 * (UIViewRepresentable + the SDK's video canvas type); this skeleton focuses
 * on the API + token + join lifecycle that customers most often need to copy.
 *
 * VideoCallController runs the call lifecycle:
 *   - after the RTC join: POST …/video-call/joined-rtc (retried until it
 *     lands) and POST …/video-call/heartbeat every 60 s
 *   - RTC token renewal from the engine's token callbacks (…/renew-token)
 *   - room events: `call_ended` closes the screen; the caller of a 1:1 call
 *     also closes on a decline, missed or busy event
 *   - the caller gives up after 45 s if nobody joined, and the call is hung
 *     up when the last remote participant leaves the channel
 * Hang up = POST …/video-call/leave with the session id.
 */
import SwiftUI
#if canImport(AgoraRtcKit)
import AgoraRtcKit
#endif

struct VideoCallScreen: View {
    let roomId: String
    let onHangup: () -> Void

    @StateObject private var call: VideoCallController

    init(roomId: String, onHangup: @escaping () -> Void) {
        self.roomId = roomId
        self.onHangup = onHangup
        _call = StateObject(wrappedValue: VideoCallController(roomId: roomId))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Video call").font(.title2).bold()
            Text(call.status).foregroundStyle(.secondary)
            Spacer()
            Button(role: .destructive, action: { call.hangUp() }) {
                Text("Hang up").frame(maxWidth: .infinity)
            }.buttonStyle(.borderedProminent)
        }
        .padding(20)
        .navigationBarBackButtonHidden(true)
        .task { await call.start(onExit: onHangup) }
        .onDisappear { call.screenClosed() }
    }
}

@MainActor
final class VideoCallController: NSObject, ObservableObject {
    @Published private(set) var status = "Connecting…"

    /// How long the caller rings before giving up ("No answer").
    private static let ringTimeoutNanos: UInt64 = 45_000_000_000

    private let roomId: String
    private let userId = Session.shared.userId
    private var sessionId: String?
    private var isCaller = false
    private var callType = "1to1"
    /// Remote uids in the RTC channel, kept by this object's own join / leave
    /// callbacks — the "anyone left?" count never depends on listener order.
    private var remoteUids = Set<UInt>()
    private var remoteEverJoined = false
    private var started = false
    private var ended = false
    private var visible = true
    private var onExit: (() -> Void)?
    private var unsubscribeRoom: (() -> Void)?
    private var heartbeatTask: Task<Void, Never>?
    private var joinedRtcTask: Task<Void, Never>?
    private var ringTimeoutTask: Task<Void, Never>?

    init(roomId: String) {
        self.roomId = roomId
    }

    func start(onExit: @escaping () -> Void) async {
        guard !started else { return }
        started = true
        self.onExit = onExit

        let missing = HyperBabelVideo.missingUsageDescriptions()
        guard missing.isEmpty else {
            status = "Add \(missing.joined(separator: " and ")) to the app's Info.plist. "
                + "iOS stops the app when the camera or microphone starts without them."
            return
        }
        do {
            let active = try await UnitedChatService.getActiveVideoCall(roomId: roomId)
            guard !ended else { return }
            // Named `callSession` so it is not confused with the app Session.
            guard let callSession = active.session, let channelName = callSession.channelName else {
                status = "No active session for this room."
                return
            }
            // The session id is `session.id` in this response.
            guard let sessionId = callSession.id else {
                status = "Session has no id — cannot request a token."
                return
            }
            self.sessionId = sessionId
            let me = callSession.participants?.first(where: { $0.userId == userId })
            isCaller = me?.isCaller == true
            callType = callSession.callType ?? "1to1"

            await listenForCallEvents()
            guard !ended else { return }
            if isCaller { armRingTimeout() }

            // Each participant has a uid recorded in the session. The server
            // signs the publisher token with that uid whatever we send, and
            // echoes it back — join with the values in the response.
            let uid = me?.uid ?? Int.random(in: 1...1_000_000)
            let token = try await RtmService.rtcToken(
                RtcTokenRequest(channelName: channelName, uid: uid, role: "publisher",
                                sessionId: sessionId, externalUserId: userId)
            )
            guard !ended else { return }
            // Join, remote join / leave and token-expiry callbacks come back
            // to this object (see the extension at the bottom of the file).
            HyperBabelVideo.shared.initialize(appId: token.appId, delegate: self)
            try await HyperBabelVideo.shared.joinWithToken(
                channelName: token.channelName, rtcToken: token.rtcToken,
                uid: token.uid, role: "publisher"
            )
            status = "Joining \(token.channelName)…"
        } catch {
            status = "Failed to start call: \((error as? ApiError)?.errorDescription ?? error.localizedDescription)"
        }
    }

    /// Hang up button.
    func hangUp() {
        if ended { exitScreen(); return }
        finish(reason: nil, notifyServer: true)
    }

    /// The screen went away (navigation, sign-out): end the call, but do not
    /// navigate again.
    func screenClosed() {
        visible = false
        finish(reason: nil, notifyServer: true)
    }

    // ── Room events ─────────────────────────────────────────────────────────

    /// Call events arrive on the ROOM channel as `video_call` system messages.
    private func listenForCallEvents() async {
        let channel: String
        do {
            let res = try await UnitedChatService.getRoom(roomId: roomId, userId: userId)
            guard let name = res.room.realtimeChannel, !name.isEmpty else { return }
            channel = name
        } catch {
            // Not fatal: the call works, it just won't react to room events.
            print("[VideoCall] room lookup failed: \(error.localizedDescription)")
            return
        }
        do {
            try await HyperBabelRealtime.shared.connect()
        } catch {
            print("[VideoCall] real-time connect failed: \(error.localizedDescription)")
        }
        guard !ended else { return }
        unsubscribeRoom = HyperBabelRealtime.shared.subscribeRoom(channel) { [weak self] name, raw in
            self?.handleRoomEvent(name: name, raw: raw)
        }
    }

    private func handleRoomEvent(name: String, raw: Any?) {
        guard name == "message", !ended,
              let data = (raw as? [String: Any])?["data"] as? [String: Any],
              (data["message_type"] as? String) == "video_call",
              let meta = data["metadata"] as? [String: Any],
              let sessionId, (meta["session_id"] as? String) == sessionId,
              let event = meta["event"] as? String
        else { return }

        switch event {
        case "call_ended":
            // The session is already over on the server — no API call.
            finish(reason: "Call ended", notifyServer: false)
        case "call_accepted":
            // Answered: give the callee time to connect before giving up.
            if isCaller && !remoteEverJoined { armRingTimeout() }
        case "call_rejected", "call_missed", "call_busy":
            // 1:1 only — in a group call one callee declining must not end it.
            guard isCaller, callType == "1to1", !remoteEverJoined else { return }
            let reason = event == "call_busy" ? "Busy"
                : event == "call_missed" ? "No answer" : "Declined"
            finish(reason: reason, notifyServer: true)
        default:
            break
        }
    }

    private func armRingTimeout() {
        ringTimeoutTask?.cancel()
        ringTimeoutTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: Self.ringTimeoutNanos)
            guard !Task.isCancelled, let self, !self.remoteEverJoined else { return }
            self.finish(reason: "No answer", notifyServer: true)
        }
    }

    // ── Engine events (hopped onto the main actor by the delegate) ─────────

    fileprivate func didJoinChannel() {
        guard !ended else { return }
        if remoteUids.isEmpty { status = isCaller ? "Ringing…" : "Connecting to the other side…" }
        markJoinedRtc()
        startHeartbeat()
    }

    fileprivate func remoteJoined(_ uid: UInt) {
        guard !ended else { return }
        HyperBabelVideo.shared.trackRemoteJoined(uid: uid)
        remoteUids.insert(uid)
        remoteEverJoined = true
        ringTimeoutTask?.cancel()
        status = "Connected"
    }

    fileprivate func remoteLeft(_ uid: UInt) {
        guard !ended else { return }
        HyperBabelVideo.shared.trackRemoteLeft(uid: uid)
        remoteUids.remove(uid)
        // Hang up only when nobody is left — a group call goes on without one peer.
        if remoteEverJoined && remoteUids.isEmpty {
            finish(reason: "Call ended", notifyServer: true)
        }
    }

    fileprivate func renewToken() {
        guard let sessionId, !ended else { return }
        Task { [weak self, roomId, userId] in
            do {
                let res = try await UnitedChatService.renewVideoCallToken(
                    roomId: roomId, sessionId: sessionId, userId: userId
                )
                guard let self, !self.ended, let token = res.rtcToken else { return }
                HyperBabelVideo.shared.renewToken(token)
            } catch {
                self?.status = "Could not renew the call token: "
                    + ((error as? ApiError)?.errorDescription ?? error.localizedDescription)
            }
        }
    }

    // ── Call upkeep ─────────────────────────────────────────────────────────

    /// Tells the server the call connected. Sent once after the join, then
    /// retried up to 5 times, 2 s apart, while `matched` is false.
    private func markJoinedRtc() {
        guard let sessionId else { return }
        joinedRtcTask?.cancel()
        joinedRtcTask = Task { [roomId, userId] in
            for attempt in 0...5 {
                if attempt > 0 { try? await Task.sleep(nanoseconds: 2_000_000_000) }
                if Task.isCancelled { return }
                let res = try? await UnitedChatService.markJoinedRtc(
                    roomId: roomId, sessionId: sessionId, userId: userId
                )
                if res?.matched == true { return }
            }
        }
    }

    /// Liveness ping every 60 s while on the call; the first one goes out
    /// right after the join. Failures are ignored.
    private func startHeartbeat() {
        guard let sessionId else { return }
        heartbeatTask?.cancel()
        heartbeatTask = Task { [roomId, userId] in
            while !Task.isCancelled {
                _ = try? await UnitedChatService.videoCallHeartbeat(
                    roomId: roomId, sessionId: sessionId, userId: userId
                )
                try? await Task.sleep(nanoseconds: 60_000_000_000)
            }
        }
    }

    // ── Teardown ────────────────────────────────────────────────────────────

    /// Tears the call down once. `reason` stays on screen for a moment
    /// before the screen closes; `notifyServer` posts …/video-call/leave.
    private func finish(reason: String?, notifyServer: Bool) {
        guard !ended else { return }
        ended = true
        heartbeatTask?.cancel()
        joinedRtcTask?.cancel()
        ringTimeoutTask?.cancel()
        // Removes only this screen's listener; the room channel stays
        // attached for the chat screen.
        unsubscribeRoom?()
        unsubscribeRoom = nil
        HyperBabelVideo.shared.leaveCall()
        HyperBabelVideo.shared.release()
        if let reason { status = reason }

        let sessionId = self.sessionId
        Task { [weak self, roomId, userId] in
            if notifyServer, let sessionId {
                _ = try? await UnitedChatService.leaveVideoCall(
                    roomId: roomId, sessionId: sessionId, userId: userId
                )
            }
            if reason != nil { try? await Task.sleep(nanoseconds: 2_000_000_000) }
            self?.exitScreen()
        }
    }

    private func exitScreen() {
        guard visible else { return }
        visible = false
        onExit?()
    }
}

#if canImport(AgoraRtcKit)
// Engine callbacks. They can arrive off the main thread, so each one hops to
// the main actor before touching state.
extension VideoCallController: VideoEngineDelegate {
    nonisolated func rtcEngine(_ engine: VideoEngine, didJoinChannel channel: String,
                               withUid uid: UInt, elapsed: Int) {
        Task { @MainActor in self.didJoinChannel() }
    }

    nonisolated func rtcEngine(_ engine: VideoEngine, didJoinedOfUid uid: UInt, elapsed: Int) {
        Task { @MainActor in self.remoteJoined(uid) }
    }

    nonisolated func rtcEngine(_ engine: VideoEngine, didOfflineOfUid uid: UInt,
                               reason: VideoUserOfflineReason) {
        Task { @MainActor in self.remoteLeft(uid) }
    }

    /// About 30 s before the token expires.
    nonisolated func rtcEngine(_ engine: VideoEngine, tokenPrivilegeWillExpire token: String) {
        Task { @MainActor in self.renewToken() }
    }

    /// The token has expired.
    nonisolated func rtcEngineRequestToken(_ engine: VideoEngine) {
        Task { @MainActor in self.renewToken() }
    }
}
#endif
