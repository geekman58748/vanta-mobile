package com.vanta.privacywallet

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * OS notifications for money that moves while the app is not on screen.
 *
 * WHY THIS EXISTS
 * ---------------
 * A Shield is submitted, the user switches apps, and the deposit confirms a
 * minute later. Nothing in a WebView can tell them: the page's JavaScript is
 * suspended in the background, so by the time it notices the balance rose they
 * are already looking at the screen again. A notification is the only way the
 * completion leaves the app, and it is a capability a browser page does not have
 * at all — this is the native layer, not a `Notification` polyfill.
 *
 * The channel is created once, at startup, so the setting a user changes in
 * Android Settings has something to point at. Nothing here is user-configurable
 * inside the app, by design: the OS settings screen owns that.
 */
object Notifications {
    const val CHANNEL_ID = "vanta_activity"
    private const val CHANNEL_NAME = "Wallet activity"
    private const val CHANNEL_DESCRIPTION =
        "Deposits into your private balance and completed operations"

    /** Idempotent. Safe to call on every launch; Android keeps the first channel. */
    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel =
            NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = CHANNEL_DESCRIPTION
                setShowBadge(true)
            }
        manager.createNotificationChannel(channel)
    }

    /**
     * Below API 33 posting was always allowed; from 33 it is a runtime grant.
     * This is the same question the OS asks, so callers do not have to care
     * which release they are on.
     */
    fun hasPermission(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * Post one notification, replacing any previous one with the same [id].
     *
     * @return `{"ok":true}` when it reached the notification shade, or
     *         `{"ok":false,"reason":...}` when the OS refused — the web layer is
     *         allowed to know the difference and must not claim a notification
     *         that was never shown.
     */
    fun post(
        context: Context,
        id: String,
        title: String,
        body: String,
    ): String {
        val tag = id.ifBlank { "vanta-${System.currentTimeMillis()}" }
        if (!hasPermission(context)) return """{"ok":false,"reason":"permission"}"""
        ensureChannel(context)

        // Tapping the notification lands back in the one Activity. CLEAR_TOP so
        // an already-running app is resumed instead of a second copy being built.
        val open =
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
        val pending =
            PendingIntent.getActivity(
                context,
                tag.hashCode(),
                open,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        val notification =
            NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_vanta)
                .setContentTitle(title.ifBlank { "Vanta" })
                .setContentText(body)
                // Amounts and addresses are the payload here; never let the shade
                // clip the half of the sentence that says which is which.
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(pending)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .build()

        return try {
            NotificationManagerCompat.from(context).notify(tag, 1, notification)
            """{"ok":true}"""
        } catch (err: SecurityException) {
            // The grant can be revoked between the check above and here.
            """{"ok":false,"reason":"permission"}"""
        }
    }

    /** Used when the event is superseded (e.g. a replaced Shield) so the shade stays honest. */
    fun clear(
        context: Context,
        id: String,
    ) {
        NotificationManagerCompat.from(context).cancel(id, 1)
    }
}
