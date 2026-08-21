/*
 * Video call screen — joins the active call session for a room and surfaces
 * a status line. Rendering remote video tracks would require a SurfaceView
 * factory; this skeleton focuses on the API + token + join lifecycle that
 * customers most often need to copy.
 */
package com.hyperbabel.demo.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.hyperbabel.demo.api.ApiClient
import com.hyperbabel.demo.data.Session
import com.hyperbabel.demo.video.HyperBabelVideo
import io.agora.rtc2.IRtcEngineEventHandler as VideoEventHandler
import kotlin.random.Random
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope

@Composable
fun VideoCallScreen(roomId: String, onHangup: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val video = remember { HyperBabelVideo(ctx.applicationContext) }
    var status by remember { mutableStateOf("Connecting…") }

    LaunchedEffect(roomId) {
        try {
            val active = ApiClient.unitedChat.getActiveVideoCall(roomId).session
            if (active?.channelName == null) {
                status = "No active session for this room."
                return@LaunchedEffect
            }
            // Issue a token first so we have the appId before initialising.
            val uid = active.uid ?: Random.nextInt(1, 1_000_000)
            val sessionId = active.sessionId
                ?: return@LaunchedEffect run { status = "Session has no id — cannot request a token." }
            val tok = ApiClient.rtm.rtcToken(
                com.hyperbabel.demo.data.RtcTokenRequest(
                    channelName = active.channelName,
                    uid = uid,
                    role = "publisher",
                    // Publisher tokens are session-scoped: the server checks that
                    // this user is a participant and signs the token with the
                    // session's channel + uid, which the response echoes back.
                    sessionId = sessionId,
                    externalUserId = Session.userId,
                ),
            )
            video.init(tok.appId, object : VideoEventHandler() {
                override fun onJoinChannelSuccess(channel: String?, uid: Int, elapsed: Int) {
                    status = "Joined $channel"
                }
                override fun onUserJoined(uid: Int, elapsed: Int) {
                    // Keep the publishing resolution in step with the call size —
                    // HyperBabel meters by the total resolution each participant
                    // receives (video/VideoQuality.kt).
                    video.trackRemoteJoined(uid)
                    status = "Peer joined: $uid"
                }
                override fun onUserOffline(uid: Int, reason: Int) {
                    video.trackRemoteLeft(uid)
                    status = "Peer left ($reason)"
                    onHangup()
                }
            })
            video.engineOrNull()?.joinChannel(tok.rtcToken, tok.channelName, null, tok.uid)
        } catch (t: Throwable) {
            status = "Failed to start call: ${t.message}"
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            try { video.leaveCall() } catch (_: Throwable) {}
            try {
                scope.launch {
                    try {
                        ApiClient.unitedChat.leaveVideoCall(
                            roomId,
                            mapOf("user_id" to Session.userId),
                        )
                    } catch (_: Throwable) {}
                }
            } catch (_: Throwable) {}
            video.release()
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Video call", style = MaterialTheme.typography.headlineSmall)
        Text(status, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(onClick = onHangup) { Text("Hang up") }
    }
}
