package com.vanta.privacywallet

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.os.Bundle
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.net.toUri
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.vanta.privacywallet.ui.theme.WebShellTheme
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    /**
     * POST_NOTIFICATIONS is a runtime grant from API 33 on. The launcher has to
     * be registered before the Activity reaches STARTED, so it lives here; the
     * web layer only chooses WHEN to ask.
     */
    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        // The channel must exist before the first post. Creating it at launch
        // means the OS notification setting has a target from day one.
        Notifications.ensureChannel(this)
        // Screenshots, screen recording and the Recents thumbnail go black for the
        // whole window. ON in release, OFF in debug, and overridable per build
        // (see app/build.gradle.kts) so the demo video is not a black rectangle.
        // This is the only place the decision is made: no user-facing switch.
        if (BuildConfig.FLAG_SECURE) {
            window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE,
            )
        }
        enableEdgeToEdge()
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        setContent {
            WebShellTheme {
                WebShellScreen()
            }
        }
    }

    override fun onStart() {
        super.onStart()
        isVisible = true
    }

    override fun onStop() {
        super.onStop()
        isVisible = false
    }

    /**
     * Ask for the notification grant, once. Called from the web layer at the
     * moment a notification would actually be useful — a permission dialog on
     * a cold start, before the user has done anything, reads as a dark pattern
     * in a wallet.
     */
    fun requestNotificationPermission() {
        if (Notifications.hasPermission(this)) return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        runCatching {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    companion object {
        /**
         * True while an Activity of this app is on screen. A notification for
         * something the user is already watching is noise, so the bridge
         * suppresses it instead of duplicating the in-app toast.
         */
        @Volatile
        var isVisible: Boolean = false
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebShellScreen() {
    val context = LocalContext.current
    val startUrl = remember { normalizeHttpUrl() ?: BuildConfig.WEB_SHELL_URL }
    val scopeHost = remember(startUrl) { startUrl.toUri().host.orEmpty() }
    val refreshIndicatorColor = MaterialTheme.colorScheme.primary.toArgb()
    val refreshIndicatorBackgroundColor = MaterialTheme.colorScheme.surface.toArgb()

    // Pull-to-refresh is a native SwipeRefreshLayout wrapping the WebView. It is
    // correct on the dashboard, but while a sheet is open the WebView itself
    // cannot scroll up, so every downward drag inside a sheet is stolen by the
    // refresh gesture and reloads the whole app. The web app therefore tells the
    // shell to stand down (`window.VantaShell.setPullToRefreshEnabled`) whenever
    // a Drawer mounts, and to stand back up when it closes.
    var pullToRefreshEnabled by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var hasError by remember { mutableStateOf(false) }
    var showSplash by remember { mutableStateOf(true) }

    val webView =
        remember {
            WebView(context).apply {
                layoutParams =
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.databaseEnabled = true
                settings.loadWithOverviewMode = false
                settings.useWideViewPort = false
                // Never allow a page loaded over https to pull http subresources.
                // http://localhost is a-priori authenticated, so the local relayer stays reachable.
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                // Pinch-zoom and edge-glow are the two loudest "this is just a web page" tells.
                settings.builtInZoomControls = false
                settings.displayZoomControls = false
                settings.setSupportZoom(false)
                overScrollMode = android.view.View.OVER_SCROLL_NEVER
                settings.javaScriptCanOpenWindowsAutomatically = true
                settings.setSupportMultipleWindows(true)
                settings.offscreenPreRaster = true

                val originalUa = settings.userAgentString
                settings.userAgentString =
                    appendUserAgentMarker(
                        baseUserAgent = originalUa,
                    )

                if (BuildConfig.DEBUG) {
                    Log.i(TAG, "UA original: $originalUa")
                    Log.i(TAG, "UA verify:   ${settings.userAgentString}")
                }

                CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

                // Marshal to the UI thread: the bridge call arrives on a WebView
                // background thread, but `pullToRefreshEnabled` is Compose state.
                val mainHandler = Handler(Looper.getMainLooper())
                val appContext = context.applicationContext
                // Inside this `apply` block `this` IS the WebView. The bridge has to
                // be able to call back INTO it — the biometric result arrives long
                // after the call that started it has already returned — so the
                // reference is captured here instead of reached for from inside.
                val shellWebView: WebView = this
                addJavascriptInterface(
                    VantaShellBridge(
                        appContext = appContext,
                        activityContext = context,
                        onPullToRefreshChanged = { enabled ->
                            mainHandler.post { pullToRefreshEnabled = enabled }
                        },
                        onBiometricResult = { payload ->
                            mainHandler.post {
                                shellWebView.evaluateJavascript(
                                    "window.__vantaBiometricResult && " +
                                        "window.__vantaBiometricResult($payload);",
                                    null,
                                )
                            }
                        },
                        // Haptics are a View call, and the View is the WebView.
                        // Hopping to the UI thread keeps the bounce off the
                        // bridge thread that the JS call arrived on.
                        onHaptic = { constant ->
                            mainHandler.post { shellWebView.performHapticFeedback(constant) }
                        },
                    ),
                    "VantaShell",
                )

                webChromeClient =
                    WebShellChromeClient(
                        // No top progress bar. A full-width bar sweeping in on
                        // every load is the single loudest "this is a web page"
                        // tell in a wallet. The splash already covers the one
                        // load that genuinely needs covering.
                        onProgressChanged = { newProgress ->
                            if (newProgress > 0) showSplash = false
                        },
                        isDebug = BuildConfig.DEBUG,
                    )

                webViewClient =
                    object : WebShellViewClient(context, scopeHostProvider = { scopeHost }) {
                        override fun onPageFinished(
                            view: WebView,
                            url: String?,
                        ) {
                            super.onPageFinished(view, url)
                            hasError = false
                            isRefreshing = false
                            probeViewportAndMaybePatch(view, BuildConfig.DEBUG)
                        }

                        override fun onReceivedError(
                            view: WebView?,
                            request: WebResourceRequest?,
                            error: WebResourceError?,
                        ) {
                            super.onReceivedError(view, request, error)
                            if (request?.isForMainFrame == true) {
                                hasError = true
                                isRefreshing = false
                            }
                        }
                    }

                loadUrl(startUrl)
            }
        }
    val swipeRefreshLayout =
        remember(webView, refreshIndicatorColor, refreshIndicatorBackgroundColor) {
            SwipeRefreshLayout(context).apply {
                layoutParams =
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                setColorSchemeColors(
                    refreshIndicatorColor,
                )
                setProgressBackgroundColorSchemeColor(refreshIndicatorBackgroundColor)
                setOnChildScrollUpCallback { _, _ ->
                    !pullToRefreshEnabled || webView.canScrollVertically(-1)
                }
                setOnRefreshListener {
                    hasError = false
                    isRefreshing = true
                    webView.reload()
                }
                addView(webView)
            }
        }

    DisposableEffect(Unit) {
        onDispose {
            swipeRefreshLayout.removeView(webView)
            webView.destroy()
        }
    }

    BackHandler(enabled = webView.canGoBack()) {
        webView.goBack()
    }

    WebViewLayer(
        modifier =
            Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .windowInsetsPadding(WindowInsets.systemBars),
        swipeRefreshLayout = swipeRefreshLayout,
        pullToRefreshEnabled = pullToRefreshEnabled,
        isRefreshing = isRefreshing,
        hasError = hasError,
        showSplash = showSplash,
        onRetry = {
            hasError = false
            isRefreshing = false
            webView.reload()
        },
    )
}

@Composable
private fun WebViewLayer(
    modifier: Modifier,
    swipeRefreshLayout: SwipeRefreshLayout,
    pullToRefreshEnabled: Boolean,
    isRefreshing: Boolean,
    hasError: Boolean,
    showSplash: Boolean,
    onRetry: () -> Unit,
) {
    Box(modifier = modifier) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { swipeRefreshLayout },
            update = { view ->
                view.layoutParams =
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                view.isEnabled = pullToRefreshEnabled && !hasError
                view.isRefreshing = isRefreshing
            },
        )

        if (hasError) {
            Box(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.background.copy(alpha = 0.96f)),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "Unable to load page",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(onClick = onRetry) {
                        Text("Retry")
                    }
                }
            }
        }

        AnimatedVisibility(
            visible = showSplash,
            exit = fadeOut(),
        ) {
            Box(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.background),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        }
    }
}

private fun probeViewportAndMaybePatch(
    webView: WebView,
    isDebug: Boolean,
) {
    webView.evaluateJavascript(VIEWPORT_PROBE_AND_PATCH_SCRIPT) { rawResult ->
        val decoded = decodeJavascriptStringResult(rawResult)
        val parsed = runCatching { JSONObject(decoded) }.getOrNull()
        val isBroken = parsed?.optBoolean("broken") == true
        if (isDebug || isBroken) {
            Log.i(TAG, "[VP] ${parsed?.toString() ?: decoded}")
        }
    }
}

private fun decodeJavascriptStringResult(rawResult: String?): String {
    if (rawResult.isNullOrBlank() || rawResult == "null") return ""
    return runCatching { JSONObject("{\"value\":$rawResult}").getString("value") }
        .getOrDefault(rawResult)
}

private fun appendUserAgentMarker(baseUserAgent: String): String {
    val marker = "Solana Mobile Web Shell"
    if (marker.isEmpty()) return baseUserAgent.trim()
    return if (baseUserAgent.contains(marker)) {
        baseUserAgent.trim()
    } else {
        "${baseUserAgent.trim()} $marker".trim()
    }
}

private fun normalizeHttpUrl(): String? {
    val trimmed = BuildConfig.WEB_SHELL_URL.trim()
    if (trimmed.isEmpty()) return null
    val withScheme =
        if ("://" in trimmed) {
            trimmed
        } else {
            "https://$trimmed"
        }
    val uri = withScheme.toUri()
    val scheme = uri.scheme?.lowercase()
    if (scheme != "http" && scheme != "https") return null
    if (uri.host.isNullOrBlank()) return null
    return uri.toString()
}

/**
 * JS → native channel exposed to the web app as `window.VantaShell`.
 *
 * Seven jobs:
 *   · Let a mount/unmount of a web Drawer turn the native pull-to-refresh
 *     gesture off and on. Without it, the SwipeRefreshLayout steals a downward
 *     drag meant for the open sheet and reloads the entire WebView.
 *   · Save a base64 file (the PDF receipt) and report where it landed. The
 *     shell has no DownloadListener, so this is the only path that actually
 *     writes a file — see FileSaver.
 *   · Open that file again, so a receipt can be read in-app instead of being
 *     hunted for in the Downloads folder.
 *   · Share that file to another app through the system sheet. There is no web
 *     API that can take a file out of the WebView, so this is a capability the
 *     native layer owns outright.
 *   · Ask for the person, not the phone, before a spend is signed — see
 *     BiometricGate. This one is the only call here that answers TWICE: the
 *     return value says whether the prompt opened, and the outcome comes later
 *     through `window.__vantaBiometricResult`.
 *   · Fire a real OS haptic effect, so a tap and a confirmed deposit do not
 *     feel identical — see Haptics.
 *   · Post a system notification for a deposit that lands while the app is off
 *     screen, where the suspended page cannot speak for itself — see
 *     Notifications.
 *
 * All are called from the WebView's JS bridge thread, never the UI thread, so
 * the synchronous file write in `saveBase64File` blocks only the bridge call.
 */
private class VantaShellBridge(
    private val appContext: Context,
    private val activityContext: Context,
    private val onPullToRefreshChanged: (Boolean) -> Unit,
    private val onBiometricResult: (String) -> Unit,
    private val onHaptic: (Int) -> Unit,
) {
    @JavascriptInterface
    fun setPullToRefreshEnabled(enabled: Boolean) {
        onPullToRefreshChanged(enabled)
    }

    /**
     * @return a JSON string — `{ok, path}` or `{ok:false, error}` — that the web
     *         layer must check before telling the user the receipt was saved.
     */
    @JavascriptInterface
    fun saveBase64File(fileName: String, mimeType: String, base64Data: String): String =
        FileSaver.saveBase64(appContext, fileName, mimeType, base64Data)

    /**
     * Open a file that `saveBase64File` just wrote, in a viewer, so the receipt
     * can be seen (and screenshotted) without a trip through a file manager.
     * The uri comes back in `saveBase64File`'s JSON for exactly this reason.
     */
    @JavascriptInterface
    fun openSavedFile(uri: String, mimeType: String): String =
        FileSaver.openUri(appContext, uri, mimeType)

    /**
     * Share a file `saveBase64File` just wrote, through the system sheet.
     * Nothing is copied or written again: the uri from the save is what travels.
     */
    @JavascriptInterface
    fun shareSavedFile(uri: String, mimeType: String): String =
        FileSaver.shareUri(appContext, uri, mimeType)

    /**
     * Show the system biometric prompt. Returns immediately with whether the
     * prompt opened; the outcome is pushed back into the page as
     * `window.__vantaBiometricResult({id, ok, cancelled, error})`.
     *
     * `activityContext`, not `appContext`: the prompt is a dialog and has to be
     * attached to the Activity showing it.
     */
    @JavascriptInterface
    fun requestBiometricAuth(requestId: String, title: String, subtitle: String): String =
        BiometricGate.request(
            activityContext = activityContext,
            requestId = requestId,
            title = title,
            subtitle = subtitle,
            onResult = onBiometricResult,
        )

    /**
     * Fire an OS haptic effect. Deliberately dumb: the web layer names the beat
     * ("tap", "success", "error"), the platform decides how that feels.
     */
    @JavascriptInterface
    fun haptic(kind: String) {
        onHaptic(Haptics.constantFor(kind))
    }

    /**
     * Show a system notification for something that completed off-screen.
     * Suppressed while the app is visible, where the in-app toast already said
     * it — two copies of one message is worse than none.
     *
     * @return `{"ok":true}` or `{"ok":false,"reason":...}`; the web layer must
     *         not claim a notification the OS never showed.
     */
    @JavascriptInterface
    fun notify(id: String, title: String, body: String): String {
        if (MainActivity.isVisible) return """{"ok":false,"reason":"foreground"}"""
        return Notifications.post(appContext, id, title, body)
    }

    /** Ask for the notification grant. No-op once it is held. */
    @JavascriptInterface
    fun ensureNotificationPermission() {
        (activityContext as? MainActivity)?.requestNotificationPermission()
    }
}

private const val TAG = "WebShell"

private val VIEWPORT_PROBE_AND_PATCH_SCRIPT =
    """
    (function () {
      function measureViewport() {
        var probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;';
        document.documentElement.appendChild(probe);
        probe.style.height = '100vh';
        var vh = probe.getBoundingClientRect().height;
        probe.style.height = '100dvh';
        var dvh = probe.getBoundingClientRect().height;
        document.documentElement.removeChild(probe);
        return {
          innerHeight: window.innerHeight || 0,
          visualViewportHeight: window.visualViewport ? window.visualViewport.height : 0,
          vh: vh,
          dvh: dvh
        };
      }

      function updateViewportVars() {
        var px = Math.max(window.innerHeight || 0, 1) + 'px';
        document.documentElement.style.setProperty('--webshell-vh-px', px);
        document.documentElement.style.setProperty('--webshell-dvh-px', px);
      }

      function applyFallbackPatch() {
        updateViewportVars();
        if (!window.__webshell_viewport_resize_hook__) {
          window.__webshell_viewport_resize_hook__ = true;
          window.addEventListener('resize', updateViewportVars);
          window.addEventListener('orientationchange', updateViewportVars);
          if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', updateViewportVars);
          }
        }

        var style = document.getElementById('__webshell_viewport_patch_style__');
        if (!style) {
          style = document.createElement('style');
          style.id = '__webshell_viewport_patch_style__';
          style.textContent = [
            ':root { --webshell-vh-px: 100vh; --webshell-dvh-px: 100vh; }',
            'html, body, #root, #app { min-height: var(--webshell-dvh-px) !important; height: auto !important; }',
            '[class~="h-screen"], [class~="h-dvh"], [class*="h-screen"], [class*="h-dvh"] { height: var(--webshell-dvh-px) !important; }',
            '[class~="min-h-screen"], [class~="min-h-dvh"], [class*="min-h-screen"], [class*="min-h-dvh"] { min-height: var(--webshell-dvh-px) !important; }',
            '[class~="max-h-screen"], [class~="max-h-dvh"], [class*="max-h-screen"], [class*="max-h-dvh"] { max-height: var(--webshell-dvh-px) !important; }'
          ].join('\\n');
          document.documentElement.appendChild(style);
        }

        var classElements = document.querySelectorAll('[class]');
        for (var i = 0; i < classElements.length; i++) {
          var className = classElements[i].className;
          if (typeof className !== 'string') continue;
          if (className.indexOf('max-h-[calc(100dvh-1rem)]') !== -1 || className.indexOf('max-h-[calc(100vh-1rem)]') !== -1) {
            classElements[i].style.maxHeight = 'calc(var(--webshell-dvh-px) - 1rem)';
          }
        }
      }

      var before = measureViewport();
      var broken = before.innerHeight > 0 && (before.vh <= 1 || before.dvh <= 1);
      if (broken) {
        applyFallbackPatch();
      }
      var after = measureViewport();
      return JSON.stringify({
        broken: broken,
        patched: broken,
        before: before,
        after: after
      });
    })();
    """.trimIndent()
