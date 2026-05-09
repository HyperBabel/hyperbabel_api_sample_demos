/*
 * Home screen — list of rooms the signed-in user belongs to, plus a primitive
 * "create room" form so the demo is self-contained.
 */
package com.hyperbabel.demo.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import com.hyperbabel.demo.data.CreateRoomRequest
import com.hyperbabel.demo.data.PresenceHeartbeat
import com.hyperbabel.demo.data.Room
import com.hyperbabel.demo.data.Session
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onOpenRoom: (String) -> Unit,
    onLogout: () -> Unit,
    onOpenStreams: (() -> Unit)? = null,
    onOpenSettings: (() -> Unit)? = null,
) {
    val scope = rememberCoroutineScope()
    val rooms = remember { mutableStateListOf<Room>() }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }

    var newName by remember { mutableStateOf("") }
    var newType by remember { mutableStateOf("group") }
    var typeOpen by remember { mutableStateOf(false) }

    suspend fun loadRooms() {
        loading = true
        error = ""
        try {
            val resp = ApiClient.unitedChat.listRooms(Session.userId)
            rooms.clear()
            rooms.addAll(resp.rooms.ifEmpty { resp.memberRooms })
        } catch (t: Throwable) {
            error = t.message ?: "Failed to load rooms"
        } finally {
            loading = false
        }
    }

    LaunchedEffect(Unit) {
        loadRooms()
        // Background presence heartbeat — fire-and-forget every 30s.
        while (true) {
            try { ApiClient.presence.heartbeat(PresenceHeartbeat(Session.userId)) } catch (_: Throwable) {}
            delay(30_000)
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.fillMaxWidth(0.7f)) {
                Text("Welcome, ${Session.displayName}", style = MaterialTheme.typography.titleLarge)
                Text(
                    "Your rooms — pick one to enter the chat.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            if (onOpenStreams != null) {
                OutlinedButton(onClick = onOpenStreams,
                    modifier = Modifier.padding(end = 4.dp)) { Text("📡") }
            }
            if (onOpenSettings != null) {
                OutlinedButton(onClick = onOpenSettings,
                    modifier = Modifier.padding(end = 4.dp)) { Text("⚙️") }
            }
            OutlinedButton(onClick = onLogout) { Text("Logout") }
        }

        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Create a room", style = MaterialTheme.typography.titleSmall)
                OutlinedTextField(
                    value = newName, onValueChange = { newName = it },
                    label = { Text("Room name") },
                    modifier = Modifier.fillMaxWidth(),
                )
                ExposedDropdownMenuBox(expanded = typeOpen, onExpandedChange = { typeOpen = it }) {
                    OutlinedTextField(
                        value = newType,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Type") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = typeOpen) },
                        modifier = Modifier.menuAnchor().fillMaxWidth(),
                    )
                    ExposedDropdownMenu(
                        expanded = typeOpen,
                        onDismissRequest = { typeOpen = false },
                    ) {
                        listOf("group", "open").forEach { t ->
                            DropdownMenuItem(text = { Text(t) }, onClick = { newType = t; typeOpen = false })
                        }
                    }
                }
                Button(
                    onClick = {
                        if (newName.isBlank()) return@Button
                        scope.launch {
                            try {
                                ApiClient.unitedChat.createRoom(
                                    CreateRoomRequest(
                                        roomType = newType,
                                        creatorId = Session.userId,
                                        roomName = newName.trim(),
                                        members = listOf(Session.userId),
                                    )
                                )
                                newName = ""
                                loadRooms()
                            } catch (t: Throwable) {
                                error = t.message ?: "Failed to create room"
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Create") }
            }
        }

        Text("Your rooms", style = MaterialTheme.typography.titleSmall)

        when {
            loading -> Text("Loading…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            error.isNotBlank() -> Text(error, color = MaterialTheme.colorScheme.error)
            rooms.isEmpty() -> Text(
                "No rooms yet — create one above.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(rooms, key = { it.id }) { room ->
                    Card(
                        modifier = Modifier.fillMaxWidth().clickable { onOpenRoom(room.id) },
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(room.roomName ?: room.id, style = MaterialTheme.typography.titleSmall)
                            Text(
                                "${room.roomType} · ${room.memberCount ?: "—"} members",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}
