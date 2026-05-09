/*
 * Global incoming-call overlay. Mounted once near the root of the Compose
 * tree; observes a singleton state holder that Real-Time pushes call
 * invites into. Renders an Accept / Reject prompt over whatever screen the
 * user is on.
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

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
}

@Composable
fun IncomingCallOverlay(
    onAccept: (roomId: String) -> Unit,
    onReject: (roomId: String) -> Unit,
) {
    val invite by IncomingCallBus.current
    if (invite == null) return
    val roomId    = invite!!["room_id"] ?: invite!!["roomId"] ?: ""
    val caller    = invite!!["caller_name"] ?: invite!!["caller_id"] ?: "Unknown"
    val callType  = invite!!["call_type"] ?: invite!!["callType"] ?: "1to1"

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
                    onClick = { IncomingCallBus.clear(); onReject(roomId) },
                    modifier = Modifier.size(72.dp).background(Color.Red, CircleShape),
                ) { Icon(Icons.Filled.CallEnd, contentDescription = "Reject", tint = Color.White) }
                IconButton(
                    onClick = { IncomingCallBus.clear(); onAccept(roomId) },
                    modifier = Modifier
                        .size(72.dp)
                        .background(Color(0xFF10B981), CircleShape),
                ) { Icon(Icons.Filled.Call, contentDescription = "Accept", tint = Color.White) }
            }
        }
    }
}
