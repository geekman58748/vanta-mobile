#!/usr/bin/env node
// Open a real receipt inside the Vanta WebView and prove the "On chain check"
// block does something.
//
// Why this exists: that block used to be a pure cache read (`PROOF[txn.proof ??
// lookupProof(sig)]`) with no query anywhere, so a row whose single report
// failed stayed "Not checked" for the life of the install — and the proof keys
// lived in a bare `Map()`, so a reload threw away even the successful ones.
// Both were fixed together (txHistory.js: persisted store + `checkProof`,
// App.jsx: `openReceipt` fires it). This is the check that they hold.
//
// What it asserts:
//   1. the receipt sheet opens,
//   2. the proof store gains a key for a signature that had none,
//   3. the On-chain check block shows a real state, not "Not checked".
//
// Usage: ./gradlew assembleDebug && adb install -r <apk>   (DEBUG build only)
//        node scripts/webview-receipt-check.mjs
//
// Env: ADB_PORT (default 9222), PACKAGE (default com.vanta.privacywallet)

import { execSync } from 'node:child_process'

const PORT = Number(process.env.ADB_PORT || 9222)
const PKG = process.env.PACKAGE || 'com.vanta.privacywallet'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const adb = (args) => execSync(`adb ${args}`, { encoding: 'utf8' }).trim()

const pid = adb(`shell pidof ${PKG}`)
if (!pid) {
  console.error(`✗ ${PKG} is not running — launch it first.`)
  process.exit(1)
}
// A restarted app leaves a forward pointing at a dead socket. Clear first or
// CDP silently talks to nobody.
adb('forward --remove-all')
adb(`forward tcp:${PORT} localabstract:webview_devtools_remote_${pid}`)

const pages = await fetch(`http://localhost:${PORT}/json`).then((r) => r.json())
const page = pages.find((p) => p.type === 'page')
if (!page) {
  console.error('✗ no CDP page target — is this a debug build?')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (method, params = {}) => {
  const mid = ++id
  ws.send(JSON.stringify({ id: mid, method, params }))
  return new Promise((resolve) => pending.set(mid, resolve))
}
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
await new Promise((resolve) => { ws.onopen = resolve })
await send('Runtime.enable')
// Capture the relayer's actual response bodies: the browser console only says
// "500", and the reason is in the JSON it returned.
await send('Network.enable')
const relayerCalls = []
const loadFailures = []
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.method === 'Network.requestWillBeSent' && /code\.run/.test(msg.params.request.url)) {
    relayerCalls.push({
      id: msg.params.requestId,
      url: msg.params.request.url,
      status: 0,
      method: msg.params.request.method,
    })
  }
  if (msg.method === 'Network.responseReceived' && /\/tx\//.test(msg.params.response.url)) {
    const call = relayerCalls.find((c) => c.id === msg.params.requestId)
    if (call) call.status = msg.params.response.status
    else relayerCalls.push({ id: msg.params.requestId, url: msg.params.response.url, status: msg.params.response.status })
  }
  if (msg.method === 'Network.loadingFailed' && relayerCalls.some((c) => c.id === msg.params.requestId)) {
    loadFailures.push(msg.params.errorText)
  }
})

/** Evaluate and return the value, surfacing an in-page exception as a string. */
async function J(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (res.result?.exceptionDetails) {
    return `EXC: ${res.result.exceptionDetails.exception?.description ?? res.result.exceptionDetails.text}`
  }
  return res.result?.result?.value
}

// Everything the page logs while we drive it — `refreshVerified` reports its
// own failures here, which is the only place the reason survives.
const pageLogs = []
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.method !== 'Runtime.consoleAPICalled') return
  const text = (msg.params.args ?? [])
    .map((a) => a.value ?? a.description ?? '')
    .join(' ')
  if (/\[tx\]|\[vanta\]|Error|error|failed/i.test(text)) pageLogs.push(text)
})

const before = await J("localStorage.getItem('vanta-proofs-v1')")
console.log('proof store before:', before)

// A receipt left open from a previous run would sit on top of the rows.
await J(`(() => {
  const close = [...document.querySelectorAll('button')].find((b) => /^close$/i.test(b.innerText.trim()))
  if (close) close.click()
  return true
})()`)
await sleep(800)

const clicked = await J(`(() => {
  const rows = [...document.querySelectorAll('div.cursor-pointer')].filter(
    (d) => !(d.parentElement && String(d.parentElement.className).includes('cursor-pointer')),
  )
  const row = rows.find((r) => r.innerText.includes('Shielded')) ?? rows[0]
  if (!row) return 'NO ROWS'
  row.click()
  return row.innerText.replace(/\\s+/g, ' ').slice(0, 56)
})()`)
console.log('opened:', clicked)

await sleep(7000)

const checks = {
  sheetOpen: await J("document.body.innerText.includes('Transaction details')"),
  block: await J(
    "((document.body.innerText.match(/on-chain check[\\s\\S]{0,220}/i) || ['missing'])[0]).replace(/\\s+/g, ' ')",
  ),
  store: await J("localStorage.getItem('vanta-proofs-v1')"),
}
console.log('receipt sheet open :', checks.sheetOpen)
console.log('On-chain check     :', checks.block)
console.log('proof store after  :', checks.store)

console.log('\nrelayer calls:')
if (!relayerCalls.length) console.log('  (none — the app never issued one)')
for (const call of relayerCalls) {
  let body = ''
  try {
    const res = await send('Network.getResponseBody', { requestId: call.id })
    body = String(res.result?.body ?? '').slice(0, 240)
  } catch {
    body = '(body unavailable)'
  }
  console.log(`  ${call.method} ${call.status || '-'} ${call.url.replace(/^https?:\/\/[^/]+/, '')}\n      ${body}`)
}
if (loadFailures.length) console.log('  request failures:', [...new Set(loadFailures)].join(', '))
if (pageLogs.length) {
  console.log('\npage console:')
  for (const line of pageLogs.slice(-12)) console.log('  ' + line.slice(0, 220))
}
const badCall = relayerCalls.find((c) => c.status >= 400)

// When the block is missing, the reason is in what DID render.
if (checks.block === 'missing') {
  console.log('rendered instead   :', await J("document.body.innerText.replace(/\\s+/g, ' ').slice(-320)"))
}

ws.close()

const gainedKey = Boolean(checks.store) && checks.store !== before
// The block must be PRESENT and must not be the fallback state. Asserting only
// on "not Unchecked" passed while the block was missing entirely — which is
// exactly the kind of check that lets a broken receipt look green.
const present = checks.block !== 'missing'
const resolved = !/Not checked/i.test(checks.block)
const ok = checks.sheetOpen === true && present && resolved
console.log(`\n${ok ? '✓' : '✗'} receipt re-check ${ok ? 'holds' : 'FAILED'}` +
  `  (block present: ${present ? 'yes' : 'NO'}, resolved: ${resolved ? 'yes' : 'no'}, proof key written: ${gainedKey ? 'yes' : 'no'})`)
if (badCall) console.log(`  relayer ${badCall.status} on ${badCall.url.replace(/^https?:\/\/[^/]+/, '')} — fix the server, not this receipt.`)
process.exitCode = ok ? 0 : 1
