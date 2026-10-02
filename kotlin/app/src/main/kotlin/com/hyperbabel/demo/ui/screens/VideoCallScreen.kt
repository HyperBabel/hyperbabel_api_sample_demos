/*
 * Video call screen — joins the active call session for a room and surfaces
 * a status line. Rendering remote video tracks would require a SurfaceView
 * factory; this skeleton focuses on the API + token + join lifecycle that
 * customers most often need to copy:
 *
 *   - Camera and microphone runtime permissions are requested before joining.
 *   - After the RTC join: POST …/joined-rtc (retried while `matched` is false)
 *     and POST …/heartbeat every 60 s. Without them the server treats a live
 *     call as never connected and may end it.
 *   - RTC tokens last 1 hour: the SDK's token-expiry callbacks fetch a fresh
 *     one from POST …/renew-token.
 *   - Call events on the room's real-time channel: `call_ended` closes the
 *     screen; the caller of a 1:1 call also closes on decline / missed / busy.
 *   - The caller gives up after 45 s when nobody has joined ("No answer").
 *   - The screen hangs up only when no remote participant is left, so a
 *     group call goes on when one person leaves.
 *
 * The session id is `session.id` from GET …/video-call/active. Every call
 * action sends it as `session_id` together with `user_id`, or the server
 * answers 400.
 */
package com.hyperbabel.demo.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.hyperbabel.demo.api.ApiClient
import com.hyperbabel.demo.data.RtcTokenRequest
import com.hyperbabel.demo.data.Session
import com.hyperbabel.demo.realtime.HyperBabelRealtime
import com.hyperbabel.demo.video.HyperBabelVideo
import io.agora.rtc2.IRtcEngineEventHandler as VideoEventHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** The caller stops ringing when nobody has joined by then. */
private const val RING_TIMEOUT_MS = 45_000L
private const val HEARTBEAT_INTERVAL_MS = 60_000L
private const val JOINED_RTC_RETRIES = 5
private const val JOINED_RTC_RETRY_DELAY_MS = 2_000L

private val AV_PERMISSIONS = arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)

/**
 * Hang-up requests are sent from onDispose, when the screen's own coroutine
 * scope is already being cancelled — they need a scope that outlives it.
 */
private val callTeardownScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

/** What this screen needs from GET …/video-call/active. */
private data class CallInfo(
    val sessionId: String,
    val channelName: String,
    /** Your RTC uid in this session. */
    val uid: Int,
    val isCaller: Boolean,
    /** "1to1" | "group" */
    val callType: String,
)

@Composable
fun VideoCallScreen(roomId: String, onHangup: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val video = remember { HyperBabelVideo(ctx.applicationContext) }
    var status by remember { mutableStateOf("Connecting…") }
    var permissionNote by remember { mutableStateOf("") }
    var call by remember { mutableStateOf<CallInfo?>(null) }
    var roomChannel by remember { mutableStateOf<String?>(null) }
    var remoteJoined by remember { mutableStateOf(false) }
    // True once the server reported `call_ended` — there is nothing left to leave.
    var sessionEnded by remember { mutableStateOf(false) }
    var leaveSent by remember { mutableStateOf(false) }
    var exited by remember { mutableStateOf(false) }
    // Bumped on `call_accepted` to restart the caller's ring timeout.
    var ringRestarts by remember { mutableStateOf(0) }

    // Leave the CALL — not the chat room (that is POST /rooms/:roomId/leave) —
    // at most once, and not after `call_ended`. The server ends the session
    // once the last active participant leaves. Sent on a scope that outlives
    // this screen, because the screen is about to close.
    val sendLeave: () -> Unit = {
        val info = call
        if (info != null && !sessionEnded && !leaveSent) {
            leaveSent = true
            val body = mapOf("user_id" to Session.userId, "session_id" to info.sessionId)
            callTeardownScope.launch {
                try {
                    ApiClient.unitedChat.leaveVideoCall(roomId, body)
                } catch (_: Throwable) {}
            }
        }
    }

    // Every way out of the call ends here, once: leave first, then close the
    // screen; onDispose (below) tears down RTC.
    val exit: (String?) -> Unit = { reason ->
        if (!exited) {
            exited = true
            sendLeave()
            if (reason != null) Toast.makeText(ctx, reason, Toast.LENGTH_SHORT).show()
            onHangup()
        }
    }

    // ── Camera / microphone: Android 6+ cannot capture without the runtime grant ──
    var permissionsResolved by remember {
        mutableStateOf(
            AV_PERMISSIONS.all {
                ContextCompat.checkSelfPermission(ctx, it) == PackageManager.PERMISSION_GRANTED
            },
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        if (result.values.any { granted -> !granted }) {
            permissionNote = "Camera or microphone permission denied — others will not see or hear you."
        }
        permissionsResolved = true
    }
    LaunchedEffect(Unit) {
        if (!permissionsResolved) permissionLauncher.launch(AV_PERMISSIONS)
    }

    // ── Load the session and the room's real-time channel ──
    LaunchedEffect(roomId) {
        try {
            val active = ApiClient.unitedChat.getActiveVideoCall(roomId).session
            val sid = active?.id
            val channelName = active?.channelName
            if (active == null || sid == null || channelName == null) {
                status = "No active session for this room."
                return@LaunchedEffect
            }
            val me = active.participants.firstOrNull { it.userId == Session.userId }
            call = CallInfo(
                sessionId = sid,
                channelName = channelName,
                uid = me?.uid ?: 0,
                isCaller = me?.isCaller == true,
                callType = active.callType.orEmpty(),
            )
        } catch (t: Throwable) {
            status = "Failed to load the call: ${t.message}"
            return@LaunchedEffect
        }
        // Call events (call_ended, call_rejected, …) arrive on the room's channel.
        runCatching { ApiClient.unitedChat.getRoom(roomId, Session.userId) }
            .onSuccess { roomChannel = it.room.realtimeChannel }
    }

    // ── Join once the session is known and the permission prompt is answered ──
    LaunchedEffect(call, permissionsResolved) {
        val info = call ?: return@LaunchedEffect
        if (!permissionsResolved) return@LaunchedEffect
        val body = mapOf("user_id" to Session.userId, "session_id" to info.sessionId)
        try {
            // Publisher tokens are session-scoped: the server checks that this
            // user is a participant and signs the token with the session's
            // channel and YOUR participant uid, which the response echoes back.
            val tok = ApiClient.rtm.rtcToken(
                RtcTokenRequest(
                    channelName = info.channelName,
                    uid = info.uid,
                    role = "publisher",
                    sessionId = info.sessionId,
                    externalUserId = Session.userId,
                ),
            )
            // RTC callbacks arrive on an SDK thread; each one hops to the main
            // thread so state, the roster count and navigation stay in order.
            video.init(tok.appId, object : VideoEventHandler() {
                override fun onJoinChannelSuccess(channel: String?, uid: Int, elapsed: Int) {
                    scope.launch {
                        status = "Joined — waiting for the others…"
                        // Tell the server the call connected, then keep it alive.
                        launch { markJoinedRtc(roomId, body) }
                        launch {
                            while (true) {
                                runCatching { ApiClient.unitedChat.videoCallHeartbeat(roomId, body) }
                                delay(HEARTBEAT_INTERVAL_MS)
                            }
                        }
                    }
                }
                override fun onUserJoined(uid: Int, elapsed: Int) {
                    scope.launch {
                        // Keep the publishing resolution in step with the call size —
                        // HyperBabel meters by the total resolution each participant
                        // receives (video/VideoQuality.kt).
                        video.trackRemoteJoined(uid)
                        remoteJoined = true
                        status = "In call with ${video.remoteCount} other(s)"
                    }
                }
                override fun onUserOffline(uid: Int, reason: Int) {
                    scope.launch {
                        video.trackRemoteLeft(uid)
                        // Count AFTER the roster update: hang up only when nobody
                        // is left, so a group call goes on when one person leaves.
                        if (remoteJoined && video.remoteCount == 0) exit("Call ended")
                        else status = "In call with ${video.remoteCount} other(s)"
                    }
                }
                // Fires ~30 s before the 1-hour token expires …
                override fun onTokenPrivilegeWillExpire(token: String?) {
                    scope.launch { renewRtcToken(roomId, body, video) }
                }
                // … and when it already expired.
                override fun onRequestToken() {
                    scope.launch { renewRtcToken(roomId, body, video) }
                }
            })
            video.engineOrNull()?.joinChannel(tok.rtcToken, tok.channelName, null, tok.uid)
        } catch (t: Throwable) {
            status = "Failed to start call: ${t.message}"
        }
    }

    // ── Caller: give up when nobody has joined 45 s after the call started ──
    // (restarted on `call_accepted`, so an answer in the last seconds of the
    // ring still has time to reach the media channel)
    LaunchedEffect(call, ringRestarts) {
        val info = call ?: return@LaunchedEffect
        if (!info.isCaller) return@LaunchedEffect
        delay(RING_TIMEOUT_MS)
        if (!remoteJoined) exit("No answer")
    }

    // ── Call events on the room's real-time channel ──
    val realtimeReady by HyperBabelRealtime.ready.collectAsState()
    DisposableEffect(roomChannel, call, realtimeReady) {
        val channel = roomChannel
        val info = call
        if (channel.isNullOrEmpty() || info == null || !realtimeReady) {
            return@DisposableEffect onDispose { }
        }
        val unsub = HyperBabelRealtime.subscribeRoom(channel) { name, raw ->
            val event = HyperBabelRealtime.callEventOf(name, raw, info.sessionId)
                ?: return@subscribeRoom
            scope.launch {
                when (event) {
                    // Someone answered: give them a fresh 45 s to join.
                    "call_accepted" ->
                        if (info.isCaller && !remoteJoined && !exited) ringRestarts++
                    // The session is over on the server — no API call needed.
                    "call_ended" -> {
                        sessionEnded = true
                        exit("Call ended")
                    }
                    // Only the caller of a 1:1 call stops on a decline; in a group
                    // call one callee declining must not end it for the others.
                    "call_rejected", "call_missed", "call_busy" ->
                        if (info.isCaller && info.callType == "1to1" && !remoteJoined) {
                            exit(
                                when (event) {
                                    "call_rejected" -> "Declined"
                                    "call_busy" -> "Busy"
                                    else -> "No answer"
                                },
                            )
                        }
                }
            }
        }
        // Removes only this screen's listener; the channel stays attached.
        onDispose { unsub() }
    }

    DisposableEffect(Unit) {
        onDispose {
            // The system back button closes the screen without exit() — leave here too.
            sendLeave()
            try { video.leaveCall() } catch (_: Throwable) {}
            try { video.release() } catch (_: Throwable) {}
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Video call", style = MaterialTheme.typography.headlineSmall)
        Text(status, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (permissionNote.isNotEmpty()) {
            Text(permissionNote,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall)
        }
        Button(onClick = { exit(null) }) { Text("Hang up") }
    }
}

/**
 * Tell the server this participant reached the RTC channel. `matched: false`
 * means the stamp did not land yet (e.g. the callee's accept is still being
 * stored) — retry a few times, 2 s apart. Cancelled when the screen closes.
 */
private suspend fun markJoinedRtc(roomId: String, body: Map<String, String>) {
    repeat(1 + JOINED_RTC_RETRIES) { attempt ->
        val matched = runCatching { ApiClient.unitedChat.markJoinedRtc(roomId, body).matched }
            .getOrDefault(false)
        if (matched) return
        if (attempt < JOINED_RTC_RETRIES) delay(JOINED_RTC_RETRY_DELAY_MS)
    }
}

/** Fetch a fresh 1-hour token for the same channel and uid and hand it to the engine. */
private suspend fun renewRtcToken(roomId: String, body: Map<String, String>, video: HyperBabelVideo) {
    runCatching { ApiClient.unitedChat.renewVideoCallToken(roomId, body) }
        .onSuccess { video.renewToken(it.rtcToken) }
}
