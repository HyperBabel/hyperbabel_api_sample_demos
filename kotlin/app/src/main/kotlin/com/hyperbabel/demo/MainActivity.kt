/*
 * App entry point and Compose nav graph.
 *
 * Routes:
 *   login           — sign in (Firebase Email/Password + Anonymous)
 *   signup          — sign up (Firebase createUserWithEmailAndPassword)
 *   home            — room list
 *   chat/{roomId}   — chat in a room (text + real-time push)
 *   video/{roomId}  — 1:1 / group video call
 *   stream          — live stream list / host / viewer (needs your backend)
 *   settings        — usage / push tokens / logout
 *   blocks          — global block list
 *
 * Incoming calls: while someone is signed in, the app keeps the real-time
 * client connected and listens on the user's PRIVATE channel. A `signal`
 * event whose `data.type` is `CALL_INVITE` paints the IncomingCallOverlay on
 * top of whatever the user is doing; Accept / Reject call the matching
 * endpoint with the invite's `sessionId` (required).
 */
package com.hyperbabel.demo

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.hyperbabel.demo.api.ApiClient
import com.hyperbabel.demo.data.SecureStore
import com.hyperbabel.demo.data.Session
import com.hyperbabel.demo.realtime.HyperBabelRealtime
import com.hyperbabel.demo.ui.components.IncomingCallBus
import com.hyperbabel.demo.ui.components.IncomingCallOverlay
import com.hyperbabel.demo.ui.screens.BlocksScreen
import com.hyperbabel.demo.ui.screens.ChatScreen
import com.hyperbabel.demo.ui.screens.HomeScreen
import com.hyperbabel.demo.ui.screens.LoginScreen
import com.hyperbabel.demo.ui.screens.SettingsScreen
import com.hyperbabel.demo.ui.screens.SignUpScreen
import com.hyperbabel.demo.ui.screens.StreamScreen
import com.hyperbabel.demo.ui.screens.VideoCallScreen
import com.hyperbabel.demo.ui.theme.HyperBabelTheme
import kotlinx.coroutines.launch

/**
 * CALL_INVITE fields the app uses. `roomSignalChannel` is the call's room
 * channel — the overlay listens there for `call_ended` while ringing.
 */
private val INVITE_FIELDS = listOf(
    "roomId", "sessionId", "callerId", "callerName", "callType", "roomSignalChannel",
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Initialise both stores before any composable / ApiClient call
        // touches them. SecureStore lazily builds the Android Keystore
        // master key; Session lazily opens the plain identity prefs file.
        SecureStore.init(applicationContext)
        Session.init(applicationContext)

        setContent {
            HyperBabelTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AppNavigation()
                }
            }
        }
    }
}

@Composable
private fun AppNavigation() {
    val nav = rememberNavController()
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val start = if (Session.isSignedIn) "home" else "login"

    // Keep the real-time client up while someone is signed in. Re-checked on
    // every navigation, which covers both app start and a fresh sign-in.
    val backStackEntry by nav.currentBackStackEntryAsState()
    LaunchedEffect(backStackEntry?.destination?.route) {
        if (Session.isSignedIn) HyperBabelRealtime.connect()
    }

    // Incoming calls arrive on the user's private channel as event `signal`
    // with `data.type == "CALL_INVITE"`. Subscribe once the client exists.
    val realtimeReady by HyperBabelRealtime.ready.collectAsState()
    DisposableEffect(realtimeReady) {
        if (!realtimeReady) return@DisposableEffect onDispose { }
        val unsub = HyperBabelRealtime.subscribeUserChannel { name, raw ->
            val data = raw as? Map<*, *> ?: return@subscribeUserChannel
            if (name != "signal" || data["type"]?.toString() != "CALL_INVITE") return@subscribeUserChannel
            // Keep the fields the overlay and the accept / reject calls use.
            val invite = INVITE_FIELDS
                .mapNotNull { key -> data[key]?.let { key to it.toString() } }
                .toMap()
            scope.launch { IncomingCallBus.show(invite) }
        }
        onDispose { unsub() }
    }

    // Sign-out also drops the real-time connection: the private channel and
    // token belong to the user who is leaving.
    val signOut: () -> Unit = {
        IncomingCallBus.clear()
        HyperBabelRealtime.disconnect()
        Session.signOut()
    }

    Box(modifier = Modifier.fillMaxSize()) {
        NavHost(navController = nav, startDestination = start) {
            composable("login") {
                LoginScreen(
                    onSignedIn = { nav.navigate("home") { popUpTo("login") { inclusive = true } } },
                    onOpenSignUp = { nav.navigate("signup") },
                )
            }
            composable("signup") {
                SignUpScreen(
                    onSignedIn = {
                        nav.navigate("home") {
                            popUpTo("login") { inclusive = true }
                        }
                    },
                    onBack = { nav.popBackStack() },
                )
            }
            composable("home") {
                HomeScreen(
                    onOpenRoom = { roomId -> nav.navigate("chat/$roomId") },
                    onLogout = {
                        signOut()
                        nav.navigate("login") { popUpTo("home") { inclusive = true } }
                    },
                    onOpenStreams  = { nav.navigate("stream") },
                    onOpenSettings = { nav.navigate("settings") },
                )
            }
            composable(
                route = "chat/{roomId}",
                arguments = listOf(navArgument("roomId") { type = NavType.StringType }),
            ) { entry ->
                val roomId = entry.arguments?.getString("roomId") ?: return@composable
                ChatScreen(
                    roomId = roomId,
                    onBack = { nav.popBackStack() },
                    onStartCall = { nav.navigate("video/$roomId") },
                )
            }
            composable(
                route = "video/{roomId}",
                arguments = listOf(navArgument("roomId") { type = NavType.StringType }),
            ) { entry ->
                val roomId = entry.arguments?.getString("roomId") ?: return@composable
                VideoCallScreen(roomId = roomId, onHangup = { nav.popBackStack() })
            }
            composable("stream") {
                StreamScreen(onBack = { nav.popBackStack() })
            }
            composable("settings") {
                SettingsScreen(
                    onBack = { nav.popBackStack() },
                    onOpenBlocks = { nav.navigate("blocks") },
                    onLogout = {
                        signOut()
                        nav.navigate("login") { popUpTo("home") { inclusive = true } }
                    },
                )
            }
            composable("blocks") {
                BlocksScreen(onBack = { nav.popBackStack() })
            }
        }

        // Global incoming-call overlay sits above the NavHost so it wins
        // the hit test no matter which screen is foregrounded.
        IncomingCallOverlay(
            onAccept = { invite ->
                val roomId = invite["roomId"].orEmpty()
                val sessionId = invite["sessionId"].orEmpty()
                scope.launch {
                    try {
                        if (roomId.isEmpty() || sessionId.isEmpty()) error("Incomplete call invite")
                        // Accept first — both `user_id` and `session_id` are required.
                        // A 410 means the caller hung up before you answered.
                        ApiClient.unitedChat.acceptVideoCall(
                            roomId,
                            mapOf("user_id" to Session.userId, "session_id" to sessionId),
                        )
                        nav.navigate("video/$roomId")
                    } catch (t: Throwable) {
                        Toast.makeText(ctx, "Could not join the call: ${t.message}", Toast.LENGTH_SHORT).show()
                    }
                }
            },
            onReject = { invite, reason ->
                val roomId = invite["roomId"].orEmpty()
                val sessionId = invite["sessionId"].orEmpty()
                if (roomId.isNotEmpty() && sessionId.isNotEmpty()) {
                    scope.launch {
                        // Fire-and-forget: the server posts call_rejected (or
                        // call_missed for reason "missed") to the room, which
                        // tells a 1:1 caller to stop ringing.
                        val body = mutableMapOf("user_id" to Session.userId, "session_id" to sessionId)
                        if (reason != null) body["reason"] = reason
                        runCatching { ApiClient.unitedChat.rejectVideoCall(roomId, body) }
                    }
                }
            },
        )
    }
}
