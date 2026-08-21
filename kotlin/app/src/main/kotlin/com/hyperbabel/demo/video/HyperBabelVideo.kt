/*
 * HyperBabel Video client.
 *
 * Thin wrapper around the underlying video RTC SDK. Each vendor type is
 * imported under a neutral alias (`VideoEngine`, `VideoEventHandler`,
 * `VideoEngineConfig`) so the demo body talks about HyperBabel Video, not
 * the raw vendor name.
 */
package com.hyperbabel.demo.video

import android.content.Context
import android.view.SurfaceView
import com.hyperbabel.demo.api.ApiClient
import com.hyperbabel.demo.data.RtcTokenRequest
import io.agora.rtc2.Constants
import io.agora.rtc2.IRtcEngineEventHandler as VideoEventHandler
import io.agora.rtc2.RtcEngine as VideoEngine
import io.agora.rtc2.RtcEngineConfig as VideoEngineConfig
import io.agora.rtc2.video.VideoCanvas

class HyperBabelVideo(private val appContext: Context) {

    private var engine: VideoEngine? = null
    private var localUid: Int = 0

    /**
     * Remote participants currently in the channel, by uid.
     *
     * HyperBabel meters video by the total resolution each participant
     * RECEIVES, so the publishing resolution has to follow the call size —
     * see [VideoQuality] for the budget and the presets. This matters more on
     * mobile than on web: the SDK default (960x540) already exceeds the HD
     * ceiling from three participants up.
     *
     * Membership is tracked by channel presence (onUserJoined / onUserOffline),
     * not by who publishes video: a participant sitting in the call with the
     * camera off can switch it on at any moment, and the frames around that
     * moment must already be sized for them. Over-counting lowers the
     * resolution (safe); under-counting is what pushes a call above the tier
     * it declared.
     */
    private val remoteUids = linkedSetOf<Int>()

    fun init(appId: String, handler: VideoEventHandler) {
        if (engine != null) return
        val cfg = VideoEngineConfig().apply {
            mContext = appContext
            mAppId = appId
            mEventHandler = handler
        }
        engine = VideoEngine.create(cfg)
        engine?.enableVideo()
        engine?.enableAudio()
        // Size the first published frame before joining — a late joiner walks
        // into an already-populated channel and must not send one oversized
        // frame. Re-applied on every roster change via [trackRemoteJoined] /
        // [trackRemoteLeft], which the screen's event handler must call.
        applyEncoder()
    }

    /**
     * Re-apply the publishing preset for the current call size.
     *
     * The return code is checked, never ignored: if the downshift does not
     * land the call keeps publishing large, and every participant's received
     * total moves into a higher (more expensive) tier than the one declared
     * at session creation.
     */
    fun applyEncoder() {
        val e = engine ?: return
        val cfg = VideoQuality.encoderForRemoteCount(remoteUids.size)
        val rc = e.setVideoEncoderConfiguration(cfg)
        if (rc != 0) {
            android.util.Log.w(
                "HyperBabelVideo",
                "could not apply ${cfg.dimensions.width}x${cfg.dimensions.height} for " +
                    "${remoteUids.size} remote participant(s) (code $rc) — " +
                    "the call may exceed the declared tier",
            )
        }
    }

    /** Call from `onUserJoined`. Keeps the resolution in step with the call size. */
    fun trackRemoteJoined(uid: Int) {
        if (remoteUids.add(uid)) applyEncoder()
    }

    /** Call from `onUserOffline`. */
    fun trackRemoteLeft(uid: Int) {
        if (remoteUids.remove(uid)) applyEncoder()
    }

    /**
     * The billing tier to declare when creating a session, derived from the
     * same presets this client publishes with.
     */
    fun declaredQuality(): String = VideoQuality.declaredQuality()

    /// Join a 1:1 / group video call. Fetches its own RTC token via the
    /// HyperBabel RTM endpoint — used by the in-room video call surface.
    ///
    /// @param sessionId REQUIRED when [role] is "publisher" — the id returned by
    ///   `POST /video/sessions` or `POST /unitedchat/rooms/{roomId}/video-call`.
    ///   Publisher tokens are minted from the session, so the server rejects the
    ///   request with 400 `invalid_request` when it is absent.
    suspend fun joinCall(
        channelName: String,
        role: String = "publisher",
        uid: Int,
        sessionId: String? = null,
        externalUserId: String? = null,
    ): VideoEngine? {
        val tok = ApiClient.rtm.rtcToken(
            RtcTokenRequest(
                channelName = channelName,
                uid = uid,
                role = role,
                sessionId = sessionId,
                externalUserId = externalUserId,
            ),
        )
        return joinWithToken(
            channelName = tok.channelName,
            rtcToken = tok.rtcToken,
            uid = tok.uid,
            role = role,
        )
    }

    /// Join with a server-issued token already in hand. The Live Stream
    /// surface uses this — `POST /stream/sessions` and the viewer-token
    /// endpoint both ship the token + uid + channel_name in their response,
    /// so a second /rtm/token round-trip would be wasteful.
    fun joinWithToken(
        channelName: String,
        rtcToken: String,
        uid: Int,
        role: String,
    ): VideoEngine? {
        localUid = uid
        engine?.setChannelProfile(Constants.CHANNEL_PROFILE_LIVE_BROADCASTING)
        engine?.setClientRole(
            if (role == "publisher") Constants.CLIENT_ROLE_BROADCASTER
            else Constants.CLIENT_ROLE_AUDIENCE
        )
        engine?.joinChannel(rtcToken, channelName, /* optionalInfo */ null, uid)
        return engine
    }

    /// Bind a SurfaceView to the local preview track.
    fun setupLocalView(view: SurfaceView?) {
        val canvas = VideoCanvas(view, VideoCanvas.RENDER_MODE_HIDDEN, 0 /* local */)
        engine?.setupLocalVideo(canvas)
        if (view != null) engine?.startPreview()
    }

    /// Bind a SurfaceView to a remote peer's track.
    fun setupRemoteView(view: SurfaceView?, uid: Int) {
        val canvas = VideoCanvas(view, VideoCanvas.RENDER_MODE_HIDDEN, uid)
        engine?.setupRemoteVideo(canvas)
    }

    fun leaveCall() {
        engine?.stopPreview()
        engine?.leaveChannel()
        remoteUids.clear()
    }

    fun release() {
        if (engine != null) {
            VideoEngine.destroy()
            engine = null
        }
        remoteUids.clear()
    }

    fun engineOrNull(): VideoEngine? = engine
}
