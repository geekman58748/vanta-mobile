// ── Confirm it is the person, not the phone ──────────────────────────────────
// `window.VantaShell.requestBiometricAuth` is injected by MainActivity.kt, so in
// a plain browser (`npm run dev`) every call here is a guarded no-op that lets the
// spend through — the same shape as lib/shell.js.
//
// Why this exists: the app signs with a key it holds itself, so until now anyone
// holding the unlocked phone could move a private balance by tapping twice. A
// device screen lock does not help; the app is already open past it.
//
// ── The one call, and the policy it owns ────────────────────────────────────
// `confirmSpend()` answers a single question for the call site — may this spend
// proceed? — so no drawer has to learn about availability, cancellation or error
// codes:
//
//   no native bridge            → proceed. This is a browser build, or a shell
//                                 that predates this method.
//   device cannot prompt        → proceed, silently. Nothing is enrolled, or
//                                 there is no sensor. A gate nobody can answer
//                                 must not become a wallet nobody can spend from.
//   prompt shown, then passed   → proceed.
//   prompt shown, then CANCELED → block, quietly. Cancelling is a decision, not a
//                                 failure, and toasting at someone for changing
//                                 their mind is how a UI starts nagging.
//   prompt shown, then failed   → block, and say why (lockout, sensor busy).
//
// There is deliberately no timeout. The system prompt always terminates — a back
// gesture, a backgrounded app and a lockout all land in an error callback — so a
// timer here could only ever fire while the prompt was STILL up, turning a
// confirmation made a second too late into a spend that silently does nothing.
// No user-facing setting either: the gate is not an option to be switched off.

const PENDING = new Map()
let seq = 0
let handlerInstalled = false

function bridge() {
  if (typeof window === 'undefined') return null
  const shell = window.VantaShell
  return shell && typeof shell.requestBiometricAuth === 'function' ? shell : null
}

function installResultHandler() {
  if (handlerInstalled || typeof window === 'undefined') return
  handlerInstalled = true
  // The shell calls this BY NAME from `evaluateJavascript`, so it has to live on
  // `window` and it has to be installed before the request goes out — a prompt
  // can resolve before the synchronous bridge call has even returned.
  window.__vantaBiometricResult = (payload) => {
    const settle = payload?.id ? PENDING.get(payload.id) : null
    if (!settle) return
    PENDING.delete(payload.id)
    settle(payload)
  }
}

/** Whether this build can ask at all. The only honest answer is about the build,
 *  not the device: enrollment and hardware are only known once native answers. */
export function canConfirmWithBiometrics() {
  return bridge() !== null
}

/**
 * Ask for a confirmation before money moves.
 *
 * @param {object} opts
 * @param {string} opts.title    what is about to happen, e.g. 'Shield 0.1 SOL'
 * @param {string} [opts.subtitle]
 * @param {Function} [opts.notify] the app's toast, used only for a real failure
 * @returns {Promise<boolean>} true when the spend may proceed
 */
export async function confirmSpend({ title, subtitle = '', notify } = {}) {
  const shell = bridge()
  if (!shell) return true
  installResultHandler()

  // Unique per request: a sheet can be re-opened and re-confirmed, and the second
  // result must not settle the first promise.
  const id = `bio-${Date.now()}-${seq++}`

  const payload = await new Promise((resolve) => {
    PENDING.set(id, resolve)
    let immediate
    try {
      immediate = JSON.parse(shell.requestBiometricAuth(id, title ?? '', subtitle) || '{}')
    } catch (err) {
      PENDING.delete(id)
      resolve({ ok: false, error: err?.message || String(err) })
      return
    }
    // The prompt never opened, so no second answer is coming.
    if (immediate?.ok === false) {
      PENDING.delete(id)
      resolve(immediate)
    }
  })

  if (payload?.ok) return true
  if (payload?.unavailable) return true
  if (!payload?.cancelled) notify?.(payload?.error || 'Could not confirm it is you.', '⚠️')
  return false
}
