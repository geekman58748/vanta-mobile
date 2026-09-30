// ── Native Android feedback: OS notifications + real haptics ─────────────────
// `window.VantaShell` is injected by MainActivity.kt via addJavascriptInterface.
// It exists only inside the shipped APK, so every call here is a guarded no-op
// in a plain browser (`npm run dev`).
//
// Two capabilities the web layer does not have on its own:
//
//  1. A system notification. A Shield is submitted and the user switches apps;
//     the page's JavaScript is then suspended, so nothing in the WebView can
//     tell them the deposit landed. The native side posts it and the completion
//     leaves the app.
//  2. Haptics that respect the OS setting. `navigator.vibrate` is a flat motor
//     buzz that ignores it — see lib/haptic.js.
//
// Nothing here is user-configurable inside the app. The notification channel and
// its importance live in Android Settings, which is where they belong.

function bridge() {
  if (typeof window === 'undefined') return null
  const shell = window.VantaShell
  return shell && typeof shell.notify === 'function' ? shell : null
}

/** True when running inside the Android app rather than a browser. */
export function hasNativeShell() {
  return bridge() !== null
}

/**
 * Ask the OS to buzz.
 *
 * @param {string} kind one of 'tap' | 'pop' | 'success' | 'error' | 'tick'
 * @returns {boolean} true when the native path handled it, so the caller can
 *   skip the WebView vibrate fallback instead of firing both.
 */
export function nativeHaptic(kind = 'tap') {
  if (typeof window === 'undefined') return false
  const shell = window.VantaShell
  if (!shell || typeof shell.haptic !== 'function') return false
  try {
    shell.haptic(kind)
    return true
  } catch {
    return false
  }
}

/**
 * Post a system notification.
 *
 * The native side suppresses it whenever the app is on screen — the in-app
 * toast already said the same thing there — so it is always safe to call and
 * the duplicate never appears.
 *
 * @returns {boolean} true only when the OS actually accepted it. A caller that
 *   promises the user "we'll let you know" should check this.
 */
export function postNotification({ id = '', title = 'Vanta', body = '' } = {}) {
  const shell = bridge()
  if (!shell || !body) return false
  try {
    const result = JSON.parse(shell.notify(id, title, body) || '{}')
    return result.ok === true
  } catch {
    return false
  }
}

/**
 * Ask for the notification grant (API 33+). Free to call repeatedly — the OS
 * only ever shows the dialog once — and a no-op in a browser.
 */
export function ensureNotificationPermission() {
  if (typeof window === 'undefined') return
  try {
    window.VantaShell?.ensureNotificationPermission?.()
  } catch {
    /* no shell — nothing to grant */
  }
}
