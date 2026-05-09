/*
 * Block management — lists every user the signed-in account has globally
 * blocked, with a search field + paginated rows. Mirrors the React /
 * React Native / Flutter equivalent.
 */
package com.hyperbabel.demo.ui.screens

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
import com.hyperbabel.demo.data.Session
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

private const val PAGE_SIZE = 10

@Composable
fun BlocksScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val rows = remember { mutableStateListOf<JsonObject>() }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }
    var page by remember { mutableStateOf(0) }

    suspend fun load() {
        loading = true
        error = ""
        try {
            val resp = ApiClient.users.getBlockList(Session.userId)
            val list: JsonArray = resp["blocked_users"]?.jsonArray ?: JsonArray(emptyList())
            rows.clear()
            list.forEach { rows.add(it.jsonObject) }
        } catch (t: Throwable) {
            error = t.message ?: "Failed to load"
        } finally { loading = false }
    }

    LaunchedEffect(Unit) { load() }

    val filtered = if (query.isBlank()) rows.toList()
        else rows.filter {
            (it["blocked_id"]?.jsonPrimitive?.content ?: "").contains(query, ignoreCase = true)
        }
    val totalPages = (filtered.size + PAGE_SIZE - 1).coerceAtLeast(1) / PAGE_SIZE
    val pageSafe = page.coerceIn(0, (totalPages - 1).coerceAtLeast(0))
    val slice = filtered.drop(pageSafe * PAGE_SIZE).take(PAGE_SIZE)

    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = onBack) { Text("← Back") }
            Text("Blocked Users", style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(start = 12.dp))
        }
        OutlinedTextField(
            value = query,
            onValueChange = { query = it; page = 0 },
            label = { Text("Search by user ID…") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        Text("⚠️ Blocks apply to every room, not just one.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall)

        when {
            loading -> Text("Loading…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            error.isNotBlank() -> Text(error, color = MaterialTheme.colorScheme.error)
            filtered.isEmpty() -> Text(
                if (query.isBlank()) "You haven’t blocked anyone yet." else "No matches.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            else -> LazyColumn(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(slice, key = { it["blocked_id"]?.jsonPrimitive?.content ?: "" }) { row ->
                    val blockedId = row["blocked_id"]?.jsonPrimitive?.content ?: ""
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                        Row(
                            modifier = Modifier.padding(12.dp).fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.fillMaxWidth(0.7f)) {
                                Text(blockedId, style = MaterialTheme.typography.titleSmall)
                                Text(
                                    "Blocked at: ${row["created_at"]?.jsonPrimitive?.content ?: "—"}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Button(onClick = {
                                scope.launch {
                                    try {
                                        ApiClient.users.unblockUser(mapOf(
                                            "blocker_id" to Session.userId,
                                            "blocked_id" to blockedId,
                                        ))
                                        rows.removeIf { it["blocked_id"]?.jsonPrimitive?.content == blockedId }
                                    } catch (t: Throwable) { error = t.message ?: "Failed" }
                                }
                            }) { Text("Unblock") }
                        }
                    }
                }
            }
        }

        if (totalPages > 1) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = { page = (page - 1).coerceAtLeast(0) }, enabled = pageSafe > 0) { Text("← Prev") }
                Text("${pageSafe + 1} / $totalPages")
                OutlinedButton(onClick = { page = (page + 1).coerceAtMost(totalPages - 1) },
                    enabled = pageSafe < totalPages - 1) { Text("Next →") }
            }
        }
    }
}
