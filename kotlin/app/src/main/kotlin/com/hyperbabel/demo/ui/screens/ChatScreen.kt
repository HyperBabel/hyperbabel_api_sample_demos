/*
 * Chat screen — full HyperBabel chat surface with:
 *   - Real-time new-message, typing, edit and delete events
 *   - Edit / delete on own messages, Reply (top-level `reply_to`) / React on any
 *   - Image and arbitrary-file upload via the 3-step presign flow, sent with
 *     the `message_type` the server derives for the file
 *   - Members modal with promote / demote / ban + room mute toggle
 *   - Freeze toggle for owner / sub_admin
 *   - Locale-aware timestamps + edited indicator
 *   - Video call button: a 1:1 room rings the other member, a group room
 *     opens a picker (at most MAX_CALL_TARGETS people); none in open rooms
 *   - Call events (`video_call` system messages) shown as one-line notices;
 *     live call captions on the room channel are skipped
 */
package com.hyperbabel.demo.ui.screens

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.File

/** Group calls ring at most this many people (3 including you) — the server rejects more. */
private const val MAX_CALL_TARGETS = 2

@OptIn(ExperimentalMaterial3Api::class, ExperimentalComposeUiApi::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun ChatScreen(roomId: String, onBack: () -> Unit, onStartCall: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    val messages = remember { mutableStateListOf<Message>() }
    // Parents of replies that are outside the loaded page (from `reply_snapshots`).
    val replySnapshots = remember { mutableStateMapOf<String, Message>() }
    // "1to1" | "group" | "open" — decides whether and how a call can start.
    var roomType by remember { mutableStateOf("") }
    // Everyone else in the room (id to display name) — the group-call picker.
    var otherMembers by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var showCallPicker by remember { mutableStateOf(false) }
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

    // The send response and the real-time echo carry the same message id;
    // whichever arrives second is dropped (the list is keyed by id).
    val appendMessage: (Message) -> Unit = { m -> if (messages.none { it.id == m.id }) messages.add(m) }

    val imagePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri: Uri? ->
        if (uri != null) {
            scope.launch {
                uploadAndSend(ctx, uri, "image", roomId, onSent = appendMessage,
                    onError = { error = it }, setSending = { sending = it })
            }
        }
    }
    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri: Uri? ->
        if (uri != null) {
            scope.launch {
                uploadAndSend(ctx, uri, "file", roomId, onSent = appendMessage,
                    onError = { error = it }, setSending = { sending = it })
            }
        }
    }

    LaunchedEffect(roomId) {
        try {
            val resp = ApiClient.unitedChat.getMessages(roomId, Session.userId)
            messages.clear()
            messages.addAll(resp.messages.reversed())
            replySnapshots.putAll(resp.replySnapshots)
            try { ApiClient.unitedChat.markRead(roomId, mapOf("user_id" to Session.userId)) } catch (_: Throwable) {}
        } catch (t: Throwable) {
            error = t.message ?: "Failed to load messages"
        }
        runCatching {
            val resp = ApiClient.unitedChat.getMembers(roomId)
            val list: JsonArray = resp["members"]?.jsonArray ?: JsonArray(emptyList())
            val rows = list.map { it.jsonObject }
            otherMembers = rows.mapNotNull { row ->
                val id = row["user_id"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                if (id == Session.userId) return@mapNotNull null
                id to (row["user_name"]?.jsonPrimitive?.contentOrNull ?: id)
            }
            val me = rows.firstOrNull { it["user_id"]?.jsonPrimitive?.content == Session.userId }
            role = me?.get("role")?.jsonPrimitive?.content ?: "member"
        }
        runCatching {
            val s = ApiClient.unitedChat.getMuteStatus(roomId, Session.userId)
            isMuted = (s["is_muted"]?.jsonPrimitive?.content == "true")
        }
    }

    // The room's real-time channel comes from the API and is used verbatim —
    // it cannot be rebuilt from the room id (see HyperBabelRealtime.subscribeRoom).
    var realtimeChannel by remember(roomId) { mutableStateOf<String?>(null) }
    LaunchedEffect(roomId) {
        runCatching { ApiClient.unitedChat.getRoom(roomId, Session.userId) }
            .onSuccess {
                realtimeChannel = it.room.realtimeChannel
                roomType = it.room.roomType
            }
    }

    // A 1:1 room rings the other member (send no targets); a group room rings
    // the members picked in the dialog below. Each callee gets CALL_INVITE on
    // their private channel.
    fun startCall(targets: List<String>) {
        scope.launch {
            runCatching {
                ApiClient.unitedChat.startVideoCall(
                    roomId,
                    StartVideoCallRequest(callerId = Session.userId, targetUserIds = targets),
                )
                onStartCall()
            }.onFailure { error = it.message ?: "Failed to start call" }
        }
    }

    val realtimeReady by HyperBabelRealtime.ready.collectAsState()
    DisposableEffect(realtimeChannel, realtimeReady) {
        val channel = realtimeChannel
        if (channel.isNullOrEmpty()) return@DisposableEffect onDispose { }
        // connect() is asynchronous (it fetches a token first), so the first
        // pass only starts it. `realtimeReady` flips once the client exists and
        // this effect runs again to subscribe — subscribing right after
        // connect() would hit a missing client and silently do nothing.
        if (!realtimeReady) {
            HyperBabelRealtime.connect { error = it.message ?: "Realtime connect failed" }
            return@DisposableEffect onDispose { }
        }
        val unsub = HyperBabelRealtime.subscribeRoom(channel) { name, raw ->
            val envelope = raw as? Map<*, *> ?: return@subscribeRoom
            // Events arrive on an SDK thread — apply them on the main thread,
            // where the send path also appends, so the two never race.
            scope.launch {
                when (name) {
                    // The server publishes both real messages and typing pings
                    // under event-name 'message' — disambiguate by the inner `type`.
                    "message" -> when (envelope["type"]?.toString()) {
                        "typing" -> {
                            val from = envelope["userId"]?.toString()
                            if (from != null && from != Session.userId) {
                                typingFrom = envelope["userName"]?.toString() ?: from
                            }
                        }
                        "message" -> {
                            // `data` is the full stored message — same shape as
                            // GET …/messages, so decode it with the same model.
                            val payload = envelope["data"] as? Map<*, *> ?: return@launch
                            // Live call captions ride on this channel too, but the
                            // message list never returns them — skip them here so
                            // they don't appear live and vanish on reload.
                            if (payload["message_type"]?.toString() == "caption") return@launch
                            val message = runCatching {
                                ApiClient.json.decodeFromJsonElement(Message.serializer(), payload.toJsonElement())
                            }.getOrNull() ?: return@launch
                            appendMessage(message)
                        }
                    }
                    // Delete / edit events carry the id INSIDE `data`:
                    //   { type, timestamp, data: { message_id, deleted_by } }
                    //   { type, timestamp, data: { message_id, content, edited_at } }
                    "message.deleted" -> {
                        val data = envelope["data"] as? Map<*, *> ?: return@launch
                        val id = data["message_id"]?.toString() ?: return@launch
                        val idx = messages.indexOfFirst { it.id == id }
                        if (idx >= 0) messages[idx] = messages[idx].copy(content = "[deleted]")
                    }
                    "message.updated" -> {
                        val data = envelope["data"] as? Map<*, *> ?: return@launch
                        val id = data["message_id"]?.toString() ?: return@launch
                        val nextContent = data["content"]?.toString() ?: return@launch
                        val idx = messages.indexOfFirst { it.id == id }
                        if (idx >= 0) {
                            messages[idx] = messages[idx].copy(
                                content = nextContent,
                                editedAt = data["edited_at"]?.toString() ?: "edited",
                            )
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
            // Calls exist in 1:1 and group rooms only — open rooms have none.
            if (roomType == "1to1" || roomType == "group") {
                IconButton(onClick = {
                    if (roomType == "group") showCallPicker = true else startCall(emptyList())
                }) { Icon(Icons.Filled.Videocam, contentDescription = "Start call") }
            }
            if (canModerate) {
                IconButton(onClick = {
                    scope.launch {
                        runCatching {
                            val me = mapOf("user_id" to Session.userId)
                            if (isFrozen) ApiClient.unitedChat.unfreezeRoom(roomId, me)
                            else ApiClient.unitedChat.freezeRoom(roomId, me)
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
                    replyParent = msg.replyTo?.let { parentId ->
                        messages.firstOrNull { it.id == parentId } ?: replySnapshots[parentId]
                    },
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
                    Text(parent.previewText(),
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
                            // The response is `{ message: { … } }`; show it right away
                            // (the real-time echo with the same id is then ignored).
                            val sent = ApiClient.unitedChat.sendMessage(
                                roomId,
                                SendMessageRequest(
                                    senderId = Session.userId,
                                    senderName = Session.displayName,
                                    content = text,
                                    replyTo = sendingReplyTo?.id,
                                ),
                            ).message
                            appendMessage(sent)
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
                        runCatching {
                            // `user_id` goes in the JSON body, not the query string.
                            ApiClient.unitedChat.deleteMessage(roomId, msg.id, mapOf("user_id" to Session.userId))
                        }.onFailure { error = it.message ?: "Failed" }
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
                                        roomId,
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

    // ── Group call: pick who to ring ────────────────────────────────────────
    if (showCallPicker) {
        val picked = remember { mutableStateListOf<String>() }
        AlertDialog(
            onDismissRequest = { showCallPicker = false },
            title = { Text("Start a video call") },
            text = {
                Column(modifier = Modifier.heightIn(max = 320.dp).verticalScroll(rememberScrollState())) {
                    Text("Pick up to $MAX_CALL_TARGETS people.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (otherMembers.isEmpty()) Text("No one else is in this room.")
                    otherMembers.forEach { (id, name) ->
                        val checked = id in picked
                        val selectable = checked || picked.size < MAX_CALL_TARGETS
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = selectable) {
                                    if (checked) picked.remove(id) else picked.add(id)
                                },
                        ) {
                            Checkbox(checked = checked, onCheckedChange = null, enabled = selectable)
                            Text(name)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = picked.isNotEmpty(),
                    onClick = { showCallPicker = false; startCall(picked.toList()) },
                ) { Text("Call") }
            },
            dismissButton = { TextButton(onClick = { showCallPicker = false }) { Text("Cancel") } },
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
    replyParent: Message?,
    onLongPress: () -> Unit,
) {
    // Call events are system messages with empty content — show a one-line notice.
    if (msg.messageType == "video_call") {
        Text(
            msg.previewText(),
            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }
    val type = msg.messageType ?: "text"
    val edited = msg.editedAt != null
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
                if (msg.replyTo != null) Text(
                    "↩ " + (replyParent?.let { "${it.senderName ?: it.senderId}: ${it.previewText()}" } ?: "Reply"),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isOwn) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.7f)
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
                when (type) {
                    // Attachment messages carry the file URL in `content`; show
                    // the original file name when the sender recorded one.
                    "image" -> Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Image, contentDescription = null,
                            tint = if (isOwn) MaterialTheme.colorScheme.onPrimary
                                else MaterialTheme.colorScheme.onSurface)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(msg.fileName ?: msg.content ?: "[image]",
                            color = if (isOwn) MaterialTheme.colorScheme.onPrimary
                                else MaterialTheme.colorScheme.onSurface,
                            maxLines = 2)
                    }
                    "file", "video", "audio" -> Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.InsertDriveFile, contentDescription = null,
                            tint = if (isOwn) MaterialTheme.colorScheme.onPrimary
                                else MaterialTheme.colorScheme.onSurface)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(msg.fileName ?: msg.content ?: "[file]",
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

/** One-line summary used in reply quotes and call notices. */
private fun Message.previewText(): String = when {
    deletedAt != null -> "Deleted message"
    messageType == "video_call" -> callEventLabel()
    messageType == null || messageType == "text" -> content.orEmpty()
    else -> fileName ?: "[$messageType]"
}

/** Label for a `video_call` system message (`metadata.event`) — never the raw key. */
private fun Message.callEventLabel(): String =
    when (((metadata as? JsonObject)?.get("event") as? JsonPrimitive)?.contentOrNull) {
        "call_started" -> "Video call started"
        "call_accepted" -> "Call accepted"
        "call_ended" -> "Video call ended"
        "call_rejected" -> "Call declined"
        "call_missed" -> "Missed call"
        "call_busy" -> "Busy"
        else -> "Video call"
    }

/** Real-time payloads arrive as loose maps; turn them back into JSON to reuse the REST models. */
private fun Any?.toJsonElement(): JsonElement = when (this) {
    null -> JsonNull
    is Map<*, *> -> JsonObject(entries.associate { (k, v) -> k.toString() to v.toJsonElement() })
    is List<*> -> JsonArray(map { it.toJsonElement() })
    is Boolean -> JsonPrimitive(this)
    is Number -> JsonPrimitive(this)
    else -> JsonPrimitive(toString())
}

/**
 * The picked file's real name, with an extension. `Uri.lastPathSegment` is an
 * opaque id for content URIs, and the server derives the stored category — and
 * so the `message_type` — from the file name's extension.
 */
private fun displayNameFor(ctx: Context, uri: Uri, mime: String): String {
    val queried = runCatching {
        ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
    }.getOrNull()
    val base = queried?.takeIf { it.isNotBlank() } ?: "upload-${System.currentTimeMillis()}"
    if (base.substringAfterLast('.', "").isNotEmpty()) return base
    val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime)
    return if (ext.isNullOrEmpty()) base else "$base.$ext"
}

private suspend fun uploadAndSend(
    ctx: Context,
    uri: Uri,
    /** The picker that was used ("image" | "file") — a fallback only. */
    messageType: String,
    roomId: String,
    onSent: (Message) -> Unit,
    onError: (String) -> Unit,
    setSending: (Boolean) -> Unit,
) {
    setSending(true)
    var temp: File? = null
    try {
        val resolver = ctx.contentResolver
        val mime = resolver.getType(uri) ?: "application/octet-stream"
        // Reading the picked content is blocking I/O — keep it off the main thread.
        val name = withContext(Dispatchers.IO) { displayNameFor(ctx, uri, mime) }
        val file = withContext(Dispatchers.IO) {
            File.createTempFile("hb-upload-", null, ctx.cacheDir).also { f ->
                temp = f
                resolver.openInputStream(uri)?.use { input -> f.outputStream().use { input.copyTo(it) } }
                    ?: throw IllegalStateException("Could not read the selected file")
            }
        }
        val confirmed = StorageUpload.uploadFile(
            file = file,
            filename = name,
            mimeType = mime,
            channelId = roomId,
        )
        val url = confirmed["url"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Server did not return a file URL")
        // Send as the type the server derived for this file:
        // "image" | "video" | "audio" | "file" (all accepted by the send endpoint).
        val type = confirmed["message_type"]?.jsonPrimitive?.contentOrNull ?: messageType
        val sent = ApiClient.unitedChat.sendMessage(
            roomId,
            SendMessageRequest(
                senderId = Session.userId,
                senderName = Session.displayName,
                content = url,
                messageType = type,
                metadata = buildJsonObject {
                    put("url", url)
                    put("filename", name)
                    put("mime_type", mime)
                    put("size_bytes", file.length())
                },
            ),
        ).message
        onSent(sent)
    } catch (t: Throwable) {
        onError(t.message ?: "Upload failed")
    } finally {
        runCatching { temp?.delete() }
        setSending(false)
    }
}
