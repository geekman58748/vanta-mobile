#!/usr/bin/env node
// Evaluate JavaScript inside the Vanta APK's WebView on a connected Android device.
//
// Why this exists: the shell's WebView is the only place the real app runs on device,
// and `adb logcat` shows nothing from release builds. Attaching over Chrome DevTools
// Protocol turns guesswork into ground truth.
//
// Requires a DEBUG build of the shell — `MainActivity` only calls
// `WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)`.
//
// Usage:
//   ./gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk
//   node scripts/webview-inspect.mjs                       # default: app state dump
//   node scripts/webview-inspect.mjs "document.body.innerText"
//
// Env: ADB_PORT (default 9222), PACKAGE (default com.vanta.privacywallet)

import { execSync } from 'node:child_process'

const PORT = Number(process.env.ADB_PORT || 9222)
const PKG = process.env.PACKAGE || 'com.vanta.privacywallet'

const adb = (args) => execSync(`adb ${args}`, { encoding: 'utf8' }).trim()

const pid = adb(`shell pidof ${PKG}`)
if (!pid) {
  console.error(`✗ ${PKG} is not running — launch it first.`)
  process.exit(1)
}
// The devtools socket name carries the app's pid, so a restarted app leaves a
// forward pointing at a dead socket. Clear first or CDP silently talks to nobody.
adb('forward --remove-all')
adb(`forward tcp:${PORT} localabstract:webview_devtools_remote_${pid}`)

const pages = await fetch(`http://localhost:${PORT}/json`).then((r) => r.json())
const page = pages.find((p) => p.type === 'page')
if (!page) {
  console.error('✗ no CDP page target — is this a debug build?')
  process.exit(1)
}

// The default probe answers the questions that actually block us on device:
// is the MWA handoff marker set, is this a secure context, and what state exists?
const DEFAULT_EXPR = `JSON.stringify({
  ua: navigator.userAgent,
  shell: navigator.userAgent.includes('Solana Mobile Web Shell'),
  secureContext: window.isSecureContext,
  localStorage: Object.keys(localStorage),
  bodyStart: document.body.innerText.slice(0, 220)
}, null, 2)`

const expression = process.argv[2] || DEFAULT_EXPR

const result = await new Promise((resolve, reject) => {
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  const timer = setTimeout(() => reject(new Error('CDP timeout')), 15000)
  ws.onopen = () =>
    ws.send(
      JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true },
      }),
    )
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

console.log(`page  : ${page.title}  <${page.url}>`)
console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
