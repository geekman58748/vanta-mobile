#!/usr/bin/env node
// Override the WebView's User-Agent via CDP, then reload.
//
// Why: `@solana-mobile/wallet-standard-mobile` picks its MWA transport from the
// UA string — if it contains "Solana Mobile Web Shell" it *assumes* a local
// WebSocket server exists (isLocalWebSocketAvailable() short-circuits to true)
// and routes every request through `ws://localhost:<port>/solana-wallet`. Our
// shell advertises that marker but never runs the server, so signing fails with
// ERR_CONNECTION_REFUSED. Stripping the marker forces the library down the
// intent/reflected path instead, which this shell does implement.
//
// Usage:
//   node scripts/webview-ua.mjs                 # strip the shell marker, reload
//   UA="..." node scripts/webview-ua.mjs        # set an explicit UA
//
// Env: ADB_PORT (9222), PACKAGE (com.vanta.privacywallet)

import { execSync } from 'node:child_process'

const PORT = Number(process.env.ADB_PORT || 9222)
const PKG = process.env.PACKAGE || 'com.vanta.privacywallet'
const UA =
  process.env.UA ||
  'Mozilla/5.0 (Linux; Android 16; sdk_gphone64_arm64 Build/BE4B.251210.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/151.0.7922.202 Mobile Safari/537.36'

const adb = (args) => execSync(`adb ${args}`, { encoding: 'utf8' }).trim()

const pid = adb(`shell pidof ${PKG}`)
if (!pid) {
  console.error(`✗ ${PKG} is not running — launch it first.`)
  process.exit(1)
}
adb(`forward tcp:${PORT} localabstract:webview_devtools_remote_${pid}`)

const pages = await fetch(`http://localhost:${PORT}/json`).then((r) => r.json())
const page = pages.find((p) => p.type === 'page')
if (!page) {
  console.error('✗ no CDP page target')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }))

ws.onopen = () => {
  send('Network.enable')
  send('Page.enable')
  send('Network.setUserAgentOverride', { userAgent: UA })
  // Reload so the app re-runs initMwa() under the new UA.
  setTimeout(() => send('Page.reload', { ignoreCache: true }), 300)
  setTimeout(() => {
    console.log(`UA overridden (no shell marker) — page reloaded\n${UA}`)
    ws.close()
    process.exit(0)
  }, 3500)
}

ws.onerror = () => {
  console.error('✗ CDP websocket error')
  process.exit(1)
}
