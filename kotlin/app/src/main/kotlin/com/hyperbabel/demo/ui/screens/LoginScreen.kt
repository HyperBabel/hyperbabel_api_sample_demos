/*
 * Login screen — captures the user's identity for this demo session.
 *
 * The HyperBabel Console is the source of truth for production accounts;
 * this screen is a simulator that simply seeds in-memory Session state so
 * the rest of the demo has someone to talk to.
 */
package com.hyperbabel.demo.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.rememberCoroutineScope
import com.hyperbabel.demo.api.ApiClient
import com.hyperbabel.demo.data.Session
import kotlinx.coroutines.launch

private val LANGS = listOf(
    "en" to "English",
    "ko" to "한국어 (Korean)",
    "ja" to "日本語 (Japanese)",
    "zh" to "中文 (Chinese)",
    "es" to "Español (Spanish)",
    "fr" to "Français (French)",
    "de" to "Deutsch (German)",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(onSignedIn: () -> Unit) {
    var userId       by remember { mutableStateOf("") }
    var displayName  by remember { mutableStateOf("") }
    var apiKey       by remember { mutableStateOf(ApiClient.defaultApiKey) }
    var apiUrl       by remember { mutableStateOf(ApiClient.defaultApiUrl) }
    var langCd       by remember { mutableStateOf("en") }
    var langExpanded by remember { mutableStateOf(false) }
    var error        by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Sign in to the demo", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Enter a user identity for this demo session. In production these fields come from your own auth flow.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        OutlinedTextField(
            value = userId, onValueChange = { userId = it },
            label = { Text("User ID") },
            placeholder = { Text("e.g. developer-001") },
            modifier = Modifier.fillMaxSize(),
            singleLine = true,
        )
        OutlinedTextField(
            value = displayName, onValueChange = { displayName = it },
            label = { Text("Display Name") },
            placeholder = { Text("Alice") },
            modifier = Modifier.fillMaxSize(),
            singleLine = true,
        )

        ExposedDropdownMenuBox(expanded = langExpanded, onExpandedChange = { langExpanded = it }) {
            OutlinedTextField(
                value = LANGS.first { it.first == langCd }.second,
                onValueChange = {},
                readOnly = true,
                label = { Text("Preferred Language") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = langExpanded) },
                modifier = Modifier.menuAnchor().fillMaxSize(),
            )
            ExposedDropdownMenu(
                expanded = langExpanded,
                onDismissRequest = { langExpanded = false },
            ) {
                LANGS.forEach { (code, label) ->
                    DropdownMenuItem(
                        text = { Text(label) },
                        onClick = { langCd = code; langExpanded = false },
                    )
                }
            }
        }

        OutlinedTextField(
            value = apiKey, onValueChange = { apiKey = it },
            label = { Text("API Key") },
            placeholder = { Text("hb_live_…") },
            modifier = Modifier.fillMaxSize(),
            singleLine = true,
        )
        OutlinedTextField(
            value = apiUrl, onValueChange = { apiUrl = it },
            label = { Text("API Base URL") },
            placeholder = { Text("https://api.hyperbabel.com/api/v1") },
            modifier = Modifier.fillMaxSize(),
            singleLine = true,
        )

        Text(
            "Use http://10.0.2.2:8787/api/v1 to talk to a local HyperBabel API server " +
                "(wrangler dev) from the Android emulator.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (error.isNotBlank()) {
            Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }

        val scope = rememberCoroutineScope()
        Button(
            onClick = {
                if (userId.isBlank()) { error = "User ID is required."; return@Button }
                if (apiKey.isBlank()) { error = "API Key is required."; return@Button }
                Session.userId          = userId.trim()
                Session.displayName     = displayName.trim().ifBlank { userId.trim() }
                Session.preferredLangCd = langCd
                Session.apiKey          = apiKey.trim()
                Session.apiUrl          = apiUrl.trim().ifBlank { ApiClient.defaultApiUrl }
                // Auto-register a synthetic Android push token. Production
                // apps swap the synthetic token for the real FCM token from
                // FirebaseMessaging.getToken().
                scope.launch {
                    runCatching {
                        ApiClient.push.registerToken(mapOf(
                            "user_id"  to Session.userId,
                            "token"    to "demo-android-${System.currentTimeMillis()}",
                            "platform" to "android",
                        ))
                    }
                }
                onSignedIn()
            },
            modifier = Modifier.fillMaxSize(),
        ) { Text("Sign in →") }
    }
}
