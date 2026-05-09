/*
 * Members modal — lists every room member with role badges, plus moderation
 * actions for owner / sub_admin (promote / demote / ban) and a quick mute
 * toggle for the current user.
 */
package com.hyperbabel.demo.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.hyperbabel.demo.api.ApiClient
import com.hyperbabel.demo.data.Session
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MembersSheet(
    roomId: String,
    currentUserRole: String,
    isMuted: Boolean,
    onDismiss: () -> Unit,
    onMutedChanged: (Boolean) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val members = remember { mutableStateListOf<JsonObject>() }
    var loading by remember { mutableStateOf(true) }
    var confirm by remember { mutableStateOf<Triple<String, String, () -> Unit>?>(null) }

    val isOwner = currentUserRole == "owner"
    val canModerate = isOwner || currentUserRole == "sub_admin"

    LaunchedEffect(roomId) {
        loading = true
        runCatching {
            val resp = ApiClient.unitedChat.getMembers(roomId)
            val list: JsonArray = resp["members"]?.jsonArray ?: JsonArray(emptyList())
            members.clear()
            list.forEach { members.add(it.jsonObject) }
        }
        loading = false
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Members", style = MaterialTheme.typography.titleMedium)
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (isMuted) "🔕 Notifications are muted for this room."
                    else "🔔 Notifications are on.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = {
                    scope.launch {
                        runCatching {
                            if (isMuted) ApiClient.unitedChat.unmuteRoom(roomId)
                            else ApiClient.unitedChat.muteRoom(roomId, kotlinx.serialization.json.buildJsonObject {
                                put("user_id", kotlinx.serialization.json.JsonPrimitive(Session.userId))
                            })
                            onMutedChanged(!isMuted)
                        }
                    }
                }) { Text(if (isMuted) "Unmute" else "Mute") }
            }
            if (loading) Text("Loading…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            else members.forEach { m ->
                MemberRow(
                    member = m,
                    canModerate = canModerate,
                    isOwner = isOwner,
                    onPromote = { uid ->
                        scope.launch {
                            runCatching {
                                ApiClient.unitedChat.addSubAdmin(
                                    roomId,
                                    mapOf("owner_id" to Session.userId, "user_id" to uid),
                                )
                            }
                            // best-effort reload
                            runCatching {
                                val r = ApiClient.unitedChat.getMembers(roomId)
                                val list: JsonArray = r["members"]?.jsonArray ?: JsonArray(emptyList())
                                members.clear(); list.forEach { members.add(it.jsonObject) }
                            }
                        }
                    },
                    onDemote = { uid ->
                        scope.launch {
                            runCatching { ApiClient.unitedChat.removeSubAdmin(roomId, uid) }
                            runCatching {
                                val r = ApiClient.unitedChat.getMembers(roomId)
                                val list: JsonArray = r["members"]?.jsonArray ?: JsonArray(emptyList())
                                members.clear(); list.forEach { members.add(it.jsonObject) }
                            }
                        }
                    },
                    onBan = { uid, name ->
                        confirm = Triple(
                            "Ban member?",
                            "Banning $name removes them from the room and prevents them from rejoining until you unban.",
                        ) {
                            scope.launch {
                                runCatching {
                                    ApiClient.unitedChat.banUser(
                                        roomId,
                                        mapOf("admin_id" to Session.userId, "user_id" to uid),
                                    )
                                    members.removeIf {
                                        it["user_id"]?.jsonPrimitive?.content == uid
                                    }
                                }
                            }
                        }
                    },
                )
            }
        }
    }

    confirm?.let { (title, body, doIt) ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text(title) },
            text = { Text(body) },
            confirmButton = {
                TextButton(onClick = { doIt(); confirm = null }) { Text("Confirm") }
            },
            dismissButton = {
                TextButton(onClick = { confirm = null }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun MemberRow(
    member: JsonObject,
    canModerate: Boolean,
    isOwner: Boolean,
    onPromote: (String) -> Unit,
    onDemote: (String) -> Unit,
    onBan: (String, String) -> Unit,
) {
    val userId = member["user_id"]?.jsonPrimitive?.content ?: ""
    val userName = member["user_name"]?.jsonPrimitive?.content ?: userId
    val role = member["role"]?.jsonPrimitive?.content ?: "member"
    val isSelf = userId == Session.userId
    val canActOnThisRow = canModerate && !isSelf && role != "owner"
    var menuOpen by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(userName, style = MaterialTheme.typography.titleSmall)
            Text(role, style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (canActOnThisRow) {
            IconButton(onClick = { menuOpen = true }) {
                Icon(Icons.Filled.MoreVert, contentDescription = "Manage member")
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                if (isOwner && role == "member") {
                    DropdownMenuItem(text = { Text("🛡  Promote to sub_admin") },
                        onClick = { menuOpen = false; onPromote(userId) })
                }
                if (isOwner && role == "sub_admin") {
                    DropdownMenuItem(text = { Text("↓  Demote to member") },
                        onClick = { menuOpen = false; onDemote(userId) })
                }
                DropdownMenuItem(text = { Text("🚫  Ban from room") },
                    onClick = { menuOpen = false; onBan(userId, userName) })
            }
        }
    }
}
