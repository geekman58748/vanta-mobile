// Ported from gemini-code-1789825749253.html — the Web Audio "haptic" engine.
// Three voices: tap (ui press), pop (open/major beat), success (confirmed tx).
// Pairs every audio cue with a real motor buzz: the native haptic engine inside
// the APK, or navigator.vibrate in a browser.
import { nativeHaptic } from './native'

let audioCtx = null

export function playHaptic(type = 'tap') {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    if (!audioCtx) audioCtx = new AC()
    if (audioCtx.state === 'suspended') audioCtx.resume()

    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    const now = audioCtx.currentTime

    if (type === 'pop') {
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(280, now)
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.06)
      gain.gain.setValueAtTime(0.18, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start(now)
      osc.stop(now + 0.06)
    } else if (type === 'success') {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(320, now)
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.12)
      gain.gain.setValueAtTime(0.2, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start(now)
      osc.stop(now + 0.12)
    } else {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(160, now)
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.04)
      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start(now)
      osc.stop(now + 0.04)
    }

    // Native first. Inside the APK the platform haptic engine gives a tuned
    // effect and honours the user's system haptics setting; navigator.vibrate
    // is a flat buzz that ignores both. Only without a shell do we fall back to
    // the WebView motor — and then only after a gesture, because Chrome blocks
    // (and console-errors) vibrate before one, leaving a wall of "Blocked call
    // to navigator.vibrate" for anyone reading the console.
    if (nativeHaptic(type)) return
    const activation = navigator.userActivation
    const canVibrate = !activation || activation.hasBeenActive !== false
    if (canVibrate && typeof navigator.vibrate === 'function') {
      navigator.vibrate(type === 'success' ? [15, 30, 15] : 8)
    }
  } catch {
    // Audio is a nicety — never let it break a send.
  }
}
