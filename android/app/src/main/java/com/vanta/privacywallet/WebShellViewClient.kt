package com.vanta.privacywallet

import android.content.Context
import android.content.Intent
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.net.toUri
import androidx.webkit.WebViewAssetLoader

open class WebShellViewClient(
    private val context: Context,
    private val scopeHostProvider: () -> String,
) : WebViewClient() {

    /**
     * Serves the web app that was copied into `src/main/assets/www` by
     * `scripts/bundle-android.mjs`, at the synthetic HTTPS origin
     * `https://appassets.androidplatform.net/assets/www/…`.
     *
     * This is what makes the shipped APK self-contained: the default
     * `WEB_SHELL_URL` points here, so the app boots with no network access and no
     * companion server. Requests for any other domain return null from the
     * loader and fall through to the normal network stack, so pointing
     * `WEB_SHELL_URL` at a dev server still works.
     */
    private val assetLoader: WebViewAssetLoader =
        WebViewAssetLoader.Builder()
            .setDomain(ASSET_DOMAIN)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
            .build()

    override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest,
    ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

    override fun shouldOverrideUrlLoading(
        view: WebView,
        request: WebResourceRequest,
    ): Boolean {
        val url = request.url
        val scheme = url.scheme ?: return false

        // Never intercept subframe (iframe) navigation — this breaks
        // embedded SDKs like Privy that use cross-origin iframes.
        if (!request.isForMainFrame) return false

        return when (scheme) {
            "solana-wallet" -> {
                context.startActivity(Intent(Intent.ACTION_VIEW, url))
                // The wallet protocol library uses window.blur to detect that the
                // wallet app opened.  In a WebView the blur event never fires
                // naturally, so we dispatch a synthetic one to unblock the
                // detection promise (3-second timeout in startSession.ts).
                view.evaluateJavascript("window.dispatchEvent(new Event('blur'))", null)
                true
            }

            "intent" -> {
                handleIntentScheme(url.toString())
                true
            }

            "blob", "javascript" -> {
                false
            }

            "http", "https" -> {
                if (url.host == scopeHostProvider.invoke()) {
                    false
                } else {
                    context.startActivity(Intent(Intent.ACTION_VIEW, url))
                    true
                }
            }

            else -> {
                context.startActivity(Intent(Intent.ACTION_VIEW, url))
                true
            }
        }
    }

    companion object {
        /** Must match the domain used in build.gradle.kts and gradle.properties. */
        const val ASSET_DOMAIN = "appassets.androidplatform.net"
    }

    private fun handleIntentScheme(url: String) {
        try {
            val intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
            if (intent.resolveActivity(context.packageManager) != null) {
                context.startActivity(intent)
            } else {
                val fallback = intent.getStringExtra("browser_fallback_url")
                if (fallback != null) {
                    context.startActivity(Intent(Intent.ACTION_VIEW, fallback.toUri()))
                }
            }
        } catch (_: Exception) {
            // No handler available — silently ignore
        }
    }
}
