#!/usr/bin/env node
/**
 * test-db.mjs — end-to-end harness for the relayer's Postgres layer.
 *
 * Exercises the parts that are easy to get subtly wrong: schema bootstrap, the
 * Ed25519 name-claim proof, reserved-name enforcement, the one-name-per-identity
 * rule, on-chain verification of a client-reported transaction, and — since
 * AUDIT-2026-09-27 C1/C2 — that history reads and writes are authenticated by the
 * identity's own key rather than by the shared token, and that the relayer
 * stores no amount and no counterparty.
 *
 * Usage:
 *   RELAYER_PORT=3999 RELAYER_TOKEN=testtoken node relayer/server.js &
 *   TEST_TOKEN=testtoken node relayer/test-db.mjs
 *
 * Env: TEST_URL (default http://127.0.0.1:3999), TEST_TOKEN (default testtoken)
 */
import { Keypair } from '@solana/web3.js'
import { Pool } from 'pg'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Same env files the relayer loads, so cleanup can reach the same database.
const __dirname = dirname(fileURLToPath(import.meta.url))
for (const file of [join(__dirname, '.env'), join(__dirname, '..', '.env.local')]) {
  try {
    process.loadEnvFile(file)
  } catch {
    /* absent — fine */
  }
}

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3999'
const TOKEN = process.env.TEST_TOKEN || 'testtoken'

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function b58encode(bytes) {
  const arr = Array.from(bytes)
  let zeros = 0
  while (zeros < arr.length && arr[zeros] === 0) zeros++
  const digits = [0]
  for (const byte of arr) {
    let carry = byte
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] * 256
      digits[i] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  return '1'.repeat(zeros) + digits.reverse().map((d) => B58[d]).join('')
}

/** Sign exactly like the relayer does, using node:crypto PKCS8 wrapping. */
function signEd25519(seed32, message) {
  const prefix = Buffer.from('302e020100300506032b657004220420', 'hex')
  const key = crypto.createPrivateKey({
    key: Buffer.concat([prefix, Buffer.from(seed32)]),
    format: 'der',
    type: 'pkcs8',
  })
  return Buffer.from(crypto.sign(null, Buffer.from(message), key))
}

const auth = { 'Content-Type': 'application/json', 'x-vanta-token': TOKEN }
const get = async (p, withAuth = true) => {
  const r = await fetch(BASE + p, withAuth ? { headers: auth } : undefined)
  return { status: r.status, body: await r.json().catch(() => null) }
}
const post = async (p, body, withAuth = true) => {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: withAuth ? auth : { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

// ── Identity proofs, mirrored from src/lib/identityProof.js ──────────
const reportMessage = (signature, actor) => `vanta-report:${signature}:${actor}`
const historyMessage = (address, ts) => `vanta-history:${address}:${ts}`
const proof = (seed32, message) => b58encode(signEd25519(seed32, message))
/** `{ts, sig}` query pair for a signed history read. */
const readQuery = (address, seed32, ts = Date.now()) => ({
  ts,
  sig: proof(seed32, historyMessage(address, ts)),
})
const signedReadPath = (address, { ts, sig }) =>
  `/tx/${encodeURIComponent(address)}?${new URLSearchParams({ ts: String(ts), sig })}`

let failures = 0
function check(label, condition, detail = '') {
  const mark = condition ? '✓' : '✗'
  if (!condition) failures++
  console.log(`  ${mark} ${label}${detail ? ` — ${detail}` : ''}`)
}

const owner = Keypair.generate()
const ownerAddr = owner.publicKey.toBase58()
// A second identity, used to prove the one-name-per-identity rule.
const other = Keypair.generate()

// Everything this run writes is suffixed, so re-running the harness never
// collides with its own previous run (it used to fail with "that name is taken"
// against rows it had left in the database minutes earlier).
const runId = crypto.randomBytes(3).toString('hex')

async function main() {
  console.log(`\n▸ Vanta relayer DB harness against ${BASE}\n`)

  // ── 1. Schema + health ────────────────────────────────────────────
  console.log('1. Schema bootstrap')
  const status = await get('/status')
  check('GET /status 200', status.status === 200)
  check('database configured', status.body?.database?.configured === true)
  check('database reachable', status.body?.database?.ok === true, status.body?.database?.error ?? '')

  // ── 2. Validation + reserved names ────────────────────────────────
  console.log('\n2. Name validation')
  const free = await get('/names/available/ai')
  check('valid name offered', free.body?.available === true, JSON.stringify(free.body))
  check('handle is namespaced', free.body?.handle === 'ai.vanta')

  const short = await get('/names/available/a')
  check('1-char rejected', short.body?.available === false, short.body?.reason)
  const twoChar = await get('/names/available/ai')
  check('2-char allowed (ai.vanta)', twoChar.body?.available === true, twoChar.body?.reason)
  const badChars = await get('/names/available/ai_bot')
  check('underscore rejected', badChars.body?.available === false, badChars.body?.reason)
  const reserved = await get('/names/available/vanta')
  check('reserved name rejected', reserved.body?.available === false, reserved.body?.reason)
  const hyphenEdge = await get('/names/available/-ai-')
  check('edge hyphen rejected', hyphenEdge.body?.available === false, hyphenEdge.body?.reason)

  // ── 3. Claim proof ────────────────────────────────────────────────
  console.log('\n3. Claim proof (Ed25519)')
  const name = `vanta-${runId}`
  const message = `vanta-name-claim:${name}`

  const forged = await post('/names/claim', {
    name,
    ownerAddress: ownerAddr,
    signature: b58encode(signEd25519(other.secretKey.slice(0, 32), message)),
  })
  check('forged signature refused (401)', forged.status === 401, JSON.stringify(forged.body))

  const realProof = b58encode(signEd25519(owner.secretKey.slice(0, 32), message))
  const claimed = await post('/names/claim', { name, ownerAddress: ownerAddr, signature: realProof })
  check('valid proof accepted', claimed.body?.ok === true, JSON.stringify(claimed.body))
  check('handle returned', claimed.body?.handle === `${name}.vanta`)

  const taken = await post('/names/claim', { name, ownerAddress: ownerAddr, signature: realProof })
  check('re-claim refused (409)', taken.status === 409, JSON.stringify(taken.body))

  // ── 4. Resolution + one-name-per-identity ─────────────────────────
  console.log('\n4. Resolution')
  const resolved = await get(`/names/${name}`)
  check('resolves to owner', resolved.body?.found === true && resolved.body?.address === ownerAddr,
    `${resolved.body?.name} → ${String(resolved.body?.address).slice(0, 10)}…`)

  const owned = await get(`/names/owned/${ownerAddr}`)
  check('owner lookup works', owned.body?.names?.length === 1, JSON.stringify(owned.body?.names))

  // `other` is a *different* identity, so it may not claim a second name for an
  // address that already has one — the rule is per-address, not per-claimant.
  const secondName = `vanta2-${runId}`
  const secondForSame = await post('/names/claim', {
    name: secondName,
    ownerAddress: ownerAddr,
    signature: b58encode(signEd25519(owner.secretKey.slice(0, 32), `vanta-name-claim:${secondName}`)),
  })
  check('one name per identity enforced', secondForSame.status === 409, JSON.stringify(secondForSame.body))

  const reservedClaim = await post('/names/claim', {
    name: 'admin',
    ownerAddress: other.publicKey.toBase58(),
    signature: b58encode(signEd25519(other.secretKey.slice(0, 32), 'vanta-name-claim:admin')),
  })
  check('reserved claim refused', reservedClaim.status === 409, JSON.stringify(reservedClaim.body))

  // ── 5. Transaction history (identity-signed, no money graph) ──────
  console.log('\n5. Transaction history')
  const ownerSeed = owner.secretKey.slice(0, 32)
  const otherSeed = other.secretKey.slice(0, 32)
  // A real Shield from HANDOFF.md §4.3, so the on-chain lookup finds something.
  const realSig = '21sFAdV2GMBzfDpEehcZ9mfHxCsQdWqgQMyT2Fccjtn9nERrRBpAfjwwy1MtFcru15woFi9moerqDNBb2NmZcuEA'
  // A syntactically valid 64-byte signature that certainly does not exist, and
  // is different on every run so rows never collide between runs.
  const fakeSig = b58encode(crypto.randomBytes(64))

  // Writes: unsigned and forged reports are refused.
  const unsigned = await post('/tx/report', { signature: realSig, flow: 'shield', actor: ownerAddr })
  check('unsigned report refused (401)', unsigned.status === 401, JSON.stringify(unsigned.body))

  const forgedReport = await post('/tx/report', {
    signature: realSig,
    flow: 'shield',
    actor: ownerAddr,
    proof: proof(otherSeed, reportMessage(realSig, ownerAddr)),
  })
  check('forged report refused (401)', forgedReport.status === 401, JSON.stringify(forgedReport.body))

  // A real transaction may not be filed under an address that is not in it.
  const notInvolved = await post('/tx/report', {
    signature: realSig,
    flow: 'shield',
    actor: ownerAddr,
    proof: proof(ownerSeed, reportMessage(realSig, ownerAddr)),
  })
  check('real tx not involving the reporter refused (403)', notInvolved.status === 403, JSON.stringify(notInvolved.body))

  // The honest path: our own identity reports a signature the chain cannot find.
  const reported = await post('/tx/report', {
    signature: fakeSig,
    flow: 'shadow',
    actor: ownerAddr,
    proof: proof(ownerSeed, reportMessage(fakeSig, ownerAddr)),
    intent: { mode: 'Shadow' },
  })
  check('signed report accepted', reported.body?.ok === true, JSON.stringify(reported.body))
  check('unverifiable report marked unverified', reported.body?.verified_on_chain === false)

  const badFlow = await post('/tx/report', {
    signature: fakeSig,
    flow: 'notaflow',
    actor: ownerAddr,
    proof: proof(ownerSeed, reportMessage(fakeSig, ownerAddr)),
  })
  check('unknown flow rejected', badFlow.status === 400, JSON.stringify(badFlow.body))

  // Reads: signed by the key whose history it is — the shared token is not enough.
  const unauth = await get(`/tx/${ownerAddr}`, false)
  check('unsigned history read refused (401)', unauth.status === 401)
  const tokenOnly = await get(`/tx/${ownerAddr}`)
  check('shared token does not unlock history (401)', tokenOnly.status === 401)

  const stale = await get(signedReadPath(ownerAddr, readQuery(ownerAddr, ownerSeed, Date.now() - 10 * 60 * 1000)))
  check('stale proof refused (401)', stale.status === 401)

  const forgedRead = await get(signedReadPath(ownerAddr, readQuery(ownerAddr, otherSeed)))
  check('forged read proof refused (401)', forgedRead.status === 401)

  const history = await get(signedReadPath(ownerAddr, readQuery(ownerAddr, ownerSeed)))
  check('signed read accepted', history.status === 200, JSON.stringify(history.body)?.slice(0, 120))
  const row = history.body?.transactions?.find((t) => t.signature === fakeSig)
  check('history row present', Boolean(row), `count=${history.body?.count}`)
  check('flow recorded', row?.flow === 'shadow')
  check('client intent stored', row?.client_report?.mode === 'Shadow')
  // The two facts the pooled transfer hides must not exist server-side.
  check('amount is NOT stored', row ? !('amount_atomic' in row) : false)
  check('counterparty is NOT stored', row ? !('counterparty' in row) : false)

  // ── 6. Clean up after ourselves ───────────────────────────────────
  // The harness writes real rows (a claimed name and a reported transaction)
  // into whatever database it is pointed at. It used to leave them there — a
  // harness row was still in the deployed database during the 2026-09-27 audit.
  console.log('\n6. Cleanup')
  if (!process.env.DATABASE_URL) {
    console.log('  – DATABASE_URL not set, nothing to clean (rows would persist)')
  } else {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const names = await pool.query('delete from vanta_names where name like $1', [`vanta%-${runId}`])
      const txs = await pool.query('delete from transactions where signature = $1', [fakeSig])
      console.log(`  ✓ removed ${names.rowCount} test name(s) and ${txs.rowCount} test transaction row(s)`)
    } catch (err) {
      console.log(`  ✗ cleanup failed: ${err.message}`)
    } finally {
      await pool.end()
    }
  }

  console.log(`\n${failures === 0 ? '✓ all checks passed' : `✗ ${failures} check(s) failed`}\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('harness crashed:', err)
  process.exit(1)
})
