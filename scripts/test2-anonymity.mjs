/**
 * TEST TWO — unlinkability under an anonymity set.
 *
 *   1. Stage depth: N relayer-funded burners deposit similar amounts (candidate inflows)
 *   2. Per-send rotation: each payout uses a FRESH identity (X_i) + its own burner
 *   3. Assert, per payout: no known wallet present, initiator unique per send,
 *      and multiple same-size inflows exist (so amount correlation is ambiguous)
 *
 *   node scripts/test2-anonymity.mjs <receiver> [sends] [stageDepth]
 */
import { Keypair, Connection, PublicKey } from '@solana/web3.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const HELIUS_KEY = process.env.VITE_HELIUS_API_KEY ?? process.env.HELIUS_API_KEY ?? ''
const RPC_URL = HELIUS_KEY ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : 'https://api.devnet.solana.com'
const RPC_WSS = HELIUS_KEY ? `wss://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : 'wss://api.devnet.solana.com'
const RELAYER = 'http://localhost:3001'
const EXPLORER = 'https://explorer.solana.com/tx/'
const PUBLIC_RPC = 'https://api.devnet.solana.com'
const TEST_FILE = '.test2-state.json'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const [receiver, sendsArg = '2', depthArg = '4'] = process.argv.slice(2)
if (!receiver) { console.error('usage: node scripts/test2-anonymity.mjs <receiver> [sends] [stageDepth]'); process.exit(1) }
const SENDS = Number(sendsArg)
const DEPTH = Number(depthArg)
const AMOUNT = 0.02

const zk = await import('@heliuslabs/zolana')
const kit = await import('@solana/kit')
const { ed25519 } = await import('@noble/curves/ed25519.js')
const plainConn = new Connection(PUBLIC_RPC, 'confirmed')
const client = await zk.createZolanaClient({
  solanaRpcUrl: RPC_URL, solanaRpcSubscriptionsUrl: RPC_WSS,
  indexerUrl: 'https://d2xah7tnhdhcom.cloudfront.net',
  proverUrl: 'https://d21ni15goiip6l.cloudfront.net',
})

async function rpc(method, params) {
  const r = await fetch(RPC_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }).then(r => r.json())
  if (r.error) throw new Error(JSON.stringify(r.error).slice(0, 180))
  return r.result
}

function derive(secretArray) {
  const kp = Keypair.fromSecretKey(new Uint8Array(secretArray))
  const seed = new Uint8Array(kp.secretKey.slice(0, 32))
  const shielded = zk.ShieldedKeypair.fromKeypair(zk.SigningKey.fromEd25519Bytes(seed))
  return { kp, seed, shielded, address: kp.publicKey.toBase58() }
}

async function relayerAddr() { return (await fetch(`${RELAYER}/address`).then(r => r.json())).address }
async function relayerBal() { return (await fetch(`${RELAYER}/status`).then(r => r.json())).balance }

async function fund(address, amount) {
  const res = await fetch(`${RELAYER}/fund`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, amount }),
  }).then(r => r.json())
  if (!res.ok) throw new Error('relayer /fund: ' + res.error)
  await sleep(4500)
  return res.signature
}

async function submit(compiledTx, localSigners) {
  const messageBytes = new Uint8Array(compiledTx.messageBytes)
  const seedByAddr = new Map(localSigners.map(s => [s.address, s.seed]))
  const slots = Object.entries(compiledTx.signatures).map(([addr, sig]) => ({ addr, sig: sig ?? null }))
  for (const slot of slots) {
    if (slot.sig) continue
    const seed = seedByAddr.get(slot.addr)
    if (seed) slot.sig = Buffer.from(ed25519.sign(messageBytes, seed)).toString('base64')
  }
  const rAddr = await relayerAddr()
  if (slots.some(s => s.addr === rAddr && !s.sig)) {
    const res = await fetch(`${RELAYER}/relay`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: Buffer.from(messageBytes).toString('base64'), slots }),
    }).then(r => r.json())
    if (!res.ok) throw new Error('relayer /relay: ' + res.error)
    return res.signature
  }
  const unfilled = slots.filter(s => !s.sig)
  if (unfilled.length) throw new Error('no key for ' + unfilled.map(s => s.addr).join(','))
  const wire = Buffer.concat([Buffer.from(messageBytes), ...slots.map(s => Buffer.from(s.sig, 'base64'))])
  return rpc('sendTransaction', [wire.toString('base64'), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' }])
}

async function confirm(sig) {
  for (let i = 0; i < 40; i++) {
    await sleep(1500)
    const st = await rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: false }])
    const s = st?.value?.[0]
    if (s) { if (s.err) throw new Error('tx failed: ' + JSON.stringify(s.err).slice(0, 160)); return s.slot }
  }
  throw new Error('timeout ' + sig)
}

async function register(id, payer) {
  const reg = await zk.buildRegistrationTransaction({
    client, owner: id.address, address: id.shielded.shieldedAddress(), payer,
  })
  if (reg === undefined) return null
  const sig = await submit(reg, [{ address: id.address, seed: id.seed }])
  await confirm(sig)
  return sig
}

async function newIdentity(stage) {
  const id = derive(Array.from(Keypair.generate().secretKey))
  const payer = await relayerAddr()
  await fund(id.address, 0.01)          // fee float, relayer-funded
  await register(id, payer)             // rent, relayer-sponsored
  return id
}

async function deposit(id, burner) {
  const payer = await relayerAddr()
  const dep = await zk.buildDepositTransaction({
    client, feePayer: payer, depositor: burner.address,
    recipient: id.shielded.shieldedAddress(), amount: BigInt(Math.round(AMOUNT * 1e9)),
  })
  const sig = await submit(dep, [{ address: burner.address, seed: burner.seed }])
  const slot = await confirm(sig)
  return { sig, slot }
}

async function syncWallet(id, wallet, slot) {
  const keys = await zk.LocalKeys.fromKeypair(id.shielded, client.proofService)
  await zk.syncWallet({ client, wallet, keys, ...(slot ? { config: { requireSlot: BigInt(slot) } } : {}) })
  return keys
}

async function ghost(id, wallet, keys, recipient, amount) {
  const w = await zk.buildWithdrawalTransaction({
    client, wallet, keys, feePayer: id.address, recipient, amount: BigInt(Math.round(amount * 1e9)),
  })
  const sig = await submit(w, [{ address: id.address, seed: id.seed }])
  const slot = await confirm(sig)
  return { sig, slot }
}

async function accountsOf(sig) {
  let tx = null
  for (let i = 0; i < 8 && !tx; i++) {
    tx = await rpc('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }]).catch(() => null)
    if (!tx) await sleep(2500)
  }
  if (!tx) throw new Error('tx not retrievable yet: ' + sig)
  return tx.transaction.message.accountKeys.map((k, i) => ({
    addr: k.pubkey, signer: k.signer,
    delta: (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / 1e9,
  }))
}

// ── run ─────────────────────────────────────────────────────────────────
const state = existsSync(TEST_FILE) ? JSON.parse(readFileSync(TEST_FILE, 'utf-8')) : {}
state.staged ??= []
state.sends ??= []
state.known ??= []

console.log(`TEST TWO — receiver ${receiver}`)
console.log(`relayer: ${await relayerAddr()} (${await relayerBal()} SOL)`)
console.log(`plan: stage ${DEPTH} candidate inflows · ${SENDS} rotated sends of ${AMOUNT} SOL\n`)

// 1. stage depth
console.log(`── staging ${DEPTH} candidate inflows (each from its own burner) ──`)
while (state.staged.length < DEPTH) {
  const id = await newIdentity()
  const burner = derive(Array.from(Keypair.generate().secretKey))
  await fund(burner.address, AMOUNT + 0.01)
  const { sig } = await deposit(id, burner)
  state.staged.push({ id: id.address, burner: burner.address, deposit: sig })
  state.known.push(id.address, burner.address)
  console.log(`  [${state.staged.length}/${DEPTH}] inflow ${sig.slice(0, 20)}…  burner ${burner.address.slice(0, 8)}…`)
}
writeFileSync(TEST_FILE, JSON.stringify(state, null, 2))

// 2. rotated sends
const results = []
for (let i = state.sends.length; i < SENDS; i++) {
  console.log(`\n── send ${i + 1}/${SENDS} — FRESH identity ──`)
  const id = await newIdentity()
  state.known.push(id.address)
  const burner = derive(Array.from(Keypair.generate().secretKey))
  await fund(burner.address, AMOUNT + 0.01)
  state.known.push(burner.address)

  const { sig: depSig, slot: depSlot } = await deposit(id, burner)
  const wallet = new zk.Wallet({ identity: id.shielded.shieldedAddress() })
  const keys = await syncWallet(id, wallet, depSlot)
  const { sig: outSig, slot } = await ghost(id, wallet, keys, receiver, AMOUNT)
  await syncWallet(id, wallet, slot)

  const accounts = await accountsOf(outSig)
  const initiator = accounts.find(a => a.signer)?.addr
  const payout = accounts.find(a => a.addr === receiver)
  const leaked = accounts.filter(a => state.known.includes(a.addr) && a.addr !== id.address)
  const record = { index: i + 1, identity: id.address, burner: burner.address, deposit: depSig, payout: outSig, initiator, received: payout?.delta ?? 0, leaked: leaked.map(a => a.addr) }
  state.sends.push(record)
  writeFileSync(TEST_FILE, JSON.stringify(state, null, 2))
  console.log(`  payout    : ${outSig}`)
  console.log(`     ${EXPLORER}${outSig}?cluster=devnet`)
  console.log(`  received  : +${record.received} SOL`)
}

// 3. verdict
console.log('\n════ TEST TWO VERDICT ════')
const initiators = state.sends.map(s => s.initiator)
const unique = new Set(initiators).size === initiators.length
const anyLeak = state.sends.some(s => s.leaked.length)
const inflows = state.staged.length
console.log(`candidate inflows in pool : ${inflows}`)
console.log(`payouts                   : ${state.sends.length}`)
console.log(`distinct initiators       : ${new Set(initiators).size}/${initiators.length} ${unique ? '✅ rotation holds' : '❌ identities reused'}`)
console.log(`known-wallet leaks        : ${anyLeak ? '❌ ' + JSON.stringify(state.sends.flatMap(s => s.leaked)) : '✅ none'}`)
console.log(`amount ambiguity          : ${inflows >= state.sends.length ? `✅ ${inflows} inflows of the same size — the join is ambiguous` : '⚠️ not enough depth'}`)
for (const s of state.sends) {
  console.log(`  send ${s.index}: initiator ${s.initiator.slice(0, 8)}…  burner ${s.burner.slice(0, 8)}…  payout ${s.payout.slice(0, 16)}…`)
}
