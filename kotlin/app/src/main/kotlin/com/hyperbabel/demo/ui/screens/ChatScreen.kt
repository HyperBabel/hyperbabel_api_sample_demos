/*
 * Chat screen — full HyperBabel chat surface with:
 *   - Real-time message + typing + reaction events
 *   - Edit / delete on own messages, Reply / React on any
 *   - Image and arbitrary-file upload via the 3-step presign flow
 *   - Members modal with promote / demote / ban + room mute toggle
 *   - Freeze toggle for owner / sub_admin
 *   - Locale-aware timestamps + edited indicator
 */
package com.hyperbabel.demo.ui.screens

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.Reply
import androidx.compose.material.icons.filled.Videocam
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
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.hyperbabel.demo.api.ApiClient
import com.hyperbabel.demo.api.StorageUpload
import com.hyperbabel.demo.data.Message
import com.hyperbabel.demo.data.SendMessageRequest
import com.hyperbabel.demo.data.Session
import com.hyperbabel.demo.data.StartVideoCallRequest
import com.hyperbabel.demo.realtime.HyperBabelRealtime
import com.hyperbabel.demo.ui.components.MembersSheet
import com.hyperbabel.demo.utils.formatMessageTime
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File

@OptIn(ExperimentalMaterial3Api::class, ExperimentalComposeUiApi::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun ChatScreen(roomId: String, onBack: () -> Unit, onStartCall: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    val messages = remember { mutableStateListOf<Message>() }
    var input by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }

    var role by remember { mutableStateOf("member") }
    var isFrozen by remember { mutableStateOf(false) }
    var isMuted by remember { mutableStateOf(false) }
    var typingFrom by remember { mutableStateOf<String?>(null) }
    var lastTypingPing by remember { mutableStateOf(0L) }
    var replyTo by remember { mutableStateOf<Message?>(null) }
    var showMembers by remember { mutableStateOf(false) }
    var actionFor by remember { mutableStateOf<Message?>(null) }
    var editFor by remember { mutableStateOf<Message?>(null) }
    var editText by remember { mutableStateOf("") }
    var reactionFor by remember { mutableStateOf<Message?>(null) }
    val canModerate = role == "owner" || role == "sub_admin"

    val imagePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri: Uri? ->
        if (uri != null) {
            scope.launch {
                uploadAndSend(ctx, uri, "image", roomId,
                    onError = { error = it }, setSending = { sending = it })
            }
        }
    }
    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri: Uri? ->
        if (uri != null) {
            scope.launch {
                uploadAndSend(ctx, uri, "file", roomId,
                    onError = { error = it }, setSending = { sending = it })
            }
        }
    }

    LaunchedEffect(roomId) {
        try {
            val resp = ApiClient.unitedChat.getMessages(roomId, Session.userId)
            messages.clear()
            messages.addAll(resp.messages.reversed())
            try { ApiClient.unitedChat.markRead(roomId, mapOf("user_id" to Session.userId)) } catch (_: Throwable) {}
        } catch (t: Throwable) {
            error = t.message ?: "Failed to load messages"
        }
        runCatching {
            val resp = ApiClient.unitedChat.getMembers(roomId)
            val list: JsonArray = resp["members"]?.jsonArray ?: JsonArray(emptyList())
            val me = list.map { it.jsonObject }
                .firstOrNull { it["user_id"]?.jsonPrimitive?.content == Session.userId }
            role = me?.get("role")?.jsonPrimitive?.content ?: "member"
        }
        runCatching {
            val s = ApiClient.unitedChat.getMuteStatus(roomId, Session.userId)
            isMuted = (s["is_muted"]?.jsonPrimitive?.content == "true")
        }
    }

    DisposableEffect(roomId) {
        HyperBabelRealtime.connect { error = it.message ?: "Realtime connect failed" }
        val unsub = HyperBabelRealtime.subscribeRoom(roomId) { name, raw ->
            val envelope = raw as? Map<*, *> ?: return@subscribeRoom
            when (name) {
                // Workers publishes both real messages and typing pings under
                // event-name 'message' — disambiguate by the inner `type`.
                "message" -> when (envelope["type"]?.toString()) {
                    "typing" -> {
                        val from = envelope["userId"]?.toString()
                        if (from != null && from != Session.userId) {
                            typingFrom = envelope["userName"]?.toString() ?: from
                        }
                    }
                    "message" -> {
                        val payload = envelope["data"] as? Map<*, *> ?: return@subscribeRoom
                        val id = payload["id"]?.toString() ?: return@subscribeRoom
                        if (messages.any { it.id == id }) return@subscribeRoom
                        messages.add(
                            Message(
                                id = id,
                                senderId = payload["sender_id"]?.toString() ?: "",
                                senderName = payload["sender_name"]?.toString(),
                                content = payload["content"]?.toString(),
                                messageType = payload["message_type"]?.toString(),
                            )
                        )
                    }
                }
                "message.deleted" -> {
                    val id = envelope["id"]?.toString() ?: envelope["message_id"]?.toString()
                    if (id != null) {
                        val idx = messages.indexOfFirst { it.id == id }
                        if (idx >= 0) {
                            val current = messages[idx]
                            messages[idx] = current.copy(content = "[deleted]")
                        }
                    }
                }
                "message.updated" -> {
                    val id = envelope["id"]?.toString() ?: envelope["message_id"]?.toString()
                    val nextContent = envelope["content"]?.toString()
                    if (id != null && nextContent != null) {
                        val idx = messages.indexOfFirst { it.id == id }
                        if (idx >= 0) {
                            messages[idx] = messages[idx].copy(content = nextContent)
                        }
                    }
                }
            }
        }
        onDispose { unsub() }
    }

    LaunchedEffect(typingFrom) {
        if (typingFrom != null) {
            delay(3000)
            typingFrom = null
        }
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.size - 1)
    }

    Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {
        // ── Top bar ──────────────────────────────────────────────────────
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = onBack) { Text("← Back") }
            Spacer(modifier = Modifier.weight(1f))
            IconButton(onClick = {
                scope.launch {
                    runCatching {
                        ApiClient.unitedChat.startVideoCall(
                            roomId,
                            StartVideoCallRequest(callerId = Session.userId, targetUserIds = emptyList()),
                        )
                        onStartCall()
                    }.onFailure { error = it.message ?: "Failed to start call" }
                }
            }) { Icon(Icons.Filled.Videocam, contentDescription = "Start call") }
            if (canModerate) {
                IconButton(onClick = {
                    scope.launch {
                        runCatching {
                            if (isFrozen) ApiClient.unitedChat.unfreezeRoom(roomId)
                            else ApiClient.unitedChat.freezeRoom(roomId, mapOf("user_id" to Session.userId))
                            isFrozen = !isFrozen
                        }.onFailure { error = it.message ?: "Failed" }
                    }
                }) {
                    Icon(if (isFrozen) Icons.Filled.LockOpen else Icons.Filled.Lock,
                        contentDescription = "Freeze")
                }
            }
            IconButton(onClick = { showMembers = true }) {
                Icon(Icons.Filled.Group, contentDescription = "Members")
            }
        }

        if (error.isNotBlank()) {
            Text(error, color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall)
        }
        if (isFrozen) {
            Box(modifier = Modifier
                .fillMaxWidth()
                .background(Color(0x33F59E0B))
                .padding(8.dp)) {
                Text(
                    if (canModerate) "🔒 This room is frozen — only admins can post."
                    else "🔒 This room is frozen — only admins can post right now.",
                    color = Color(0xFFF59E0B),
                )
            }
        }

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).padding(vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            items(messages, key = { it.id }) { msg ->
                MessageBubble(
                    msg = msg,
                    isOwn = msg.senderId == Session.userId,
                    onLongPress = { actionFor = msg },
                )
            }
        }

        if (typingFrom != null) {
            Text("$typingFrom is typing…",
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.labelSmall)
        }
        replyTo?.let { parent ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp))
                    .padding(horizontal = 8.dp, vertical = 6.dp),
            ) {
                Icon(Icons.Filled.Reply, contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary)
                Spacer(modifier = Modifier.width(8.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("Replying to ${parent.senderName ?: parent.senderId}",
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.labelSmall)
                    Text(parent.content ?: "[media]",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1)
                }
                IconButton(onClick = { replyTo = null }) {
                    Icon(Icons.Filled.Close, contentDescription = "Cancel reply")
                }
            }
        }

        // ── Input row ────────────────────────────────────────────────────
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { imagePicker.launch("image/*") }, enabled = !sending) {
                Icon(Icons.Filled.Image, contentDescription = "Send image")
            }
            IconButton(onClick = { filePicker.launch("*/*") }, enabled = !sending) {
                Icon(Icons.Filled.AttachFile, contentDescription = "Send file")
            }
            OutlinedTextField(
                value = input,
                onValueChange = {
                    input = it
                    val now = System.currentTimeMillis()
                    if (now - lastTypingPing > 2000) {
                        lastTypingPing = now
                        scope.launch {
                            runCatching {
                                ApiClient.unitedChat.sendTyping(
                                    roomId,
                                    mapOf("user_id" to Session.userId, "display_name" to Session.displayName),
                                )
                            }
                        }
                    }
                },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Type a message") },
                singleLine = true,
            )
            Button(
                onClick = {
                    val text = input.trim()
                    if (text.isEmpty()) return@Button
                    val sendingReplyTo = replyTo
                    input = ""
                    replyTo = null
                    sending = true
                    scope.launch {
                        try {
                            ApiClient.unitedChat.sendMessage(
                                roomId,
                                SendMessageRequest(
                                    senderId = Session.userId,
                                    senderName = Session.displayName,
                                    content = text,
                                ),
                            )
                        } catch (t: Throwable) {
                            error = t.message ?: "Failed to send"
                            input = text
                            replyTo = sendingReplyTo
                        } finally { sending = false }
                    }
                },
                modifier = Modifier.padding(start = 6.dp),
            ) { Text("Send") }
        }
    }

    // ── Action sheet (long-press menu) ─────────────────────────────────────
    actionFor?.let { msg ->
        val isOwn = msg.senderId == Session.userId
        DropdownMenu(expanded = true, onDismissRequest = { actionFor = null }) {
            DropdownMenuItem(text = { Text("↩  Reply") }, onClick = { replyTo = msg; actionFor = null })
            DropdownMenuItem(text = { Text("😊  React") }, onClick = { reactionFor = msg; actionFor = null })
            if (isOwn) {
                DropdownMenuItem(text = { Text("✏  Edit") }, onClick = {
                    editFor = msg
                    editText = msg.content ?: ""
                    actionFor = null
                })
                DropdownMenuItem(text = { Text("🗑  Delete") }, onClick = {
                    actionFor = null
                    scope.launch {
                        runCatching { ApiClient.unitedChat.deleteMessage(roomId, msg.id, Session.userId) }
                            .onFailure { error = it.message ?: "Failed" }
                    }
                })
            }
        }
    }

    // ── Edit dialog ─────────────────────────────────────────────────────────
    editFor?.let { msg ->
        AlertDialog(
            onDismissRequest = { editFor = null },
            title = { Text("Edit message") },
            text = {
                OutlinedTextField(
                    value = editText, onValueChange = { editText = it },
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    val text = editText.trim()
                    editFor = null
                    if (text.isNotBlank()) {
                        scope.launch {
                            runCatching {
                                ApiClient.unitedChat.editMessage(
                                    roomId, msg.id,
                                    mapOf("user_id" to Session.userId, "content" to text),
                                )
                            }.onFailure { error = it.message ?: "Failed" }
                        }
                    }
                }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { editFor = null }) { Text("Cancel") } },
        )
    }

    // ── Reaction picker ─────────────────────────────────────────────────────
    reactionFor?.let { msg ->
        val emojis = listOf("👍", "❤️", "😂", "😮", "😢", "🎉", "🔥", "✅")
        AlertDialog(
            onDismissRequest = { reactionFor = null },
            title = { Text("React") },
            text = {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    emojis.forEach { e ->
                        TextButton(onClick = {
                            reactionFor = null
                            scope.launch {
                                runCatching {
                                    ApiClient.chat.addReaction(
                                        msg.id,
                                        mapOf("user_id" to Session.userId, "emoji" to e),
                                    )
                                }.onFailure { error = it.message ?: "Failed" }
                            }
                        }) { Text(e, style = MaterialTheme.typography.headlineSmall) }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { reactionFor = null }) { Text("Cancel") } },
        )
    }

    if (showMembers) {
        MembersSheet(
            roomId = roomId,
            currentUserRole = role,
            isMuted = isMuted,
            onDismiss = { showMembers = false },
            onMutedChanged = { isMuted = it },
        )
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun MessageBubble(
    msg: Message,
    isOwn: Boolean,
    onLongPress: () -> Unit,
) {
    val type = msg.messageType ?: "text"
    val edited = msg.updatedAt != null && msg.createdAt != null && msg.updatedAt != msg.createdAt
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isOwn) Arrangement.End else Arrangement.Start,
    ) {
        Card(
            modifier = Modifier.combinedClickable(
                onClick = {},
                onLongClick = onLongPress,
            ),
            colors = CardDefaults.cardColors(
                containerColor = if (isOwn) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.surfaceVariant,
            ),
        ) {
            Column(modifier = Modifier.padding(10.dp)) {
                if (!isOwn) Text(
                    msg.senderName ?: msg.senderId,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                when (type) {
                    "image" -> Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Image, contentDescription = null,
                            tint = if (isOwn) MaterialTheme.colorScheme.onPrimary
                                else MaterialTheme.colorScheme.onSurface)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(msg.content ?: "[image]",
                            color = if (isOwn) MaterialTheme.colorScheme.onPrimary
                                else MaterialTheme.colorScheme.onSurface,
                            maxLines = 2)
                    }
                    "file" -> Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.InsertDriveFile, contentDescription = null,
                            tint = if (isOwn) MaterialTheme.colorScheme.onPrimary
                                else MaterialTheme.colorScheme.onSurface)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(msg.content ?: "[file]",
                            color = if (isOwn) MaterialTheme.colorScheme.onPrimary
                                else MaterialTheme.colorScheme.onSurface,
                            maxLines = 1)
                    }
                    else -> Text(
                        msg.content ?: "",
                        color = if (isOwn) MaterialTheme.colorScheme.onPrimary
                        else MaterialTheme.colorScheme.onSurface,
                    )
                }
                Row(modifier = Modifier.padding(top = 2.dp)) {
                    Text(
                        formatMessageTime(msg.createdAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (isOwn) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.7f)
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (edited) {
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            "edited",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isOwn) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.7f)
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

private suspend fun uploadAndSend(
    ctx: Context,
    uri: Uri,
    messageType: String,
    roomId: String,
    onError: (String) -> Unit,
    setSending: (Boolean) -> Unit,
) {
    setSending(true)
    try {
        val resolver = ctx.contentResolver
        val mime = resolver.getType(uri) ?: "application/octet-stream"
        val name = uri.lastPathSegment ?: "upload-${System.currentTimeMillis()}"
        val temp = File.createTempFile("hb-upload-", null, ctx.cacheDir)
        resolver.openInputStream(uri)?.use { input -> temp.outputStream().use { input.copyTo(it) } }
        val confirmed = StorageUpload.uploadFile(
            file = temp,
            filename = name,
            mimeType = mime,
        )
        val url = confirmed["url"]?.jsonPrimitive?.content
            ?: confirmed["cdn_url"]?.jsonPrimitive?.content
            ?: ""
        ApiClient.unitedChat.sendMessage(
            roomId,
            SendMessageRequest(
                senderId = Session.userId,
                senderName = Session.displayName,
                content = if (messageType == "image") url else name,
            ),
        )
        runCatching { temp.delete() }
        @Suppress("UNUSED_EXPRESSION") messageType
    } catch (t: Throwable) {
        onError(t.message ?: "Upload failed")
    } finally { setSending(false) }
}
