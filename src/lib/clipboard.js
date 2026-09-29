// Clipboard helper with the execCommand fallback gemini's template used, so
// copy works in the same insecure/embedded contexts the original supported.
import { playHaptic } from './haptic'

export async function copyText(text, notify, label = 'Copied to clipboard!', icon = '🔗') {
  let ok = false
  try {
    await navigator.clipboard.writeText(text)
    ok = true
  } catch {
    try {
      const dummy = document.createElement('textarea')
      dummy.value = text
      dummy.setAttribute('readonly', '')
      dummy.style.position = 'fixed'
      dummy.style.opacity = '0'
      document.body.appendChild(dummy)
      dummy.select()
      ok = document.execCommand('copy')
      document.body.removeChild(dummy)
    } catch {
      ok = false
    }
  }
  playHaptic('tap')
  notify(ok ? label : 'Copy failed. Select and copy manually', ok ? icon : '⚠️')
  return ok
}
