/*
 * Settings — profile, blocked users, push tokens and logout.
 * Webhooks are explicitly excluded; manage those in the HyperBabel Console.
 *
 * Organization usage and plan data are not shown: they are business data
 * for your backend, read with the organization API key, and are not
 * available to end-user apps.
 *
 * There is no language-detection / text-translation playground: the
 * standalone Translation endpoints (`/translate/…`) accept only your
 * organization API key, so they belong on your backend, never in an app.
 */
package com.hyperbabel.demo.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.hyperbabel.demo.api.ApiClient
import com.hyperbabel.demo.data.Session
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onOpenBlocks: () -> Unit,
    onLogout: () -> Unit,
) {
    var tokens by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        loading = true
        runCatching {
            val resp = ApiClient.push.getTokens(Session.userId)
            val list: JsonArray = resp["tokens"]?.jsonArray ?: JsonArray(emptyList())
            tokens = list.map { it.jsonObject }
        }
        loading = false
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = onBack) { Text("← Back") }
            Text("Settings", style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(start = 12.dp))
        }

        Section("Profile")
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("User ID", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(Session.userId, style = MaterialTheme.typography.titleSmall)
                }
                Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("API Base URL", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(Session.apiUrl, style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        Section("Privacy")
        OutlinedButton(onClick = onOpenBlocks, modifier = Modifier.fillMaxWidth()) {
            Text("🚫  Blocked Users  →")
        }

        Section("Push Tokens")
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Column(modifier = Modifier.padding(16.dp)) {
                if (loading) Text("Loading…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                else if (tokens.isEmpty()) Text(
                    "No push tokens registered for this user yet.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                else tokens.forEach { row ->
                    val token = row["token"]?.jsonPrimitive?.content ?: ""
                    val platform = row["platform"]?.jsonPrimitive?.content ?: "?"
                    val short = if (token.length > 24) "${token.take(16)}…${token.takeLast(4)}" else token
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Text(platform.uppercase(),
                            modifier = Modifier.padding(end = 8.dp),
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.labelSmall)
                        Text(short, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
                    }
                }
            }
        }

        Button(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        ) { Text("Logout") }
    }
}

@Composable
private fun Section(label: String) {
    Text(
        label.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 16.dp),
    )
}
