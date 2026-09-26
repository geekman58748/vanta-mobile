package com.vanta.privacywallet.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Vanta is a dark-only product. Two deliberate choices live in this file:
//
//  1. `dynamicColor` is GONE. The webshell template defaulted it to true, and (with
//     androidx.compose.material3.dynamicDarkColorScheme) that pulls the scheme from
//     the user's WALLPAPER. On a judge's phone the app's chrome took on their colours
//     — brand chaos, and it made the app look like a stock Android demo.
//  2. There is no light color scheme at all. A light branch means a white flash
//     around the WebView on launch, and this app is never light.
private val VantaColorScheme = darkColorScheme(
    primary = Amethyst,
    onPrimary = OnAmethyst,
    secondary = AmethystDeep,
    onSecondary = Color.White,
    tertiary = Rose,
    background = VantaCanvas,
    onBackground = Color.White,
    surface = VantaCard,
    onSurface = Color.White,
    surfaceVariant = DeepViolet,
    onSurfaceVariant = VantaMuted,
    error = Rose,
    onError = OnAmethyst,
)

@Composable
fun WebShellTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = VantaColorScheme,
        typography = Typography,
        content = content,
    )
}
