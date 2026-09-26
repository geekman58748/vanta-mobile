package com.vanta.privacywallet.ui.theme

import androidx.compose.ui.graphics.Color

// Vanta palette. Mirrors src/index.css — one amethyst accent on a near-black,
// faintly violet canvas.
//
// Keep the two files in step: this Compose theme paints the splash, status bar and
// anything around the WebView, so a mismatch shows up as a colour seam at launch.
val VantaCanvas = Color(0xFF0A0910)
val VantaInk = Color(0xFF060509)
val VantaCard = Color(0xFF15131D)
val Amethyst = Color(0xFF8B79F0)
val AmethystDeep = Color(0xFF4C3A9E)
val DeepViolet = Color(0xFF2A2150)
val Rose = Color(0xFFEC6A7A)
val VantaMuted = Color(0xFF8E8E93)

// Black text is what sits on top of the accent (primary CTAs), so this is the
// "ink on amethyst" token rather than pure black.
val OnAmethyst = Color(0xFF0B0A12)
