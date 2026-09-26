#!/usr/bin/env node
/**
 * test-name-resolution.mjs — end-to-end proof that `.vanta` handles resolve in
 * the real app, inside the real WebView, against the real registry.
 *
 * Opens the Send drawer, types a known-good handle, an unknown handle and a
 * plain address, and asserts the resolution chip for each. Typing is done with
 * the native value setter + a bubbling `input` event so React's onChange fires —
 * `el.value = x` alone does not notify React.
 *
 * The whole flow runs in ONE CDP evaluation: separate calls race the devtools
 * socket (the script does `adb forward --remove-all` each run) and fail randomly.
 *
 * Prereqs:
 *   - debug APK installed and launched
 *   - `adb reverse tcp:3001 tcp:3001` (the registry lives on your machine)
 *   - a known handle claimed in the registry
 *
 * Usage:
 *   KNOWN_HANDLE=testauto.vanta node scripts/test-name-resolution.mjs
 */
import { execSync } from 'node:child_process'

const PORT = Number(process.env.ADB_PORT || 9222)
const PKG = process.env.PACKAGE || 'com.vanta.privacywallet'
const KNOWN = process.env.KNOWN_HANDLE || 'testauto.vanta'
const UNKNOWN = process.env.UNKNOWN_HANDLE || 'notclaimed.vanta'
const SOME_ADDRESS = '9j7fG9xeaaU6g7wAvYenGs1gu942vwwPNLykr1HJqeWb'

const adb = (args) => execSync(`adb ${args}`, { encoding: 'utf8' }).trim()
const pid = adb(`shell pidof ${PKG}`)
if (!pid) {
  console.error(`✗ ${PKG} is not running`)
  process.exit(1)
}
adb('forward --remove-all')
adb(`forward tcp:${PORT} localabstract:webview_devtools_remote_${pid}`)

const pages = await fetch(`http://localhost:${PORT}/json`).then((r) => r.json())
const page = pages.find((p) => p.type === 'page')
if (!page) {
  console.error('✗ no CDP page target — debug build only')
  process.exit(1)
}

const expression = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const input = () =>
    [...document.querySelectorAll('input')].find((i) => /name\\.vanta/i.test(i.placeholder)) ||
    document.querySelector('input')
  const type = (value) => {
    const el = input()
    if (!el) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }
  const chip = () => {
    const el = document.querySelector('[role="status"]')
    return el ? { text: el.innerText, color: getComputedStyle(el).color } : null
  }
  const confirmBtn = () =>
    [...document.querySelectorAll('button')].map((b) => b.innerText.replace(/\\s+/g, ' '))
      .find((t) => /Confirm/i.test(t)) || null

  // 1. Open the Send drawer (it may already be open).
  const send = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().startsWith('Send'))
  if (!send) return JSON.stringify({ ok: false, step: 'open', error: 'Send button not found' })
  if (!input()) { send.click(); await wait(900) }
  if (!input()) return JSON.stringify({ ok: false, step: 'open', error: 'recipient input never appeared' })

  const placeholder = input().placeholder
  const results = { placeholder, cases: [] }

  // 3s, not 350ms+ε: the debounce is 350ms, but the first registry call in a
  // session pays a cold Neon connection (~1.8s) while warm calls run ~250ms.
  // 2. A handle that exists → green tick + the real owner address.
  type(${JSON.stringify(KNOWN)})
  await wait(3000)
  results.cases.push({ input: ${JSON.stringify(KNOWN)}, expect: 'resolved', chip: chip() })

  // 3. A handle nobody claimed → red cross, no address.
  type(${JSON.stringify(UNKNOWN)})
  await wait(3000)
  results.cases.push({ input: ${JSON.stringify(UNKNOWN)}, expect: 'missing', chip: chip() })

  // 4. A plain Solana address → no chip at all.
  type(${JSON.stringify(SOME_ADDRESS)})
  await wait(700)
  results.cases.push({ input: 'plain address', expect: 'no chip', chip: chip() })

  results.confirmButton = confirmBtn()
  results.ok = true
  return JSON.stringify(results)
})()`

const result = await new Promise((resolve, reject) => {
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  const timer = setTimeout(() => reject(new Error('CDP timeout')), 30000)
  ws.onopen = () =>
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    }))
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id !== 1) return
    clearTimeout(timer)
    ws.close()
    if (msg.result?.exceptionDetails) {
      reject(new Error(msg.result.exceptionDetails.exception?.description || 'evaluate threw'))
    } else {
      resolve(msg.result?.result?.value)
    }
  }
  ws.onerror = () => {
    clearTimeout(timer)
    reject(new Error('CDP websocket error'))
  }
})

const data = JSON.parse(result)
if (!data.ok) {
  console.error('✗ failed at step', data.step, '—', data.error)
  process.exit(1)
}

console.log(`\n▸ Send drawer handle resolution  (placeholder: "${data.placeholder}")\n`)
let failures = 0

function assert(label, pass, detail) {
  if (!pass) failures++
  console.log(`  ${pass ? '✓' : '✗'} ${label}`)
  console.log(`      ${detail}`)
}

const [known, unknown, plain] = data.cases
const linesOf = (c) => (c.chip?.text ?? '').split('\n').filter(Boolean)

assert(
  `known handle ${known.input} resolves`,
  linesOf(known).length > 0 && linesOf(known).join(' ').includes('→'),
  `${JSON.stringify(linesOf(known))}${known.chip?.color ? `  rgb(${known.chip.color})` : ''}`,
)

const unknownLines = linesOf(unknown)
assert(
  `unknown handle ${unknown.input} is refused`,
  unknownLines.length > 0 && !unknownLines.join(' ').includes('→'),
  `${JSON.stringify(unknownLines)}${unknown.chip?.color ? `  rgb(${unknown.chip.color})` : ''}`,
)

assert(
  'plain address shows no resolution chip',
  plain.chip === null,
  JSON.stringify(plain.chip),
)

console.log(`\n  · confirm button: ${data.confirmButton ?? '(not visible)'}`)
console.log(`\n${failures === 0 ? '✓ all checks passed' : `✗ ${failures} check(s) failed`}\n`)
process.exit(failures === 0 ? 0 : 1)
