package com.vanta.privacywallet

import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View

/**
 * Real OS haptics, not a WebView motor buzz.
 *
 * `navigator.vibrate` inside a WebView is a raw vibration: it ignores the user's
 * system "haptics" setting, gets no tuned waveform, and on most devices is a
 * single flat buzz that is indistinguishable between a tap and a success.
 * `View.performHapticFeedback` routes through the platform haptic engine, so it
 * respects the setting and picks up the OEM-tuned effects. It needs no
 * permission, which is why this can be unconditional.
 *
 * The kind is a word from the web layer; the mapping to a platform constant is
 * the only place that knows about API levels. CONFIRM and REJECT arrived in
 * API 30, so both fall back to LONG_PRESS below that.
 */
object Haptics {
    fun constantFor(kind: String): Int =
        when (kind.lowercase()) {
            "success", "confirm" ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    HapticFeedbackConstants.CONFIRM
                } else {
                    HapticFeedbackConstants.LONG_PRESS
                }
            "error", "reject", "fail" ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    HapticFeedbackConstants.REJECT
                } else {
                    HapticFeedbackConstants.LONG_PRESS
                }
            "pop", "long" -> HapticFeedbackConstants.LONG_PRESS
            "tick", "light" -> HapticFeedbackConstants.CLOCK_TICK
            "context" -> HapticFeedbackConstants.CONTEXT_CLICK
            else -> HapticFeedbackConstants.VIRTUAL_KEY
        }

    fun play(
        view: View,
        kind: String,
    ) {
        view.performHapticFeedback(constantFor(kind))
    }
}
