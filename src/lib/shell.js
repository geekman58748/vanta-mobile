// ── Android web-shell bridge + sheet lock ────────────────────────────────────
// `window.VantaShell` is injected by MainActivity.kt via addJavascriptInterface.
// It exists only inside the shipped APK, so every call is a guarded no-op in a
// plain browser (`npm run dev`).
//
// Two things are owned here, both ref-counted:
//
//  1. The native pull-to-refresh (SwipeRefreshLayout). While a sheet is open the
//     WebView cannot scroll up, so a downward drag inside the sheet is read as
//     "pull to refresh" and reloads the whole app.
//  2. The body scroll lock, so the page behind a sheet stays put.
//
// Why a counter and not a boolean: sheets hand off to each other (Profile →
// Settings, and back), and each stays mounted ~350 ms after it "closes" so its
// exit animation can play. With a boolean, the OUTGOING sheet's cleanup ran
// after the incoming one had already locked — re-enabling pull-to-refresh under
// the new sheet, and (worse) restoring the captured `overflow: hidden` value as
// the final state, which left the whole app permanently unable to scroll. Both
// bugs came from that one race. Counting fixes them together.
let openSheets = 0

function apply() {
  const idle = openSheets === 0
  try {
    document.body.style.overflow = idle ? '' : 'hidden'
  } catch {
    /* no document (SSR / test harness) */
  }
  try {
    window.VantaShell?.setPullToRefreshEnabled?.(idle)
  } catch {
    /* not running inside the shell — nothing to do */
  }
}

/** Call when a sheet mounts. */
export function pushSheet() {
  openSheets += 1
  apply()
}

/** Call when a sheet unmounts. Both locks lift once the count hits zero. */
export function popSheet() {
  openSheets = Math.max(0, openSheets - 1)
  apply()
}
