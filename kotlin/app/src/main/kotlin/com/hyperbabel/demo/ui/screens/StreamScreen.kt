/*
 * Live Stream surface — list / host / viewer 3-mode with real RTC join.
 *
 *   - Host: POST /stream/sessions returns app_id + channel_name + a publisher
 *     rtc_token + uid embedded under `session.host`. We init the engine and
 *     join as broadcaster, surfacing the local camera in a SurfaceView.
 *   - Viewer: POST /stream/sessions/:id/viewer-token returns app_id +
 *     channel_name + token + uid (flat shape). We init the engine, join as
 *     audience, and bind a SurfaceView to the host's stream.
 */
package com.hyperbabel.demo.ui.screens

import android.view.SurfaceView
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.hyperbabel.demo.api.ApiClient
import com.hyperbabel.demo.data.Session
import com.hyperbabel.demo.video.HyperBabelVideo
import io.agora.rtc2.IRtcEngineEventHandler as VideoEventHandler
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

private enum class Mode { LIST, HOSTING, WATCHING }

@Composable
fun StreamScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val video = remember { HyperBabelVideo(ctx.applicationContext) }
    var mode by remember { mutableStateOf(Mode.LIST) }
    val sessions = remember { mutableStateListOf<JsonObject>() }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var activeSessionId by remember { mutableStateOf<String?>(null) }
    var activeTitle by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("") }
    // Tracks the first remote uid that publishes — Stream sessions broadcast
    // a single host stream, so we bind that uid to the viewer canvas.
    var remoteUid by remember { mutableStateOf(0) }

    suspend fun refresh() {
        loading = true
        error = ""
        try {
            val resp = ApiClient.stream.listSessions()
            val list: JsonArray = resp["sessions"]?.jsonArray ?: JsonArray(emptyList())
            sessions.clear()
            list.forEach { sessions.add(it.jsonObject) }
        } catch (t: Throwable) { error = t.message ?: "Failed" }
        finally { loading = false }
    }

    LaunchedEffect(Unit) { refresh() }
    DisposableEffect(Unit) {
        onDispose {
            // Engine is process-wide, so make sure we release on screen exit.
            runCatching { video.leaveCall() }
            runCatching { video.release() }
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = onBack) { Text("← Back") }
            Text("Live Streams", style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(start = 12.dp))
        }

        when (mode) {
            Mode.LIST -> ListView(
                loading = loading,
                error = error,
                sessions = sessions,
                onGoLive = {
                    scope.launch {
                        runCatching { goLive(ctx, video,
                            onSuccess = { sid, title, message ->
                                activeSessionId = sid
                                activeTitle = title
                                status = message
                                mode = Mode.HOSTING
                            },
                            onError = { error = it },
                            onRemoteJoined = { uid -> remoteUid = uid },
                        ) }
                    }
                },
                onWatch = { sid ->
                    scope.launch {
                        runCatching { watch(ctx, video, sid,
                            onSuccess = { title, message ->
                                activeSessionId = sid
                                activeTitle = title
                                status = message
                                mode = Mode.WATCHING
                            },
                            onError = { error = it },
                            onRemoteJoined = { uid -> remoteUid = uid },
                        ) }
                    }
                },
            )
            Mode.HOSTING -> HostingView(
                title = activeTitle,
                status = status,
                onEnd = {
                    scope.launch {
                        if (activeSessionId != null) {
                            runCatching {
                                ApiClient.stream.endSession(
                                    activeSessionId!!,
                                    mapOf("user_id" to Session.userId),
                                )
                            }
                        }
                        runCatching { video.leaveCall() }
                        runCatching { video.release() }
                        activeSessionId = null
                        activeTitle = ""
                        status = ""
                        mode = Mode.LIST
                        refresh()
                    }
                },
                attachLocal = { surface -> video.setupLocalView(surface) },
            )
            Mode.WATCHING -> WatchingView(
                title = activeTitle,
                status = status,
                remoteUid = remoteUid,
                onLeave = {
                    runCatching { video.leaveCall() }
                    runCatching { video.release() }
                    activeSessionId = null
                    activeTitle = ""
                    status = ""
                    remoteUid = 0
                    mode = Mode.LIST
                    scope.launch { refresh() }
                },
                attachRemote = { surface, uid -> video.setupRemoteView(surface, uid) },
            )
        }
    }
}

// ── View pieces ─────────────────────────────────────────────────────────────

@Composable
private fun ListView(
    loading: Boolean,
    error: String,
    sessions: List<JsonObject>,
    onGoLive: () -> Unit,
    onWatch: (String) -> Unit,
) {
    Button(
        modifier = Modifier.fillMaxWidth(),
        onClick = onGoLive,
    ) { Text("📡  Go Live (Host)") }

    if (loading) Text("Loading…", color = MaterialTheme.colorScheme.onSurfaceVariant)
    else if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
    else if (sessions.isEmpty()) Text(
        "Nobody is streaming right now — be the first.",
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    else LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        items(sessions, key = {
            it["session_id"]?.jsonPrimitive?.content
                ?: it["id"]?.jsonPrimitive?.content
                ?: ""
        }) { session ->
            val sid = session["session_id"]?.jsonPrimitive?.content
                ?: session["id"]?.jsonPrimitive?.content ?: ""
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                modifier = Modifier.fillMaxWidth().clickable { onWatch(sid) },
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        session["title"]?.jsonPrimitive?.content ?: "Untitled stream",
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Text(
                        "Host: ${session["host_name"]?.jsonPrimitive?.content ?: session["host_user_id"]?.jsonPrimitive?.content ?: "—"}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun HostingView(
    title: String,
    status: String,
    onEnd: () -> Unit,
    attachLocal: (SurfaceView) -> Unit,
) {
    Text("🔴  ${title.ifBlank { "You are live" }}", style = MaterialTheme.typography.titleMedium)
    AndroidView(
        factory = { ctx ->
            SurfaceView(ctx).also { attachLocal(it) }
        },
        modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
    )
    if (status.isNotBlank()) {
        Text(status, style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    Button(onClick = onEnd, modifier = Modifier.padding(top = 12.dp)) { Text("End Stream") }
}

@Composable
private fun WatchingView(
    title: String,
    status: String,
    remoteUid: Int,
    onLeave: () -> Unit,
    attachRemote: (SurfaceView, Int) -> Unit,
) {
    Text("📺  Watching ${title.ifBlank { "live stream" }}",
        style = MaterialTheme.typography.titleMedium)
    AndroidView(
        factory = { ctx ->
            SurfaceView(ctx).also { attachRemote(it, remoteUid) }
        },
        update = { view -> attachRemote(view, remoteUid) },
        modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
    )
    if (status.isNotBlank()) {
        Text(status, style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    Button(onClick = onLeave, modifier = Modifier.padding(top = 12.dp)) { Text("Leave") }
}

// ── API + RTC ────────────────────────────────────────────────────────────────

/// Stream-screen-local engine event handler. Surfaces remote uid so the
/// viewer canvas knows what to bind to.
private class StreamEventHandler(
    private val onRemote: (Int) -> Unit,
) : VideoEventHandler() {
    override fun onUserJoined(uid: Int, elapsed: Int) { onRemote(uid) }
}

private suspend fun goLive(
    ctx: android.content.Context,
    video: HyperBabelVideo,
    onSuccess: (sessionId: String, title: String, status: String) -> Unit,
    onError: (String) -> Unit,
    onRemoteJoined: (Int) -> Unit,
) {
    try {
        val payload = kotlinx.serialization.json.buildJsonObject {
            put("hosts", JsonArray(listOf(
                kotlinx.serialization.json.buildJsonObject {
                    put("user_id", kotlinx.serialization.json.JsonPrimitive(Session.userId))
                    put("display_name", kotlinx.serialization.json.JsonPrimitive(Session.displayName))
                }
            )))
            put("title", kotlinx.serialization.json.JsonPrimitive("Live from ${Session.displayName}"))
        }
        val resp = ApiClient.stream.createSession(payload)
        val detail = resp["session"]?.jsonObject ?: resp
        val sid = detail["id"]?.jsonPrimitive?.content
            ?: detail["session_id"]?.jsonPrimitive?.content
            ?: return onError("Server did not return a session id.")
        val appId = detail["app_id"]?.jsonPrimitive?.content
            ?: return onError("Server did not return app_id.")
        val channelName = detail["channel_name"]?.jsonPrimitive?.content
            ?: return onError("Server did not return channel_name.")
        val host = detail["host"]?.jsonObject
            ?: return onError("Server did not return host credentials.")
        val rtcToken = host["rtc_token"]?.jsonPrimitive?.content
            ?: return onError("Server did not return rtc_token.")
        val uid = host["uid"]?.jsonPrimitive?.content?.toIntOrNull()
            ?: return onError("Server did not return uid.")

        // Toggle the session into 'live' state — fire-and-forget.
        runCatching {
            ApiClient.stream.startSession(sid, mapOf("user_id" to Session.userId))
        }

        // Initialise the engine and join as broadcaster.
        video.init(appId, StreamEventHandler(onRemote = onRemoteJoined))
        video.joinWithToken(channelName, rtcToken, uid, "publisher")
        onSuccess(sid, detail["title"]?.jsonPrimitive?.content ?: "",
            "Joined channel $channelName as host.")
    } catch (t: Throwable) { onError(t.message ?: "Go-live failed") }
}

private suspend fun watch(
    ctx: android.content.Context,
    video: HyperBabelVideo,
    sessionId: String,
    onSuccess: (title: String, status: String) -> Unit,
    onError: (String) -> Unit,
    onRemoteJoined: (Int) -> Unit,
) {
    try {
        val token = ApiClient.stream.viewerToken(sessionId, mapOf("user_id" to Session.userId))
        val appId = token["app_id"]?.jsonPrimitive?.content
            ?: return onError("Server did not return app_id.")
        val channelName = token["channel_name"]?.jsonPrimitive?.content
            ?: return onError("Server did not return channel_name.")
        val rtcToken = token["token"]?.jsonPrimitive?.content
            ?: return onError("Server did not return token.")
        val uid = token["uid"]?.jsonPrimitive?.content?.toIntOrNull()
            ?: return onError("Server did not return uid.")

        video.init(appId, StreamEventHandler(onRemote = onRemoteJoined))
        video.joinWithToken(channelName, rtcToken, uid, "subscriber")
        onSuccess(
            token["title"]?.jsonPrimitive?.content ?: "",
            "Joined channel $channelName as viewer.",
        )
    } catch (t: Throwable) { onError(t.message ?: "Watch failed") }
}
