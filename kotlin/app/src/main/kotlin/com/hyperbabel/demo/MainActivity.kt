/*
 * App entry point and Compose nav graph.
 *
 * Routes:
 *   login           — sign in
 *   home            — room list
 *   chat/{roomId}   — chat in a room (text + real-time push)
 *   video/{roomId}  — 1:1 video call
 *   stream          — live stream list / host / viewer
 *   settings        — usage / push tokens / language detect / logout
 *   blocks          — global block list
 *
 * The IncomingCallOverlay wraps every routed screen so a CALL_INVITE event
 * can paint an Accept / Reject prompt on top of whatever the user is doing.
 */
package com.hyperbabel.demo

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.hyperbabel.demo.data.Session
import com.hyperbabel.demo.ui.components.IncomingCallOverlay
import com.hyperbabel.demo.ui.screens.BlocksScreen
import com.hyperbabel.demo.ui.screens.ChatScreen
import com.hyperbabel.demo.ui.screens.HomeScreen
import com.hyperbabel.demo.ui.screens.LoginScreen
import com.hyperbabel.demo.ui.screens.SettingsScreen
import com.hyperbabel.demo.ui.screens.StreamScreen
import com.hyperbabel.demo.ui.screens.VideoCallScreen
import com.hyperbabel.demo.ui.theme.HyperBabelTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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
    val start = if (Session.isSignedIn) "home" else "login"

    Box(modifier = Modifier.fillMaxSize()) {
        NavHost(navController = nav, startDestination = start) {
            composable("login") {
                LoginScreen(onSignedIn = { nav.navigate("home") { popUpTo("login") { inclusive = true } } })
            }
            composable("home") {
                HomeScreen(
                    onOpenRoom = { roomId -> nav.navigate("chat/$roomId") },
                    onLogout = {
                        Session.userId = ""
                        Session.displayName = ""
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
                        Session.userId = ""
                        Session.displayName = ""
                        nav.navigate("login") { popUpTo("home") { inclusive = true } }
                    },
                )
            }
            composable("blocks") {
                BlocksScreen(onBack = { nav.popBackStack() })
            }
        }

        // Global incoming-call overlay sits above the NavHost so it wins the
        // hit test no matter which screen is foregrounded.
        IncomingCallOverlay(
            onAccept = { roomId -> if (roomId.isNotEmpty()) nav.navigate("video/$roomId") },
            onReject = { /* fire-and-forget — see IncomingCallOverlay docs */ },
        )
    }
}
