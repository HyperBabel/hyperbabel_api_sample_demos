package com.hyperbabel.demo.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Background      = Color(0xFF0F172A)
private val Surface         = Color(0xFF1E293B)
private val SurfaceVariant  = Color(0xFF334155)
private val OnSurface       = Color(0xFFF1F5F9)
private val OnSurfaceMuted  = Color(0xFF94A3B8)
private val Primary         = Color(0xFF14B8A6)
private val OnPrimary       = Color(0xFFFFFFFF)
private val Error           = Color(0xFFEF4444)

private val DemoColorScheme = darkColorScheme(
    background      = Background,
    onBackground    = OnSurface,
    surface         = Surface,
    onSurface       = OnSurface,
    surfaceVariant  = SurfaceVariant,
    onSurfaceVariant = OnSurfaceMuted,
    primary         = Primary,
    onPrimary       = OnPrimary,
    error           = Error,
)

@Composable
fun HyperBabelTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = DemoColorScheme, content = content)
}
