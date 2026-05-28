/*
 * Login screen — Customer Auth pattern B1 (Firebase Direct Exchange).
 *
 *   1. The user signs in with Firebase Auth (Email/Password by default;
 *      a one-tap "Anonymous" button is exposed for kiosk-style use).
 *   2. We exchange the resulting Firebase ID token for a HyperBabel
 *      customer JWT via POST /customer/auth/firebase-exchange.
 *   3. Session.persist(...) writes the JWT pair to
 *      EncryptedSharedPreferences via SecureStore. ApiClient attaches
 *      it to every subsequent request.
 *
 * If Firebase isn't initialised (no google-services.json) the screen
 * renders a setup-help banner instead of the form.
 */
package com.hyperbabel.demo.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.foundation.text.KeyboardOptions
import com.hyperbabel.demo.api.ApiClient
import com.hyperbabel.demo.api.FirebaseAuthService
import com.hyperbabel.demo.api.FirebaseExchangeResult
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
fun LoginScreen(
    onSignedIn: () -> Unit,
    onOpenSignUp: () -> Unit,
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

    fun finishSignIn(result: FirebaseExchangeResult) {
        Session.persist(result, fallbackDisplayName = displayName, langCode = langCd)
        // Best-effort push token registration. Failures don't block sign-in.
        scope.launch {
            runCatching {
                ApiClient.push.registerToken(mapOf(
                    "user_id"  to result.external_user_id,
                    "token"    to "demo-android-${System.currentTimeMillis()}",
                    "platform" to "android",
                ))
            }
        }
        onSignedIn()
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Sign in to the demo", style = MaterialTheme.typography.headlineSmall)

        if (!firebaseReady) {
            FirebaseMissingBanner()
            return@Column
        }

        Text(
            "Sign in with Firebase. We exchange the ID token for a short-lived " +
                "HyperBabel customer JWT — your org API key never ships in this app.",
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
            label = { Text("Password") },
            placeholder = { Text("••••••••") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = displayName, onValueChange = { displayName = it },
            label = { Text("Display Name (optional)") },
            placeholder = { Text("Alice") },
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
                if (email.isBlank() || password.isBlank()) {
                    error = "Please enter your email and password."
                    return@Button
                }
                loading = true
                error = ""
                scope.launch {
                    runCatching {
                        FirebaseAuthService.signInWithEmail(
                            email = email.trim(),
                            password = password,
                            preferredLangCd = langCd,
                        )
                    }.onSuccess { finishSignIn(it) }
                     .onFailure { error = it.message ?: "Sign-in failed." }
                    loading = false
                }
            },
            enabled = !loading,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (loading) "Signing in…" else "Sign in →") }

        OutlinedButton(
            onClick = {
                loading = true
                error = ""
                scope.launch {
                    runCatching {
                        FirebaseAuthService.signInAnonymously(preferredLangCd = langCd)
                    }.onSuccess { finishSignIn(it) }
                     .onFailure { error = it.message ?: "Anonymous sign-in failed." }
                    loading = false
                }
            },
            enabled = !loading,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Continue anonymously (kiosk mode)") }

        Spacer(Modifier.height(8.dp))
        TextButton(
            onClick = onOpenSignUp,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("New here? Create an account") }
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
                    "See firebase/README.md and README → Quickstart for the full setup path, " +
                    "including how to allow-list your Firebase project in HyperBabel Console " +
                    "→ Customer Auth.",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFFFDE68A),
            )
        }
    }
}
