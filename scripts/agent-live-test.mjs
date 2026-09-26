/**
 * Vanta live linkability test (agent-side).
 *
 *   node scripts/agent-live-test.mjs --setup                 create identity + sponsored registration
 *   node scripts/agent-live-test.mjs --status                print addresses + balances
 *   node scripts/agent-live-test.mjs --send-naive      <recipient> <amount>
 *   node scripts/agent-live-test.mjs --send-hardened   <recipient> <amount>
 *   node scripts/agent-live-test.mjs --inspect <txSig> [--watch <a,b,c>]
 *
 * Identity model mirrors the app: a `mainWallet` (the public, user-facing
 * wallet) plus an ephemeral privacy identity `X` (owner + shielded address)
 * that spends. Persisted to .agent-identity.json (gitignored).
 */
import { Keypair, Connection, PublicKey } from '@solana/web3.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const RPC_URL = 'https://devnet.helius-rpc.com/?api-key=REDACTED_HELIUS_KEY'
const RPC_WSS = 'wss://devnet.helius-rpc.com/?api-key=REDACTED_HELIUS_KEY'
const INDEXER_URL = 'https://d2xah7tnhdhcom.cloudfront.net'
const PROVER_URL = 'https://d21ni15goiip6l.cloudfront.net'
const PUBLIC_RPC = 'https://api.devnet.solana.com'
const RELAYER = 'http://localhost:3001'
const ID_FILE = '.agent-identity.json'
const EXPLORER = 'https://explorer.solana.com/tx/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const zk = await import('@heliuslabs/zolana')
const kit = await import('@solana/kit')
const { ed25519 } = await import('@noble/curves/ed25519.js')
const { KeyPairSigner } = {} // placeholder, unused

const plainConn = new Connection(PUBLIC_RPC, 'confirmed')
const client = await zk.createZolanaClient({
  solanaRpcUrl: RPC_URL, solanaRpcSubscriptionsUrl: RPC_WSS,
  indexerUrl: INDEXER_URL, proverUrl: PROVER_URL,
})
const sendAndConfirm = kit.sendAndConfirmTransactionFactory({
  rpc: client.solanaRpc, rpcSubscriptions: client.solanaRpcSubscriptions,
})

async function rpc(method, params) {
  const r = await fetch(RPC_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }).then(r => r.json())
  if (r.error) throw new Error(JSON.stringify(r.error).slice(0, 160))
  return r.result
}

// ── identity ────────────────────────────────────────────────────────────
function derive(secretArray, label) {
  const kp = Keypair.fromSecretKey(new Uint8Array(secretArray))
  const seed = new Uint8Array(kp.secretKey.slice(0, 32))
  const shielded = zk.ShieldedKeypair.fromKeypair(zk.SigningKey.fromEd25519Bytes(seed))
  return { label, kp, seed, shielded, address: kp.publicKey.toBase58() }
}

function loadIdentity() {
  if (!existsSync(ID_FILE)) return null
  const saved = JSON.parse(readFileSync(ID_FILE, 'utf-8'))
  return {
    mainWallet: derive(saved.mainWallet, 'mainWallet'),
    X: derive(saved.X, 'X'),
  }
}

function saveIdentity(id) {
  writeFileSync(ID_FILE, JSON.stringify({
    mainWallet: Array.from(id.mainWallet.kp.secretKey),
    X: Array.from(id.X.kp.secretKey),
  }, null, 2))
}

function showShielded(addr) {
  try { return addr.toBase58?.() ?? JSON.stringify(addr, (k, v) => typeof v === 'bigint' ? v.toString() : v) } catch { return String(addr) }
}

async function relayerAddress() {
  return (await fetch(`${RELAYER}/address`).then(r => r.json())).address
}

async function relayerStatus() {
  return fetch(`${RELAYER}/status`).then(r => r.json())
}

// X is fee-funded by the relayer, never by a user wallet (mirrors ensureXFloat in App.jsx).
async function ensureFloat(address, { min = 0.005, topUp = 0.02 } = {}) {
  const bal = await plainConn.getBalance(new PublicKey(address))
  if (bal >= min * 1e9) return null
  console.log(`  topping up fee float for ${address.slice(0, 8)}… (relayer)`)
  return fundViaRelayer(address, topUp)
}

async function fundViaRelayer(address, amount) {
  const res = await fetch(`${RELAYER}/fund`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, amount }),
  }).then(r => r.json())
  if (!res.ok) throw new Error('relayer /fund: ' + res.error)
  await sleep(5000)
  return res.signature
}

// ── submission: fill our slots, let the relayer fill its own ────────────
async function submitCompiled(compiledTx, localSigners, { label = '' } = {}) {
  const messageBytes = new Uint8Array(compiledTx.messageBytes)
  const seedByAddr = new Map(localSigners.map(s => [s.address, s.seed]))
  const slots = Object.entries(compiledTx.signatures).map(([addr, sig]) => ({ addr, sig: sig ?? null }))

  for (const slot of slots) {
    if (slot.sig) continue
    const seed = seedByAddr.get(slot.addr)
    if (seed) slot.sig = Buffer.from(ed25519.sign(messageBytes, seed)).toString('base64')
  }

  const relayerPub = await relayerAddress()
  const relayerSlotEmpty = slots.some(s => s.addr === relayerPub && !s.sig)

  if (relayerSlotEmpty) {
    const res = await fetch(`${RELAYER}/relay`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: Buffer.from(messageBytes).toString('base64'), slots }),
    }).then(r => r.json())
    if (!res.ok) throw new Error('relayer /relay: ' + res.error)
    return res.signature
  }

  const unfilled = slots.filter(s => !s.sig)
  if (unfilled.length) throw new Error(`no key for signer(s): ${unfilled.map(s => s.addr).join(', ')}`)
  const wire = Buffer.concat([Buffer.from(messageBytes), ...slots.map(s => Buffer.from(s.sig, 'base64'))])
  const res = await rpc('sendTransaction', [
    wire.toString('base64'),
    { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' },
  ])
  return res
}

async function confirm(sig) {
  for (let i = 0; i < 40; i++) {
    await sleep(1500)
    const st = await rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: false }])
    const s = st?.value?.[0]
    if (s) {
      if (s.err) throw new Error('tx failed: ' + JSON.stringify(s.err).slice(0, 200))
      return s.slot
    }
  }
  throw new Error('timeout waiting for ' + sig)
}

async function registerSponsored(id) {
  const relayerPub = await relayerAddress()
  const reg = await zk.buildRegistrationTransaction({
    client, owner: id.address, address: id.shielded.shieldedAddress(), payer: relayerPub,
  })
  if (reg === undefined) return { already: true }
  const sig = await submitCompiled(reg, [{ address: id.address, seed: id.seed }])
  await confirm(sig)
  return { sig }
}

async function makeWallet(id, keys) {
  return new zk.Wallet({ identity: id.shielded.shieldedAddress() })
}

async function sync(id, wallet, { requireSlot } = {}) {
  const keys = await zk.LocalKeys.fromKeypair(id.shielded, client.proofService)
  const slot = requireSlot === undefined ? undefined : BigInt(requireSlot)
  await zk.syncWallet({ client, wallet, keys, ...(slot === undefined ? {} : { config: { requireSlot: slot } }) })
  return keys
}

// ── commands ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const cmd = argv[0]

if (cmd === '--setup') {
  let id = loadIdentity()
  if (!id) {
    id = { mainWallet: derive(Array.from(Keypair.generate().secretKey), 'mainWallet'), X: derive(Array.from(Keypair.generate().secretKey), 'X') }
    saveIdentity(id)
    console.log('created NEW identities:')
  } else {
    console.log('loaded existing identities:')
  }
  const st = await relayerStatus()
  console.log(`\n  mainWallet (fund this) : ${id.mainWallet.address}`)
  console.log(`  X owner/tx signer      : ${id.X.address}`)
  console.log('  X shielded address     : (derived from X seed — see the registration tx)')
  console.log(`  relayer                : ${st.address} (${st.balance} SOL)`)

  console.log('\nregistering X with relayer-sponsored rent...')
  const reg = await registerSponsored(id.X)
  if (reg.already) console.log('  X already registered')
  else {
    console.log(`  ✅ registered — sig ${reg.sig}`)
    console.log(`     ${EXPLORER}${reg.sig}?cluster=devnet`)
  }
  const bal = await plainConn.getBalance(new PublicKey(id.mainWallet.address))
  console.log(`\n  mainWallet balance: ${bal / 1e9} SOL`)
  process.exit(0)
}

if (cmd === '--status') {
  const id = loadIdentity()
  if (!id) { console.log('no identity — run --setup'); process.exit(1) }
  const st = await relayerStatus()
  console.log(`mainWallet : ${id.mainWallet.address}  (${(await plainConn.getBalance(new PublicKey(id.mainWallet.address))) / 1e9} SOL)`)
  console.log(`X owner    : ${id.X.address}  (${(await plainConn.getBalance(new PublicKey(id.X.address))) / 1e9} SOL)`)
  console.log('X shielded : (derived from X seed)')
  const w = await makeWallet(id.X)
  await sync(id.X, w)
  console.log(`X private  : ${w.balances().map(b => Number(b.amount) / 1e9).join(', ') || '(empty)'} SOL`)
  console.log(`relayer    : ${st.address}  (${st.balance} SOL)`)
  process.exit(0)
}

if (cmd === '--send-naive' || cmd === '--send-hardened') {
  const [recipient, amountArg] = argv.slice(1)
  const amount = Number(amountArg)
  if (!recipient || !amount) { console.log('usage: --send-naive|--send-hardened <recipient> <amount>'); process.exit(1) }
  const id = loadIdentity()
  const lamports = BigInt(Math.round(amount * 1e9))
  const relayerPub = await relayerAddress()
  const wallet = await makeWallet(id.X)
  const keys = await sync(id.X, wallet)

  let depositor, depositorSeed, feePayer, label
  if (cmd === '--send-naive') {
    // The public edge exists: my funded wallet deposits straight into the pool.
    depositor = id.mainWallet.address
    depositorSeed = id.mainWallet.seed
    feePayer = relayerPub
    label = 'NAIVE (mainWallet → pool)'
  } else {
    // Hardened: a fresh single-use burner funds the pool entry, and the relayer
    // pays for it, so no user-controlled address touches the deposit.
    const burner = derive(Array.from(Keypair.generate().secretKey), 'burner')
    console.log(`burner (single-use): ${burner.address}`)
    const fsig = await fundViaRelayer(burner.address, amount + 0.01)
    console.log(`  burner funded by relayer: ${fsig}`)
    depositor = burner.address
    depositorSeed = burner.seed
    feePayer = relayerPub
    label = 'HARDENED (relayer-funded burner → pool)'
  }

  console.log(`\n[${label}] depositing ${amount} SOL...`)
  const deposit = await zk.buildDepositTransaction({
    client, feePayer, depositor, recipient: id.X.shielded.shieldedAddress(), amount: lamports,
  })
  const depSig = await submitCompiled(deposit, [{ address: depositor, seed: depositorSeed }])
  const depSlot = await confirm(depSig)
  console.log(`  deposit sig: ${depSig}`)
  await sync(id.X, wallet, { requireSlot: depSlot })
  console.log(`  private balance: ${wallet.balances().map(b => Number(b.amount) / 1e9).join(', ')} SOL`)

  console.log(`\n[${label}] ghost-sending ${amount} SOL to ${recipient}...`)
  await ensureFloat(id.X.address)
  const before = await plainConn.getBalance(new PublicKey(recipient))
  const withdrawal = await zk.buildWithdrawalTransaction({
    client, wallet, keys, feePayer: id.X.address, recipient, amount: lamports,
  })
  const sig = await submitCompiled(withdrawal, [{ address: id.X.address, seed: id.X.seed }])
  const slot = await confirm(sig)
  await sleep(8000)
  const after = await plainConn.getBalance(new PublicKey(recipient))
  const keys2 = await zk.LocalKeys.fromKeypair(id.X.shielded, client.proofService)
  await zk.syncWallet({ client, wallet, keys: keys2, config: { requireSlot: BigInt(slot) } })

  console.log(`\n  ✅ ghost sig: ${sig}`)
  console.log(`     ${EXPLORER}${sig}?cluster=devnet`)
  console.log(`  recipient: ${before / 1e9} → ${after / 1e9} SOL`)
  console.log(`  depositor used : ${depositor}`)
  console.log(`  tx initiator   : ${id.X.address}  (X — the spend identity)`)
  console.log(`\n  inspect with:\n    node scripts/agent-live-test.mjs --inspect ${sig} --watch <addr,addr>`)
  process.exit(0)
}

if (cmd === '--inspect') {
  const sig = argv[1]
  const eqForm = argv.find(a => a.startsWith('--watch='))
  const spacedIdx = argv.indexOf('--watch')
  const watchRaw = eqForm ? eqForm.slice('--watch='.length) : (spacedIdx >= 0 ? argv[spacedIdx + 1] ?? '' : '')
  const watch = String(watchRaw).split(',').map(s => s.trim()).filter(Boolean)
  const tx = await rpc('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }])
  if (!tx) { console.log('tx not found'); process.exit(1) }
  const keys = tx.transaction.message.accountKeys
  const programs = tx.transaction.message.instructions.map(ix =>
    typeof ix.program === 'string' ? ix.program : ix.programId)
  console.log(`tx ${sig}`)
  console.log(`programs touched: ${[...new Set(programs)].join(', ')}`)
  console.log('\naccount list (signer / lamport delta):')
  keys.forEach((k, i) => {
    const d = (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / 1e9
    const flags = [k.signer ? 'SIGNER' : '', k.writable ? 'writable' : ''].filter(Boolean).join(' ')
    const hit = watch.includes(k.pubkey) ? '  🔴 WATCHED WALLET!' : ''
    console.log(`  ${k.pubkey}  ${(d >= 0 ? '+' : '') + d.toFixed(6)}  ${flags}${hit}`)
  })
  if (watch.length) {
    const hits = keys.map(k => k.pubkey).filter(p => watch.includes(p))
    console.log(hits.length
      ? `\n❌ LINKED — ${hits.length} watched wallet(s) appear in this tx`
      : `\n✅ SEVERED — none of the watched wallets (${watch.length}) appear in this tx`)
  }
  process.exit(0)
}

console.log('usage: --setup | --status | --send-naive <recipient> <amount> | --send-hardened <recipient> <amount> | --inspect <sig> --watch <a,b>')
