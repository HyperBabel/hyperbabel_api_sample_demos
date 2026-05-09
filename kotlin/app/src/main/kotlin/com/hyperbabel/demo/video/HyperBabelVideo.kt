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
    }

    /// Join a 1:1 / group video call. Fetches its own RTC token via the
    /// HyperBabel RTM endpoint — used by the in-room video call surface.
    suspend fun joinCall(channelName: String, role: String = "publisher", uid: Int): VideoEngine? {
        val tok = ApiClient.rtm.rtcToken(
            RtcTokenRequest(channelName = channelName, uid = uid, role = role),
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
    }

    fun release() {
        if (engine != null) {
            VideoEngine.destroy()
            engine = null
        }
    }

    fun engineOrNull(): VideoEngine? = engine
}
