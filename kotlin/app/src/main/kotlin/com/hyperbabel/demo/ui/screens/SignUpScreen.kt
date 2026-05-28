/*
 * Sign-up screen — Customer Auth pattern B1.
 *
 * Creates a brand-new Firebase user with email + password, then
 * exchanges the resulting ID token for a HyperBabel customer JWT. The
 * matching `com_users` row is created server-side during exchange.
 */
package com.hyperbabel.demo.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.hyperbabel.demo.api.FirebaseAuthService
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

private fun isValidEmail(s: String): Boolean =
    Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").containsMatchIn(s)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SignUpScreen(
    onSignedIn: () -> Unit,
    onBack: () -> Unit,
) {
    var email        by remember { mutableStateOf("") }
    var password     by remember { mutableStateOf("") }
    var displayName  by remember { mutableStateOf("") }
    var langCd       by remember { mutableStateOf("en") }
    var langExpanded by remember { mutableStateOf(false) }
    var loading      by remember { mutableStateOf(false) }
    var error        by remember { mutableStateOf("") }

    val firebaseReady = remember { FirebaseAuthService.isFirebaseReady }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Create your account", style = MaterialTheme.typography.headlineSmall)

        if (!firebaseReady) {
            FirebaseMissingBanner()
            TextButton(onClick = onBack) { Text("← Back to sign in") }
            return@Column
        }

        Text(
            "We use Firebase Auth on device, then exchange the ID token for a " +
                "short-lived HyperBabel customer JWT.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        OutlinedTextField(
            value = email, onValueChange = { email = it; error = "" },
            label = { Text("Email") },
            placeholder = { Text("you@example.com") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = password, onValueChange = { password = it; error = "" },
            label = { Text("Password (at least 6 chars)") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = displayName, onValueChange = { displayName = it },
            label = { Text("Display Name (optional)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        ExposedDropdownMenuBox(expanded = langExpanded, onExpandedChange = { langExpanded = it }) {
            OutlinedTextField(
                value = LANGS.first { it.first == langCd }.second,
                onValueChange = {},
                readOnly = true,
                label = { Text("Preferred Language") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = langExpanded) },
                modifier = Modifier.menuAnchor().fillMaxWidth(),
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

        if (error.isNotBlank()) {
            Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }

        Button(
            onClick = {
                val em = email.trim()
                if (!isValidEmail(em)) {
                    error = "Please enter a valid email address."
                    return@Button
                }
                if (password.length < 6) {
                    error = "Password must be at least 6 characters (Firebase minimum)."
                    return@Button
                }
                loading = true
                error = ""
                scope.launch {
                    runCatching {
                        FirebaseAuthService.signUpWithEmail(
                            email = em,
                            password = password,
                            preferredLangCd = langCd,
                        )
                    }.onSuccess { result ->
                        Session.persist(result, fallbackDisplayName = displayName, langCode = langCd)
                        onSignedIn()
                    }.onFailure { error = it.message ?: "Sign-up failed." }
                    loading = false
                }
            },
            enabled = !loading,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (loading) "Creating account…" else "Create account") }

        TextButton(onClick = onBack) { Text("Already have an account? Sign in") }
    }
}

@Composable
private fun FirebaseMissingBanner() {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0x1AF59E0B)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                "Firebase config missing",
                style = MaterialTheme.typography.titleSmall,
                color = Color(0xFFFCD34D),
            )
            Text(
                "Drop google-services.json into the firebase/ folder and rebuild. " +
                    "See firebase/README.md and README → Quickstart for the full setup path.",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFFFDE68A),
            )
        }
    }
}
