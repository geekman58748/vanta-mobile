#!/usr/bin/env node
// Stream the Vanta WebView's console output, uncaught errors and log entries to the terminal.
//
// Why this exists: `initZolana(...).catch(() => {})` in App.jsx swallows engine failures,
// and a release APK logs nothing to logcat. Reloading the page under an attached CDP
// session is the only way to see the real error.
//
// Requires a DEBUG build of the shell (MainActivity gates WebView debugging on BuildConfig.DEBUG).
//
// Usage:
//   node scripts/webview-console.mjs            # reload and watch for 25s
//   DURATION=40000 node scripts/webview-console.mjs
//
// Env: ADB_PORT (9222), PACKAGE (com.vanta.privacywallet), DURATION (ms), RELOAD (0 to skip)

import { execSync } from 'node:child_process'

const PORT = Number(process.env.ADB_PORT || 9222)
const PKG = process.env.PACKAGE || 'com.vanta.privacywallet'
const DURATION = Number(process.env.DURATION || 25000)
const RELOAD = process.env.RELOAD !== '0'

const adb = (args) => execSync(`adb ${args}`, { encoding: 'utf8' }).trim()
const pid = adb(`shell pidof ${PKG}`)
if (!pid) {
  console.error(`✗ ${PKG} is not running — launch it first.`)
  process.exit(1)
}
adb('forward --remove-all')
adb(`forward tcp:${PORT} localabstract:webview_devtools_remote_${pid}`)

const pages = await fetch(`http://localhost:${PORT}/json`).then((r) => r.json())
const page = pages.find((p) => p.type === 'page')
if (!page) {
  console.error('✗ no CDP page target — is this a debug build?')
  process.exit(1)
}

console.log(`attached to ${page.title} <${page.url}>${RELOAD ? ' — reloading…' : ''}\n`)

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }))

const fmt = (v) => {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  if (v.type === 'string') return v.value
  if ('value' in v) return JSON.stringify(v.value)
  return v.description || v.type || '?'
}

const timer = setTimeout(() => {
  console.log(`\n--- ${DURATION}ms elapsed, detaching ---`)
  ws.close()
  process.exit(0)
}, DURATION + (RELOAD ? 3000 : 0))

ws.onopen = () => {
  send('Runtime.enable')
  send('Log.enable')
  send('Page.enable')
  if (RELOAD) setTimeout(() => send('Page.reload', { ignoreCache: true }), 400)
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)

  if (msg.method === 'Runtime.consoleAPICalled') {
    const args = (msg.params.args || []).map(fmt).join(' ')
    const isErr = msg.params.type === 'error' || msg.params.type === 'warning'
    console.log(`${isErr ? '✗' : '·'} [${msg.params.type}] ${args}`)
  }

  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    console.log(`✗✗ UNCAUGHT: ${d.exception?.description || d.text}`)
  }

  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry
    console.log(`✗ [${e.level}] ${e.text}${e.url ? `  (${e.url.slice(0, 90)})` : ''}`)
  }
}

ws.onerror = () => {
  clearTimeout(timer)
  console.error('✗ CDP websocket error')
  process.exit(1)
}
