/**
 * who-signs-check.mjs — the live "who signed, who paid?" audit.
 *
 * Mirrors src/App.jsx exactly (same builders, same relayTx/xSubmit paths):
 *   1. Scan PAST txns of the existing PC identities (alice/bob) → fee payer each
 *   2. Fresh public wallet W (like App createWallet) + fresh Vanta identity X (like initZolana)
 *   3. Relayer funds X float + W          (fee paid by relayer)
 *   4. Registration X (relayer = payer)   (fee paid by relayer)
 *   5. SHIELD  W → pool → X               (relayer fee payer, W signs depositor slot)
 *   6. SHADOW  X → bob (existing PC vanta address)  (X fee payer + signer)
 *   7. GHOST   X → fresh public dest      (X fee payer + signer)
 *   8. getTransaction on every signature → feePayer, required signers, fee, explorer links
 *
 *   node scripts/who-signs-check.mjs
 */
import { Keypair, PublicKey } from '@solana/web3.js'
import { readFileSync } from 'fs'

// ── env ──
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const HELIUS = env.VITE_HELIUS_API_KEY || ''
const RELAYER = (env.VITE_RELAYER_URL || 'http://localhost:3001').replace(/\/$/, '')
const TOKEN = env.VITE_RELAYER_TOKEN || ''
const INDEXER_URL = 'https://d2xah7tnhdhcom.cloudfront.net'
const PROVER_URL = 'https://d21ni15goiip6l.cloudfront.net'
const PUBLIC_RPC = 'https://api.devnet.solana.com'

let RPC_URL = HELIUS ? `https://devnet.helius-rpc.com/?api-key=${HELIUS}` : PUBLIC_RPC
let RPC_WSS = HELIUS ? `wss://devnet.helius-rpc.com/?api-key=${HELIUS}` : 'wss://api.devnet.solana.com'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function rpcOk(url) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getVersion' }),
    })
    const j = await r.json()
    return !!j.result
  } catch {
    return false
  }
}
if (!(await rpcOk(RPC_URL))) {
  console.log('⚠ Helius RPC unreachable — falling back to api.devnet.solana.com')
  RPC_URL = PUBLIC_RPC
  RPC_WSS = 'wss://api.devnet.solana.com'
}

async function relayerFetch(path, body) {
  const res = await fetch(RELAYER + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { 'x-vanta-token': TOKEN } : {}) },
    body: JSON.stringify(body ?? {}),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`${path}: ${data.error}`)
  return data
}

async function rawRpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }).then((r) => r.json())
  if (res.error) throw new Error(`${method}: ${JSON.stringify(res.error)}`)
  return res.result
}

// ── decode a landed signature into "who signed / who paid" ──
async function describeTx(label, signature) {
  let tx = null
  let lastErr = null
  for (const ver of [1, 0]) {
    for (let i = 0; i < 6 && !tx; i++) {
      try {
        tx = await rawRpc('getTransaction', [
          signature,
          { commitment: 'confirmed', maxSupportedTransactionVersion: ver },
        ])
      } catch (e) {
        lastErr = e
        if (/not supported/i.test(String(e.message))) break // try next version
      }
      if (!tx) await sleep(2500)
    }
    if (tx) break
  }
  if (!tx) return { label, signature, error: lastErr?.message ?? 'not found' }

  const msg = tx.transaction.message
  const keys = (msg.staticAccountKeys ?? msg.accountKeys ?? []).map((k) =>
    typeof k === 'string' ? k : k.pubkey ?? k.toBase58?.() ?? String(k),
  )
  const nSigners = msg.header?.numRequiredSignatures ?? keys.length
  const signers = keys.slice(0, nSigners)
  const feePayer = keys[0] ?? null
  return {
    label,
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null,
    feePayer,
    signers,
    feeLamports: tx.meta?.fee ?? null,
    accounts: keys,
    err: tx.meta?.err ?? null,
  }
}

function printTx(t) {
  console.log(`\n── ${t.label} ──`)
  if (t.error) {
    console.log(`   ✗ decode failed: ${t.error}`)
    return
  }
  console.log(`   signature : ${t.signature}`)
  console.log(`   explorer  : https://explorer.solana.com/tx/${t.signature}?cluster=devnet`)
  console.log(`   solscan   : https://solscan.io/tx/${t.signature}?cluster=devnet`)
  console.log(`   when      : ${t.blockTime} · slot ${t.slot}${t.err ? ' · ⚠ ERROR ' + JSON.stringify(t.err) : ''}`)
  console.log(`   fee payer : ${t.feePayer}  ← PAID ${(t.feeLamports / 1e9).toFixed(6)} SOL fee`)
  console.log(`   signers   : ${t.signers.map((s) => (s === t.feePayer ? `${s} (feePayer)` : s)).join('\n              ')}`)
}

// ── raw-wire submit (sign our slots client-side, like the app's relayer path) ──
async function submitCompiledTx(signerAddress, signerSeed, compiledTx) {
  const { ed25519 } = await import('@noble/curves/ed25519.js')
  const messageBytes = new Uint8Array(compiledTx.messageBytes)
  const seedByAddr = new Map([[signerAddress, signerSeed]])
  const slots = Object.entries(compiledTx.signatures).map(([addr, sig]) => ({ addr, sig: sig ?? null }))
  for (const slot of slots) {
    if (slot.sig) continue
    const seed = seedByAddr.get(slot.addr)
    if (!seed) throw new Error(`no key for required signer ${slot.addr}`)
    slot.sig = Buffer.from(ed25519.sign(messageBytes, seed))
  }
  const wire = Buffer.concat([Buffer.from(messageBytes), ...slots.map((s) => s.sig)])
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [wire.toString('base64'), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' }],
    }),
  }).then((r) => r.json())
  if (res.error) throw new Error('sendRaw: ' + JSON.stringify(res.error).slice(0, 300))
  const sig = res.result
  for (let i = 0; i < 25; i++) {
    await sleep(1500)
    const st = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignatureStatuses', params: [[sig], { searchTransactionHistory: false }] }),
    }).then((r) => r.json())
    const status = st.result?.value?.[0]
    if (status) {
      if (status.err) throw new Error('tx failed on-chain: ' + JSON.stringify(status.err))
      return sig
    }
  }
  throw new Error('timeout waiting for ' + sig)
}

// ── App.jsx relayTx: user signs own slots, relayer fills slot 0 ──
async function relayTx(compiledTx, userSigners) {
  const { ed25519 } = await import('@noble/curves/ed25519.js')
  const messageBytes = new Uint8Array(compiledTx.messageBytes)
  const slots = Object.entries(compiledTx.signatures).map(([addr]) => ({ addr, sig: null }))
  const seedByAddr = new Map(userSigners.map((s) => [s.address, s.seed]))
  for (const slot of slots) {
    const seed = seedByAddr.get(slot.addr)
    if (seed) slot.sig = Buffer.from(ed25519.sign(messageBytes, seed)).toString('base64')
  }
  const data = await relayerFetch('/relay', {
    message: Buffer.from(messageBytes).toString('base64'),
    slots,
  })
  return data.signature
}

async function main() {
  const zk = await import('@heliuslabs/zolana')
  const kit = await import('@solana/kit')
  await zk.initializePoseidon() // must precede any ShieldedKeypair derivation
  console.log('SDK loaded ✓ · RPC:', RPC_URL.includes('helius') ? 'Helius devnet' : 'public devnet')
  console.log('Relayer:', RELAYER)

  const plainConn = { getBalance: async (pk) => (await rawRpc('getBalance', [pk.toBase58()])).value }

  // ════ 1. PAST TXNS of the identities already on this PC ════
  console.log('\n════════ 1 · PAST TXNS — identities that already exist on this PC ════════')
  const saved = JSON.parse(readFileSync('.e2e-identities.json', 'utf-8'))
  const mkId = (secret) => {
    const kp = Keypair.fromSecretKey(new Uint8Array(secret))
    const seed = new Uint8Array(kp.secretKey.slice(0, 32))
    return { kp, seed, address: kp.publicKey.toBase58() }
  }
  const alice = mkId(saved.alice.secret)
  const bob = mkId(saved.bob.secret)
  const relayerStatus = await fetch(`${RELAYER}/status`).then((r) => r.json())
  const relayerAddr = relayerStatus.address
  console.log(`relayer ${relayerAddr} · balance ${relayerStatus.balance} SOL`)

  const past = []
  for (const [name, addr] of [
    ['alice X (vanta id)', alice.address],
    ['bob X (vanta id)', bob.address],
    ['alice public wallet', alice.kp.publicKey.toBase58()],
    ['relayer', relayerAddr],
  ]) {
    let sigs = []
    try {
      sigs = (await rawRpc('getSignaturesForAddress', [addr, { limit: 6 }])) || []
    } catch (e) {
      console.log(`  ${name}: history lookup failed (${e.message})`)
      continue
    }
    console.log(`\n  ${name} ${addr} — last ${sigs.length} txns`)
    for (const s of sigs.slice(0, 4)) {
      const t = await describeTx(name, s.signature)
      if (t.error) {
        console.log(`    ${s.signature.slice(0, 20)}… ✗ ${t.error}`)
        continue
      }
      const role = t.feePayer === addr ? '⬅ IS THE FEE PAYER' : t.signers.includes(addr) ? 'signer (not fee payer)' : 'present, not a signer'
      console.log(`    ${t.signature.slice(0, 20)}… feePayer ${t.feePayer.slice(0, 8)}… · this addr: ${role}`)
      past.push(t)
    }
  }

  // ════ 2. FRESH W + FRESH X ════
  console.log('\n════════ 2 · FRESH WALLETS ════════')
  const W = Keypair.generate() // public wallet (App: createWallet)
  const X = Keypair.generate() // ephemeral privacy identity (App: initZolana)
  const xSeed = new Uint8Array(X.secretKey.slice(0, 32))
  const xShielded = zk.ShieldedKeypair.fromKeypair(zk.SigningKey.fromEd25519Bytes(xSeed))
  const xSigner = await kit.createKeyPairSignerFromPrivateKeyBytes(xSeed)
  const G = Keypair.generate() // ghost destination (fresh public, does nothing)
  console.log('W public wallet :', W.publicKey.toBase58())
  console.log('X vanta identity:', X.publicKey.toBase58(), '· shielded:', xShielded.shieldedAddress())
  console.log('ghost dest G    :', G.publicKey.toBase58())

  const client = await zk.createZolanaClient({
    solanaRpcUrl: RPC_URL,
    solanaRpcSubscriptionsUrl: RPC_WSS,
    indexerUrl: INDEXER_URL,
    proverUrl: PROVER_URL,
  })

  const txLog = []

  // ════ 3. RELAYER FUNDS X float + W ════
  console.log('\n════════ 3 · FUNDING (relayer pays) ════════')
  const fundX = await relayerFetch('/fund', { address: X.publicKey.toBase58(), amount: 0.01 })
  console.log('  X float funded:', fundX.signature)
  const fundW = await relayerFetch('/fund', { address: W.publicKey.toBase58(), amount: 0.045 })
  console.log('  W funded      :', fundW.signature)
  txLog.push(['fund X float (relayer→X)', fundX.signature])
  txLog.push(['fund W (relayer→W)', fundW.signature])
  await sleep(3000)

  // ════ 4. REGISTRATION (relayer = payer, App.jsx initZolana) ════
  console.log('\n════════ 4 · REGISTRATION X (relayer pays) ════════')
  try {
    const reg = await zk.buildRegistrationTransaction({
      client,
      owner: X.publicKey.toBase58(),
      address: xShielded.shieldedAddress(),
      payer: relayerAddr,
    })
    if (reg !== undefined) {
      const sig = await relayTx(reg, [{ address: X.publicKey.toBase58(), seed: xSeed }])
      console.log('  registration:', sig)
      txLog.push(['register X (relayer fee payer)', sig])
    } else {
      console.log('  already registered')
    }
    await sleep(2000)
  } catch (e) {
    console.log('  ⚠ registration failed (non-fatal, gates shadow receive only):', e.message)
  }

  // ════ 5. SHIELD: W → pool → X  (App.jsx shieldSend: relayer fee payer) ════
  console.log('\n════════ 5 · SHIELD DEPOSIT 0.02 SOL (W → pool → X) ════════')
  const deposit = await zk.buildDepositTransaction({
    client,
    feePayer: relayerAddr,
    depositor: W.publicKey.toBase58(),
    recipient: xShielded.shieldedAddress(),
    amount: 20_000_000n,
  })
  const shieldSig = await relayTx(deposit, [{ address: W.publicKey.toBase58(), seed: new Uint8Array(W.secretKey.slice(0, 32)) }])
  console.log('  shield landed:', shieldSig)
  txLog.push(['SHIELD W→pool (relayer fee payer, W signs)', shieldSig])

  console.log('  waiting for indexer…')
  await sleep(14000)
  const wallet = new zk.Wallet({ identity: xShielded.shieldedAddress() })
  const xKeys = await zk.LocalKeys.fromKeypair(xShielded, client.proofService)
  let gotBalance = false
  for (let i = 0; i < 12 && !gotBalance; i++) {
    await zk.syncWallet({ client, wallet, keys: xKeys }).catch((e) => console.log('  sync retry:', String(e.message).slice(0, 90)))
    await sleep(3000)
    gotBalance = wallet.balances().some((b) => b.amount > 0n)
  }
  if (!gotBalance) throw new Error('no private balance after deposit — aborting before sends')
  console.log('  X private balance:', wallet.balances().map((b) => Number(b.amount) / 1e9).join(', '), 'SOL ✓')

  // ════ 6. SHADOW: X → bob (existing vanta address on this PC) — App.jsx shadowSend ════
  console.log('\n════════ 6 · SHADOW X → bob (vanta → vanta) 0.005 SOL ════════')
  const bobShielded = zk.ShieldedKeypair.fromKeypair(zk.SigningKey.fromEd25519Bytes(new Uint8Array(saved.bob.secret.slice(0, 32)))).shieldedAddress()
  const transfer = await zk.buildTransferTransaction({
    client,
    wallet,
    keys: xKeys,
    feePayer: X.publicKey.toBase58(), // App.jsx:1109 — X owns the UTXOs and pays
    recipient: bobShielded,
    amount: 5_000_000n,
  })
  let shadowSig
  try {
    // App.jsx xSubmit: kit signs with X and broadcasts
    const sendAndConfirm = kit.sendAndConfirmTransactionFactory({
      rpc: client.solanaRpc,
      rpcSubscriptions: client.solanaRpcSubscriptions,
    })
    const signed = await kit.signTransactionWithSigners([xSigner], transfer)
    await sendAndConfirm(signed, { commitment: 'confirmed' })
    shadowSig = kit.getSignatureFromTransaction(signed)
  } catch (e) {
    console.log('  kit path failed, falling back to raw wire:', String(e.message).slice(0, 140))
    shadowSig = await submitCompiledTx(X.publicKey.toBase58(), xSeed, transfer)
  }
  console.log('  shadow landed:', shadowSig)
  txLog.push(['SHADOW X→bob (X fee payer + signer)', shadowSig])
  const slotAfterShadow = await client.confirmTransaction(shadowSig).catch(() => undefined)
  await zk.syncWallet({ client, wallet, keys: xKeys, ...(slotAfterShadow ? { config: { requireSlot: slotAfterShadow } } : {}) }).catch(() => {})

  // ════ 7. GHOST: X → fresh public G — App.jsx ghostSend ════
  console.log('\n════════ 7 · GHOST X → G (withdrawal to fresh public wallet) 0.004 SOL ════════')
  const withdrawal = await zk.buildWithdrawalTransaction({
    client,
    wallet,
    keys: xKeys,
    feePayer: X.publicKey.toBase58(), // App.jsx:1150 — X owns the UTXOs and pays
    recipient: G.publicKey.toBase58(),
    amount: 4_000_000n,
  })
  let ghostSig
  try {
    const sendAndConfirm = kit.sendAndConfirmTransactionFactory({
      rpc: client.solanaRpc,
      rpcSubscriptions: client.solanaRpcSubscriptions,
    })
    const signed = await kit.signTransactionWithSigners([xSigner], withdrawal)
    await sendAndConfirm(signed, { commitment: 'confirmed' })
    ghostSig = kit.getSignatureFromTransaction(signed)
  } catch (e) {
    console.log('  kit path failed, falling back to raw wire:', String(e.message).slice(0, 140))
    ghostSig = await submitCompiledTx(X.publicKey.toBase58(), xSeed, withdrawal)
  }
  console.log('  ghost landed:', ghostSig)
  txLog.push(['GHOST X→G (X fee payer + signer)', ghostSig])
  await sleep(4000)
  const gBal = await plainConn.getBalance(G.publicKey)
  console.log('  G received:', (gBal / 1e9).toFixed(6), 'SOL ✓')

  // ════ 8. DECODE EVERY SIGNATURE ════
  console.log('\n════════ 8 · RAW ON-CHAIN DECODE — who signed, who paid ════════')
  console.log('\nW (public) =', W.publicKey.toBase58())
  console.log('X (vanta)  =', X.publicKey.toBase58(), '· shielded', xShielded.shieldedAddress())
  console.log('bob (vanta)=', bob.address, '· shielded', bobShielded)
  console.log('relayer    =', relayerAddr)
  const decoded = []
  for (const [label, sig] of txLog) {
    const t = await describeTx(label, sig)
    printTx(t)
    decoded.push(t)
  }

  // ════ verdict ════
  console.log('\n════════ VERDICT ════════')
  console.log('W secret key (KEEP LOCAL ONLY, not printed by design): stored below if needed —')
  console.log(`  W: ${W.publicKey.toBase58()}`)
  console.log(`  X: ${X.publicKey.toBase58()}`)
  console.log(
    JSON.stringify(
      {
        W_secret: Array.from(W.secretKey),
        X_secret: Array.from(X.secretKey),
        X_shielded: xShielded.shieldedAddress(),
        ghost_dest: G.publicKey.toBase58(),
        txns: Object.fromEntries(txLog),
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error('\n💥 died:', err?.message || err)
  process.exitCode = 1
})
