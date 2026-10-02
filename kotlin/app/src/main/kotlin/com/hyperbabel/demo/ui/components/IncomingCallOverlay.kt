/*
 * Global incoming-call overlay. Mounted once near the root of the Compose
 * tree; observes a singleton state holder that Real-Time pushes call
 * invites into. Renders an Accept / Reject prompt over whatever screen the
 * user is on.
 *
 * The invite is the `CALL_INVITE` payload from the user's private real-time
 * channel (see MainActivity), flattened to strings: `roomId`, `sessionId`,
 * `callerId`, `callerName`, `callType` ("1to1" | "group"),
 * `roomSignalChannel`. Accept and Reject receive the whole invite because
 * both calls need `sessionId`.
 *
 * While ringing, the overlay listens on the call's room channel
 * (`roomSignalChannel`): `call_ended` for this session means the caller hung
 * up, so it disappears. After 45 s unanswered it reports the call as missed
 * (reject with reason "missed") and disappears.
 */
package com.hyperbabel.demo.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.hyperbabel.demo.realtime.HyperBabelRealtime
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** An unanswered invite is reported as missed after this long. */
private const val RING_TIMEOUT_MS = 45_000L

/**
 * Tiny event bus the Real-Time listener publishes invites into. Compose
 * recomposes the overlay whenever this state flips between null and a
 * payload map.
 */
object IncomingCallBus {
    var current: androidx.compose.runtime.MutableState<Map<String, String>?> =
        mutableStateOf(null)

    fun show(invite: Map<String, String>) { current.value = invite }
    fun clear() { current.value = null }

    /** Clear only if [invite] is still the one showing (a newer invite may have replaced it). */
    fun clearIf(invite: Map<String, String>) {
        if (current.value === invite) current.value = null
    }
}

@Composable
fun IncomingCallOverlay(
    onAccept: (invite: Map<String, String>) -> Unit,
    /** [reason] is null when the user declined, "missed" when nobody answered. */
    onReject: (invite: Map<String, String>, reason: String?) -> Unit,
) {
    val invite = IncomingCallBus.current.value ?: return
    val roomId    = invite["roomId"].orEmpty()
    val caller    = invite["callerName"] ?: invite["callerId"] ?: "Unknown"
    val callType  = invite["callType"] ?: "1to1"

    val scope = rememberCoroutineScope()
    val currentOnReject by rememberUpdatedState(onReject)

    // While ringing: the caller hanging up (or the server cleaning up) ends the
    // session, announced as `call_ended` on the call's room channel.
    val realtimeReady by HyperBabelRealtime.ready.collectAsState()
    DisposableEffect(invite, realtimeReady) {
        val channel = invite["roomSignalChannel"]
        val sessionId = invite["sessionId"]
        if (!realtimeReady || channel.isNullOrEmpty() || sessionId.isNullOrEmpty()) {
            return@DisposableEffect onDispose { }
        }
        val unsub = HyperBabelRealtime.subscribeRoom(channel) { name, raw ->
            if (HyperBabelRealtime.callEventOf(name, raw, sessionId) == "call_ended") {
                scope.launch { IncomingCallBus.clearIf(invite) }
            }
        }
        // Removes only this listener — an open chat screen on the same room
        // keeps receiving its events.
        onDispose { unsub() }
    }

    // Nobody answered: tell the server it was missed and stop ringing.
    LaunchedEffect(invite) {
        delay(RING_TIMEOUT_MS)
        if (IncomingCallBus.current.value === invite) {
            IncomingCallBus.clear()
            currentOnReject(invite, "missed")
        }
    }

    Box(
        modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.85f)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.padding(24.dp),
        ) {
            Icon(
                Icons.Filled.Videocam,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(80.dp),
            )
            Text("Incoming $callType call", color = Color.White.copy(alpha = 0.7f))
            Text(caller,
                color = Color.White,
                style = MaterialTheme.typography.headlineSmall)
            Text("Room: $roomId",
                color = Color.White.copy(alpha = 0.4f),
                style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(48.dp), modifier = Modifier.padding(top = 24.dp)) {
                IconButton(
                    onClick = { IncomingCallBus.clear(); onReject(invite, null) },
                    modifier = Modifier.size(72.dp).background(Color.Red, CircleShape),
                ) { Icon(Icons.Filled.CallEnd, contentDescription = "Reject", tint = Color.White) }
                IconButton(
                    onClick = { IncomingCallBus.clear(); onAccept(invite) },
                    modifier = Modifier
                        .size(72.dp)
                        .background(Color(0xFF10B981), CircleShape),
                ) { Icon(Icons.Filled.Call, contentDescription = "Accept", tint = Color.White) }
            }
        }
    }
}
