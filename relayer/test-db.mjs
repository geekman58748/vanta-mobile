#!/usr/bin/env node
/**
 * test-db.mjs — end-to-end harness for the relayer's Postgres layer.
 *
 * Exercises the parts that are easy to get subtly wrong: schema bootstrap, the
 * Ed25519 name-claim proof, reserved-name enforcement, the one-name-per-identity
 * rule, and on-chain verification of a client-reported transaction.
 *
 * Usage:
 *   RELAYER_PORT=3999 RELAYER_TOKEN=testtoken node relayer/server.js &
 *   TEST_TOKEN=testtoken node relayer/test-db.mjs
 *
 * Env: TEST_URL (default http://127.0.0.1:3999), TEST_TOKEN (default testtoken)
 */
import { Keypair } from '@solana/web3.js'
import crypto from 'node:crypto'

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
  const name = 'vantatest'
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
  check('handle returned', claimed.body?.handle === 'vantatest.vanta')

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
  const secondForSame = await post('/names/claim', {
    name: 'vantasecond',
    ownerAddress: ownerAddr,
    signature: b58encode(signEd25519(owner.secretKey.slice(0, 32), 'vanta-name-claim:vantasecond')),
  })
  check('one name per identity enforced', secondForSame.status === 409, JSON.stringify(secondForSame.body))

  const reservedClaim = await post('/names/claim', {
    name: 'admin',
    ownerAddress: other.publicKey.toBase58(),
    signature: b58encode(signEd25519(other.secretKey.slice(0, 32), 'vanta-name-claim:admin')),
  })
  check('reserved claim refused', reservedClaim.status === 409, JSON.stringify(reservedClaim.body))

  // ── 5. Transaction history (real devnet signature) ────────────────
  console.log('\n5. Transaction history')
  // A real Shield from HANDOFF.md §4.3, so the on-chain lookup has something to
  // actually find.
  const realSig = '21sFAdV2GMBzfDpEehcZ9mfHxCsQdWqgQMyT2Fccjtn9nERrRBpAfjwwy1MtFcru15woFi9moerqDNBb2NmZcuEA'
  const actor = '6NrEzXoaEzpxUuHERCtW46xKa3j41B2AAMG4R8a1zhDt'

  const report = await post('/tx/report', {
    signature: realSig,
    flow: 'shield',
    amount: '100000000',
    actor,
    intent: { kind: 'deposit', source: 'harness' },
  })
  check('report accepted', report.body?.ok === true, JSON.stringify(report.body))
  check('verified on-chain', report.body?.verified_on_chain === true)

  const badFlow = await post('/tx/report', { signature: realSig, flow: 'notaflow', actor })
  check('unknown flow rejected', badFlow.status === 400, JSON.stringify(badFlow.body))

  const fakeSig = await post('/tx/report', {
    signature: 'HarnesstestSignatureThatDoesNotExist1111111111111111',
    flow: 'shadow',
    actor: 'someUnrelatedAddress11111111111111111111111111',
  })
  check('unverifiable report marked unverified', fakeSig.body?.verified_on_chain === false)

  const history = await get(`/tx/${actor}`)
  const row = history.body?.transactions?.find((t) => t.signature === realSig)
  check('history row present', Boolean(row), `count=${history.body?.count}`)
  check('flow recorded', row?.flow === 'shield')
  check('amount recorded', String(row?.amount_atomic) === '100000000')
  check('client report stored', row?.client_report?.kind === 'deposit')

  const unauth = await get(`/tx/${actor}`, false)
  check('history is token-gated (401)', unauth.status === 401)

  console.log(`\n${failures === 0 ? '✓ all checks passed' : `✗ ${failures} check(s) failed`}\n`)
  console.log(`cleanup: delete from vanta_names where name in ('${name}');`)
  console.log(`         delete from transactions where signature in ('${realSig}', 'HarnesstestSignatureThatDoesNotExist1111111111111111');\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('harness crashed:', err)
  process.exit(1)
})
