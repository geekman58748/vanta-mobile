/**
 * Runtime capability shims. Must settle before anything else in the app runs —
 * `main.jsx` imports this first, and the top-level await means `App.jsx` and its
 * dependencies are not evaluated until the probe below has finished.
 *
 * Why this exists: Ed25519 landed in Chrome's WebCrypto only in 2025 (Firefox
 * shipped it in 129, Aug 2024). Android WebViews older than roughly 137
 * therefore reject `importKey('raw', …, 'Ed25519', …)` with
 * `NotSupportedError: Algorithm: Unrecognized name`, and `@solana/kit`'s browser
 * signer builds its signatures on WebCrypto Ed25519. Without this the app stops
 * at `Privacy init failed: … Algorithm: Unrecognized name` and no Shield, Shadow
 * or Ghost can be built, on that device.
 *
 * The probe runs first so a WebView that already implements Ed25519 keeps its
 * native implementation (non-exportable keys, structured-cloneable into
 * IndexedDB) and the userspace polyfill is installed only where it is needed.
 */
import { install } from '@solana/webcrypto-ed25519-polyfill'

try {
  await crypto.subtle.importKey('raw', new Uint8Array(32), 'Ed25519', true, ['verify'])
} catch {
  try {
    install()
  } catch (err) {
    // A capability shim must never be the reason the app fails to boot.
    console.warn('Ed25519 polyfill unavailable:', err)
  }
}
