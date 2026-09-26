#!/usr/bin/env node
// Set the Android clipboard through the Vanta WebView over CDP.
//
// Why this contraption: Android 10+ blocks clipboard writes from the shell (there
// is no `adb shell` clipboard API), but the debug shell build exposes Chrome
// DevTools. Granting the page `clipboardReadWrite` + `clipboardSanitizedWrite`
// and bringing Vanta to the foreground makes `navigator.clipboard.writeText`
// work, and lets us read the value back to prove it stuck.
//
// Usage:
//   node scripts/device-clipboard.mjs "9j7fG9xeaaU6g7wAvYenGs1gu942vwwPNLykr1HJqeWb"
//
// Env: ANDROID_SERIAL (required on multi-device), PACKAGE (default com.vanta.privacywallet)

import { execSync } from 'node:child_process'

const PKG = process.env.PACKAGE || 'com.vanta.privacywallet'
const TEXT = process.argv[2]

if (!TEXT) {
  console.error('usage: node scripts/device-clipboard.mjs "<text to copy>"')
  process.exit(1)
}

const adb = (args) => execSync(`adb ${args}`, { encoding: 'utf8' }).trim()
const serial = process.env.ANDROID_SERIAL ? `-s ${process.env.ANDROID_SERIAL}` : ''

const pid = adb(`${serial} shell pidof ${PKG}`)
if (!pid) {
  console.error(`✗ ${PKG} is not running — launch it first.`)
  process.exit(1)
}
adb(`${serial} forward --remove-all`)
adb(`${serial} forward tcp:9223 localabstract:webview_devtools_remote_${pid}`)

const pages = await fetch('http://localhost:9223/json').then((r) => r.json())
const page = pages.find((p) => p.type === 'page')
if (!page) {
  console.error('✗ no CDP page target — is this a debug build?')
  process.exit(1)
}

// The WebView must be the focused window or Chrome rejects clipboard writes.
try { adb(`${serial} shell am start -n ${PKG}/.MainActivity`) } catch {}

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const myId = ++id
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 8000)
    const onMsg = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== myId) return
      clearTimeout(timer)
      ws.removeEventListener('message', onMsg)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({ id: myId, method, params }))
  })

const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  })
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || 'evaluate threw')
  }
  return r.result?.result?.value
}

ws.onopen = async () => {
  try {
    await call('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
    })
    await evaluate(`navigator.clipboard.writeText(${JSON.stringify(TEXT)})`)
    // Android lets the WebView WRITE the system clipboard but usually blocks
    // reading it back from JS. Verify with an independent mechanism instead:
    // execCommand('paste') pulls the SYSTEM clipboard into a DOM textarea.
    const probe = await evaluate(`
      (async () => {
        const el = document.createElement('textarea')
        el.value = ''
        document.body.appendChild(el)
        el.focus()
        let ok = false
        try { ok = document.execCommand('paste') } catch {}
        const v = el.value
        el.remove()
        return JSON.stringify({ ok, v })
      })()
    `)
    let pasted = { ok: false, v: '' }
    try { pasted = JSON.parse(probe) } catch {}
    if (pasted.v === TEXT) {
      console.log(`✓ clipboard set and verified via paste probe: ${pasted.v}`)
    } else if (pasted.ok) {
      console.log(`⚠ paste succeeded but content mismatch: "${pasted.v}"`)
    } else {
      // Cannot read it back from JS — the write itself was accepted, but say so.
      console.log('⚠ clipboard write accepted; JS paste probe was blocked (normal on Android) —')
      console.log('  long-press a text field and Paste to confirm, or check Download/vanta-shadow-address.txt')
    }
  } catch (err) {
    console.error(`✗ clipboard failed: ${err.message}`)
    console.error('  (long-press copy from Download/vanta-shadow-address.txt still works)')
    process.exitCode = 1
  } finally {
    ws.close()
    process.exit(process.exitCode || 0)
  }
}

ws.onerror = () => {
  console.error('✗ CDP websocket error')
  process.exit(1)
}
