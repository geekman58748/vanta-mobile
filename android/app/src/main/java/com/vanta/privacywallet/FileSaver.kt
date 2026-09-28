package com.vanta.privacywallet

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import java.io.File
import org.json.JSONObject

/**
 * Writes a base64 payload handed over by the web app into the device's Downloads.
 *
 * Why this exists: the web layer used to hand a `data:` URL to the WebView and
 * rely on a `DownloadListener` — which was never installed in this shell. The
 * navigation went nowhere, no file was written anywhere on the device, and the
 * receipt sheet still toasted "Saved" (AUDIT-2026-09-27 H2). The write now
 * happens here and **returns a result**, so the UI can only claim what happened.
 *
 * No storage permission is needed: on API 29+ the file goes through MediaStore
 * (scoped storage), which is also what makes it visible in the Files app.
 */
object FileSaver {
    private const val TAG = "WebShell"
    // A receipt is ~30 KB. The cap is here because the bridge is reachable from
    // any script in the WebView, and an unbounded base64 payload is a free way
    // to fill the user's storage.
    private const val MAX_BYTES = 20 * 1024 * 1024

    /**
     * @return JSON `{"ok":true,"path":"Downloads/Vanta/x.pdf"}` or
     *         `{"ok":false,"error":"…"}`. Never throws — the caller parses it.
     */
    fun saveBase64(context: Context, fileName: String, mimeType: String, base64Data: String): String {
        val name = sanitizeName(fileName)
        val mime = mimeType.ifBlank { "application/octet-stream" }

        val bytes =
            try {
                // DEFAULT accepts the padded, single-line base64 the web layer sends.
                Base64.decode(base64Data, Base64.DEFAULT)
            } catch (err: IllegalArgumentException) {
                return failure("payload was not valid base64")
            }
        if (bytes.isEmpty()) return failure("payload was empty")
        if (bytes.size > MAX_BYTES) return failure("file is too large (${bytes.size} bytes)")

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            saveViaMediaStore(context, name, mime, bytes)
        } else {
            saveLegacy(context, name, bytes)
        }
    }

    /**
     * File names arrive from JavaScript, so the only characters allowed are ones
     * that cannot express a path. `..` and separators are stripped rather than
     * escaped — a traversal here would write outside the Download folder.
     */
    private fun sanitizeName(raw: String): String {
        val cleaned = raw
            .replace(Regex("[^A-Za-z0-9._-]"), "_")
            .trimStart('.')
            .take(120)
        return cleaned.ifBlank { "vanta-receipt.pdf" }
    }

    private fun saveViaMediaStore(
        context: Context,
        name: String,
        mime: String,
        bytes: ByteArray,
    ): String {
        val relPath = "${Environment.DIRECTORY_DOWNLOADS}/Vanta"
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, relPath)
            // IS_PENDING keeps a half-written file invisible to other apps.
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val resolver = context.contentResolver
        return try {
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: return failure("the system refused a Downloads entry")
            try {
                resolver.openOutputStream(uri).use { out ->
                    if (out == null) throw IllegalStateException("could not open the new file")
                    out.write(bytes)
                    out.flush()
                }
            } catch (err: Exception) {
                resolver.delete(uri, null, null)
                throw err
            }
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            success("$relPath/$name")
        } catch (err: Exception) {
            Log.w(TAG, "MediaStore save failed: ${err.message}", err)
            failure(err.message ?: "the system rejected the write")
        }
    }

    /**
     * API 28 path. The public Downloads folder needs WRITE_EXTERNAL_STORAGE
     * there, which this app does not request — so the fallback is the app's own
     * external files dir, reported honestly as such rather than promised as
     * "Downloads".
     */
    private fun saveLegacy(context: Context, name: String, bytes: ByteArray): String {
        val publicDir = File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            "Vanta",
        )
        try {
            if (!publicDir.exists() && !publicDir.mkdirs()) {
                throw IllegalStateException("could not create ${publicDir.path}")
            }
            File(publicDir, name).writeBytes(bytes)
            return success("Downloads/Vanta/$name")
        } catch (err: Exception) {
            Log.w(TAG, "public Downloads save failed: ${err.message}", err)
        }
        return try {
            val dir = File(
                context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir,
                "Vanta",
            )
            if (!dir.exists() && !dir.mkdirs()) throw IllegalStateException("could not create ${dir.path}")
            File(dir, name).writeBytes(bytes)
            success("app files/${dir.name}/$name")
        } catch (err: Exception) {
            Log.w(TAG, "app-files save failed: ${err.message}", err)
            failure(err.message ?: "no writable location")
        }
    }

    private fun success(path: String): String = JSONObject().put("ok", true).put("path", path).toString()

    private fun failure(reason: String): String = JSONObject().put("ok", false).put("error", reason).toString()
}
