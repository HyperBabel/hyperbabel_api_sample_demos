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

    func initialize(appId: String, delegate: VideoEngineDelegate?) {
        if engine != nil { return }
        eventDelegate = delegate
        engine = VideoEngine.sharedEngine(withAppId: appId, delegate: delegate)
        engine?.enableVideo()
        engine?.enableAudio()
    }

    /// Join a 1:1 / group video call. Fetches its own RTC token via the
    /// HyperBabel RTM endpoint — used by the in-room video call surface.
    func joinCall(channelName: String, role: String = "publisher", uid: Int) async throws {
        let token = try await RtmService.rtcToken(
            RtcTokenRequest(channelName: channelName, uid: uid, role: role)
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
    }

    func release() {
        VideoEngine.destroy()
        engine = nil
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
    func joinCall(channelName: String, role: String = "publisher", uid: Int) async throws {}
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
