/*
 * HyperBabel Video client.
 *
 * Thin wrapper around the underlying video RTC SDK. The vendor SDK is
 * imported by package name only and any vendor class names are renamed
 * via `typealias` so the body of this file talks about HyperBabel Video,
 * not the raw vendor name.
 *
 * The vendor SDK ships as iOS-only binary frameworks, so the body is
 * gated on `canImport` to keep host-side tooling (`swift build` on macOS,
 * Linux CI lints) compiling cleanly.
 */
import Foundation

#if canImport(AgoraRtcKit)
import AgoraRtcKit
import UIKit

// Hide raw vendor class names behind neutral aliases.
typealias VideoEngine        = AgoraRtcEngineKit
typealias VideoEngineDelegate = AgoraRtcEngineDelegate
typealias VideoChannelOptions = AgoraRtcChannelMediaOptions
typealias VideoCanvas         = AgoraRtcVideoCanvas

@MainActor
final class HyperBabelVideo: NSObject {
    static let shared = HyperBabelVideo()
    private var engine: VideoEngine?
    private weak var eventDelegate: VideoEngineDelegate?

    /// Remote participants currently in the channel, by uid.
    ///
    /// HyperBabel meters video by the total resolution each participant
    /// RECEIVES, so the publishing resolution has to follow the call size —
    /// see `VideoQuality.swift` for the budget and the presets. This matters
    /// more on mobile than on web: the SDK default (960x540) already exceeds
    /// the HD ceiling from three participants up.
    ///
    /// Membership is tracked by channel presence, not by who publishes video:
    /// a participant sitting in the call with the camera off can switch it on
    /// at any moment, and the frames around that moment must already be sized
    /// for them. Over-counting lowers the resolution (safe); under-counting is
    /// what pushes a call above the tier it declared.
    private var remoteUids = Set<UInt>()

    func initialize(appId: String, delegate: VideoEngineDelegate?) {
        if engine != nil { return }
        eventDelegate = delegate
        engine = VideoEngine.sharedEngine(withAppId: appId, delegate: delegate)
        engine?.enableVideo()
        engine?.enableAudio()
        applyEncoder()
    }

    /// Re-apply the publishing preset for the current call size.
    ///
    /// The return code is checked, never ignored: if the downshift does not
    /// land the call keeps publishing large, and every participant's received
    /// total moves into a higher (more expensive) tier than the one declared
    /// at session creation.
    func applyEncoder() {
        guard let engine else { return }
        let cfg = VideoQuality.encoderConfiguration(forRemoteCount: remoteUids.count)
        let rc = engine.setVideoEncoderConfiguration(cfg)
        if rc != 0 {
            print(
                "[HyperBabelVideo] could not apply \(Int(cfg.dimensions.width))x\(Int(cfg.dimensions.height)) "
                + "for \(remoteUids.count) remote participant(s) (code \(rc)) — "
                + "the call may exceed the declared tier"
            )
        }
    }

    /// Call from your engine delegate's `didJoinedOfUid`. Keeps the publishing
    /// resolution in step with the call size.
    ///
    /// This screen skeleton is 1:1, so the roster never grows past one and the
    /// preset stays at 1280x720. Wire these two calls up as soon as you add
    /// group calls — without them a 3- or 4-way call keeps publishing 1280x720
    /// and every participant's received total lands above the HD tier you
    /// declared when the session was created.
    func trackRemoteJoined(uid: UInt) {
        if remoteUids.insert(uid).inserted { applyEncoder() }
    }

    /// Call from your engine delegate's `didOfflineOfUid`.
    func trackRemoteLeft(uid: UInt) {
        if remoteUids.remove(uid) != nil { applyEncoder() }
    }

    /// The billing tier to declare when creating a session, derived from the
    /// same presets this client publishes with.
    func declaredQuality() -> String { VideoQuality.declaredQuality() }

    /// Join a 1:1 / group video call. Fetches its own RTC token via the
    /// HyperBabel RTM endpoint — used by the in-room video call surface.
    /// - Parameter sessionId: REQUIRED when `role == "publisher"`. See `RtcTokenRequest`.
    func joinCall(channelName: String, role: String = "publisher", uid: Int,
                  sessionId: String? = nil, externalUserId: String? = nil) async throws {
        let token = try await RtmService.rtcToken(
            RtcTokenRequest(channelName: channelName, uid: uid, role: role,
                            sessionId: sessionId, externalUserId: externalUserId)
        )
        try await joinWithToken(
            channelName: token.channelName,
            rtcToken: token.rtcToken,
            uid: token.uid,
            role: role
        )
    }

    /// Join with a server-issued token already in hand. The Live Stream
    /// surface uses this — `POST /stream/sessions` and the viewer-token
    /// endpoint both ship the token + uid + channel_name in their response,
    /// so a second /rtm/token round-trip would be wasteful.
    func joinWithToken(channelName: String, rtcToken: String, uid: Int, role: String) async throws {
        let opts = VideoChannelOptions()
        opts.channelProfile = .liveBroadcasting
        opts.clientRoleType = (role == "publisher") ? .broadcaster : .audience
        opts.publishCameraTrack = (role == "publisher")
        opts.publishMicrophoneTrack = (role == "publisher")
        opts.autoSubscribeAudio = true
        opts.autoSubscribeVideo = true
        engine?.joinChannel(
            byToken: rtcToken,
            channelId: channelName,
            uid: UInt(uid),
            mediaOptions: opts,
            joinSuccess: nil
        )
    }

    /// Bind a UIView to the local preview track. Pass nil to detach.
    func setupLocalView(_ view: UIView?) {
        let canvas = VideoCanvas()
        canvas.view = view
        canvas.renderMode = .hidden
        canvas.uid = 0 // 0 = local
        engine?.setupLocalVideo(canvas)
        if view != nil {
            engine?.startPreview()
        }
    }

    /// Bind a UIView to a remote peer's track.
    func setupRemoteView(_ view: UIView?, uid: UInt) {
        let canvas = VideoCanvas()
        canvas.view = view
        canvas.renderMode = .hidden
        canvas.uid = uid
        engine?.setupRemoteVideo(canvas)
    }

    func leaveCall() {
        engine?.stopPreview()
        engine?.leaveChannel(nil)
        remoteUids.removeAll()
    }

    func release() {
        VideoEngine.destroy()
        engine = nil
        remoteUids.removeAll()
    }
}

// SwiftUI bridge — VideoCanvas needs a real UIView, so we wrap one.
import SwiftUI

struct VideoCanvasView: UIViewRepresentable {
    enum Bind { case local, remote(uid: UInt) }
    let bind: Bind

    func makeUIView(context: Context) -> UIView {
        let v = UIView()
        v.backgroundColor = .black
        switch bind {
        case .local:                HyperBabelVideo.shared.setupLocalView(v)
        case .remote(let uid):      HyperBabelVideo.shared.setupRemoteView(v, uid: uid)
        }
        return v
    }

    func updateUIView(_ uiView: UIView, context: Context) {}

    static func dismantleUIView(_ uiView: UIView, coordinator: ()) {
        // Best-effort detach — guards against use-after-free if the engine
        // is torn down while a canvas view is still in the hierarchy.
    }
}

#else

/// Non-iOS host stub. Calls are no-ops; the real implementation links on iOS.
import SwiftUI

@MainActor
final class HyperBabelVideo {
    static let shared = HyperBabelVideo()
    func initialize(appId: String, delegate: AnyObject?) {}
    func joinCall(channelName: String, role: String = "publisher", uid: Int,
                  sessionId: String? = nil, externalUserId: String? = nil) async throws {}
    func joinWithToken(channelName: String, rtcToken: String, uid: Int, role: String) async throws {}
    func leaveCall() {}
    func release() {}
}

struct VideoCanvasView: View {
    enum Bind { case local, remote(uid: UInt) }
    let bind: Bind
    var body: some View {
        // Host-side stub; real preview only renders on iOS.
        Color.black.overlay(
            Text("video preview (iOS only)").foregroundStyle(.white).font(.caption)
        )
    }
}

#endif
