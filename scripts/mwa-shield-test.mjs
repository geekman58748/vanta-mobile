#!/usr/bin/env node
// Drive a real Shield from the Vanta WebView and capture everything that matters.
//
// Why this exists: the MWA signing failure is invisible from the app (initZolana
// swallows engine errors and a release APK logs nothing to logcat). The only way
// to see why `ws://localhost:<port>/solana-wallet` is refused is to watch the
// console, the navigations (the `solana-wallet:` association intent) and the
// WebSocket lifecycle from inside the page.
//
// Usage:
//   node scripts/mwa-shield-test.mjs            # wait for app, click Shield, watch 90s
//   DURATION=120000 node scripts/mwa-shield-test.mjs
//
// Env: ADB_PORT (9222), PACKAGE (com.vanta.privacywallet), DURATION (ms), CLICK (0 to only watch)

import { execSync } from 'node:child_process'

const PORT = Number(process.env.ADB_PORT || 9222)
const PKG = process.env.PACKAGE || 'com.vanta.privacywallet'
const DURATION = Number(process.env.DURATION || 90000)
const CLICK = process.env.CLICK !== '0'
const RELOAD = process.env.RELOAD === '1'

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

const t0 = Date.now()
const ts = () => `+${String(((Date.now() - t0) / 1000).toFixed(1)).padStart(6)}s`
console.log(`attached to ${page.title} <${page.url}>\n`)

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const send = (method, params = {}) => {
  const myId = ++id
  ws.send(JSON.stringify({ id: myId, method, params }))
  return myId
}

const fmt = (v) => {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  if (v.type === 'string') return v.value
  if ('value' in v) return JSON.stringify(v.value)
  return v.description || v.type || '?'
}

// A page navigation (the `solana-wallet:` association intent) can destroy the
// CDP execution context mid-call, so every evaluate needs its own timeout —
// otherwise the whole script wedges waiting on a reply that never arrives.
const evalInPage = (expression, timeoutMs = 5000) =>
  new Promise((resolve) => {
    let myId = 0
    const done = (value) => {
      ws.removeEventListener('message', onMsg)
      clearTimeout(t)
      resolve(value)
    }
    const onMsg = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== myId) return
      done(msg.result?.result?.value)
    }
    const t = setTimeout(() => done(undefined), timeoutMs)
    ws.addEventListener('message', onMsg)
    // NOTE: `send` allocates the id itself — capture it rather than assuming.
    myId = send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  })

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)

  if (msg.method === 'Runtime.consoleAPICalled') {
    const args = (msg.params.args || []).map(fmt).join(' ')
    const bad = msg.params.type === 'error' || msg.params.type === 'warning'
    console.log(`${ts()} ${bad ? '✗' : '·'} [${msg.params.type}] ${args}`)
  }

  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    console.log(`${ts()} ✗✗ UNCAUGHT: ${d.exception?.description || d.text}`)
  }

  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry
    console.log(`${ts()} ✗ [${e.level}] ${e.text}`)
  }

  if (msg.method === 'Page.frameNavigated') {
    const url = msg.params.frame?.url || ''
    console.log(`${ts()} ⇢ NAV ${url.slice(0, 150)}`)
  }

  if (msg.method === 'Network.webSocketCreated') {
    console.log(`${ts()} ⇢ WS CREATED ${msg.params.url}`)
  }
  if (msg.method === 'Network.webSocketClosed') {
    console.log(`${ts()} ⇢ WS CLOSED ${msg.params.url}`)
  }
  if (msg.method === 'Network.webSocketFrameError') {
    console.log(`${ts()} ✗ WS FRAME ERROR ${msg.params.url} :: ${msg.params.errorMessage}`)
  }
  if (msg.method === 'Network.loadingFailed') {
    const p = msg.params
    if (p.type === 'WebSocket' || (p.errorText || '').includes('CONNECTION')) {
      console.log(`${ts()} ✗ LOAD FAILED [${p.type}] ${p.errorText} ${p.blockedReason ? `blocked=${p.blockedReason}` : ''}`)
    }
  }
}

ws.onerror = () => {
  console.error('✗ CDP websocket error')
  process.exit(1)
}

const waitForShell = async () => {
  for (let i = 0; i < 60; i++) {
    const ready = await evalInPage(
      `(function(){var b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Shield'));return b? b.disabled? 'disabled':'ready' : 'absent'})()`,
    )
    if (ready === 'ready') return true
    if (i % 5 === 0) console.log(`${ts()} … waiting for Shield button (${ready})`)
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

const readState = () =>
  evalInPage(
    `JSON.stringify({
      wallet: localStorage.getItem('vanta-wallet'),
      hasMwaCache: !!localStorage.getItem('SolanaMobileWalletAdapterDefaultAuthorizationCache'),
      status: (document.body.innerText.match(/Shield|Reconnect|failed|Engine|Starting/g)||[]).slice(0,12),
      toasts: [...document.querySelectorAll('[role=status],.toast')].map(e=>e.innerText).slice(0,4)
    }, null, 2)`,
  )

const timer = setTimeout(async () => {
  console.log(`\n--- ${DURATION}ms elapsed, final state ---`)
  console.log(await readState())
  ws.close()
  process.exit(0)
}, DURATION)

ws.onopen = async () => {
  send('Runtime.enable')
  send('Log.enable')
  send('Page.enable')
  send('Network.enable')
  console.log(`${ts()} CDP domains enabled`)

  if (RELOAD) {
    console.log(`${ts()} ↻ reloading for a clean startup
`)
    send('Page.reload', { ignoreCache: true })
    await new Promise((r) => setTimeout(r, 4000))
  }

  if (!CLICK) return
  await new Promise((r) => setTimeout(r, 1500))

  const ok = await waitForShell()
  if (!ok) {
    console.log(`${ts()} ✗ never found a ready Shield button — aborting`)
    return
  }
  console.log(`${ts()} ▶ clicking Shield`)
  const clicked = await evalInPage(
    `(function(){var b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Shield'));b.click();return b.innerText.replace(/\\s+/g,' ').trim()})()`,
  )
  console.log(`${ts()} ▶ clicked: ${clicked}`)
}
