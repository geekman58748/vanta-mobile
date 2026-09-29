/**
 * Does the dUSDC (USDC) Shield actually work?
 *
 * Mirrors src/App.jsx `shield()` for token !== 'SOL' step for step:
 *   ATA derivation, buildDepositTransaction({ asset, splTokenAccount }),
 *   depositor signs its own slot, relayer fills only its fee-payer slot,
 *   POST /relay, then confirm on chain and read the private balance back.
 *
 * dUSDC comes from the upstream Umbra devnet faucet (the same mint we hardcode).
 *
 * The other two legs of the dUSDC story are here too, because a deposit that
 * cannot be spent is not a working token rail. Ghost and Shadow differ from the
 * deposit in the one way that matters: X owns the UTXOs and pays the fee, so the
 * relayer is not in the transaction at all.
 *
 *   node scripts/usdc-deposit-check.mjs probe     # who holds what
 *   node scripts/usdc-deposit-check.mjs deposit   # public -> private
 *   node scripts/usdc-deposit-check.mjs ghost     # private -> a public wallet
 *   node scripts/usdc-deposit-check.mjs shadow    # private -> a Vanta wallet
 *   node scripts/usdc-deposit-check.mjs sends     # ghost then shadow, both verified
 */
import { Keypair, Connection, PublicKey } from '@solana/web3.js'
import { readFileSync, existsSync, writeFileSync } from 'fs'

const MINT = '4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7'
const DUSDC_DECIMALS = 6
const PUBLIC_RPC = 'https://api.devnet.solana.com'
const UMBRA_FAUCET = 'https://faucet.umbraprivacy.com/api/faucet'
const ID_STORE = '.e2e-identities.json'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const HELIUS = env.VITE_HELIUS_API_KEY ?? ''
const RELAYER = (env.VITE_RELAYER_URL || 'http://localhost:3001').replace(/\/+$/, '')
const FAUCET = (env.VITE_FAUCET_URL || '').replace(/\/+$/, '')
const RELAYER_TOKEN = env.VITE_RELAYER_TOKEN || ''
const RPC_URL = HELIUS ? `https://devnet.helius-rpc.com/?api-key=${HELIUS}` : PUBLIC_RPC
const RPC_WSS = HELIUS ? `wss://devnet.helius-rpc.com/?api-key=${HELIUS}` : ''

const conn = new Connection(RPC_URL, 'confirmed')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The identity under test. Persisted so a re-run does not burn the faucet's
// 60-minute per-wallet window.
function identity() {
  const saved = existsSync(ID_STORE) ? JSON.parse(readFileSync(ID_STORE, 'utf-8')) : {}
  if (process.argv.includes('--fresh')) delete saved.usdc
  if (!saved.usdc) {
    const kp = Keypair.generate()
    saved.usdc = { secret: Array.from(kp.secretKey) }
    writeFileSync(ID_STORE, JSON.stringify(saved, null, 2))
    console.log('new identity', kp.publicKey.toBase58())
  }
  const kp = Keypair.fromSecretKey(new Uint8Array(saved.usdc.secret))
  return { kp, seed: new Uint8Array(kp.secretKey.slice(0, 32)), address: kp.publicKey.toBase58() }
}

async function dusdcOf(owner) {
  const res = await conn.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(MINT) })
  let total = 0n
  for (const { account } of res.value) {
    total += BigInt(account.data.parsed.info.tokenAmount.amount)
  }
  return total
}

/** A second identity, so a Shadow has a real recipient rather than self-send. */
function identityNamed(name) {
  const saved = existsSync(ID_STORE) ? JSON.parse(readFileSync(ID_STORE, 'utf-8')) : {}
  if (!saved[name]) {
    const kp = Keypair.generate()
    saved[name] = { secret: Array.from(kp.secretKey) }
    writeFileSync(ID_STORE, JSON.stringify(saved, null, 2))
    console.log(`new identity ${name}`, kp.publicKey.toBase58())
  }
  const kp = Keypair.fromSecretKey(new Uint8Array(saved[name].secret))
  return { kp, seed: new Uint8Array(kp.secretKey.slice(0, 32)), address: kp.publicKey.toBase58() }
}

async function probe() {
  const id = identity()
  console.log(`wallet  ${id.address}`)
  console.log(`SOL     ${(await conn.getBalance(id.kp.publicKey) / 1e9).toFixed(6)}`)
  console.log(`dUSDC   ${await dusdcOf(id.kp.publicKey)} raw`)

  console.log('\n-- wallets we hold keys for --')
  const known = {}
  for (const [name, file] of [['relayer', 'relayer/relayer-keypair.json'], ['faucet', 'faucet/faucet-keypair.json']]) {
    known[name] = Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(file, 'utf-8'))))
  }
  const ids = existsSync(ID_STORE) ? JSON.parse(readFileSync(ID_STORE, 'utf-8')) : {}
  for (const [name, rec] of Object.entries(ids)) known[`e2e-${name}`] = Keypair.fromSecretKey(new Uint8Array(rec.secret))
  for (const [name, kp] of Object.entries(known)) {
    const sol = await conn.getBalance(kp.publicKey)
    console.log(`  ${name.padEnd(12)} ${kp.publicKey.toBase58()}  ${(sol / 1e9).toFixed(4)} SOL  dUSDC=${await dusdcOf(kp.publicKey)}`)
  }
}

/**
 * Register dUSDC with the pool.
 *
 * The pool keeps a per-mint `spl_asset_registry` entry and `spl_asset_vault`,
 * and without them a deposit's settlement accounts are unowned -> the program
 * rejects it with InvalidSettlementAccounts (7009 / 0x1b61). Those accounts are
 * created by an admin-shaped instruction, CreateSplInterface (tag 7), which this
 * devnet protocol config marks `splInterfaceCreationIsPermissionless: true`.
 *
 * No mint had ever been registered for dUSDC, which is why the Shield failed
 * even with tokens in hand. This runs once; afterwards the accounts exist.
 */
async function ensureSplInterface(kp) {
  const { PublicKey, Transaction, TransactionInstruction, SystemProgram } = await import('@solana/web3.js')
  const pool = new PublicKey('sppU489D7A4U1exNo1oeMGZtLEofq3a6o2fR7UeoWB6')
  const mint = new PublicKey(MINT)
  const pda = (seeds) => PublicKey.findProgramAddressSync(seeds, pool)
  const [registry] = pda([Buffer.from('spl_asset_registry'), mint.toBuffer()])
  const [vault] = pda([Buffer.from('spl_asset_vault'), mint.toBuffer()])
  const [counter] = pda([Buffer.from('spl_asset_counter')])
  const [protocolConfig] = pda([Buffer.from('protocol_config')])

  if (await conn.getAccountInfo(registry)) {
    console.log('spl interface already registered')
    return
  }
  const ix = new TransactionInstruction({
    programId: pool,
    keys: [
      { pubkey: kp.publicKey, isSigner: true, isWritable: true },   // authority
      { pubkey: protocolConfig, isSigner: false, isWritable: false },
      { pubkey: counter, isSigner: false, isWritable: true },
      { pubkey: registry, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isSigner: false, isWritable: false },
    ],
    data: Buffer.from([7]), // InstructionTag.createSplInterface
  })
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed')
  const tx = new Transaction({ feePayer: kp.publicKey, blockhash, lastValidBlockHeight }).add(ix)
  tx.sign(kp)
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false })
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
  console.log(`registered dUSDC with the pool (sig ${sig})`)
}

/** Create the dUSDC ATA if it is missing, paying rent from our own wallet. */
async function ensureAta(kp) {
  const { getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction } = await import('@solana/spl-token')
  const { Transaction } = await import('@solana/web3.js')
  const ata = await getAssociatedTokenAddress(new PublicKey(MINT), kp.publicKey)
  const info = await conn.getAccountInfo(ata)
  if (info) {
    console.log(`ATA ${ata.toBase58()} already exists`)
    return ata
  }
  const ix = createAssociatedTokenAccountIdempotentInstruction(kp.publicKey, ata, kp.publicKey, new PublicKey(MINT))
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed')
  const tx = new Transaction({ feePayer: kp.publicKey, blockhash, lastValidBlockHeight }).add(ix)
  tx.sign(kp)
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false })
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
  console.log(`ATA created ${ata.toBase58()} (sig ${sig})`)
  return ata
}

/** Ask the Umbra faucet for 1,000 dUSDC. */
async function claimDusdc(address) {
  const res = await fetch(UMBRA_FAUCET, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet: address, token: 'dUSDC' }),
  }).then((r) => r.json())
  if (res.error) throw new Error(`umbra faucet: ${res.error}`)
  return res
}

/** Vanta's own faucet pays the network fee only. */
async function claimSol(address) {
  if (!FAUCET) throw new Error('VITE_FAUCET_URL not set')
  const res = await fetch(`${FAUCET}/faucet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vanta-token': RELAYER_TOKEN },
    body: JSON.stringify({ address }),
  }).then((r) => r.json())
  if (!res.ok) throw new Error(`vanta faucet: ${res.error}`)
  return res
}

async function relayDeposit(compiled, depositorAddr, depositorSeed) {
  const { ed25519 } = await import('@noble/curves/ed25519.js')
  const messageBytes = new Uint8Array(compiled.messageBytes)
  const slots = Object.entries(compiled.signatures).map(([addr]) => ({ addr, sig: null }))
  for (const slot of slots) {
    if (slot.addr === depositorAddr) {
      slot.sig = Buffer.from(ed25519.sign(messageBytes, depositorSeed)).toString('base64')
    }
  }
  const res = await fetch(`${RELAYER}/relay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vanta-token': RELAYER_TOKEN },
    body: JSON.stringify({
      message: Buffer.from(messageBytes).toString('base64'),
      slots,
    }),
  }).then((r) => r.json())
  if (!res.ok) throw new Error(`relay: ${res.error}`)
  return res.signature
}

async function deposit() {
  const zk = await import('@heliuslabs/zolana')
  const kit = await import('@solana/kit')
  const id = identity()
  console.log(`wallet ${id.address}`)

  // 1. Network fee, from Vanta's faucet (SOL only, as in the app).
  const solBefore = await conn.getBalance(id.kp.publicKey)
  if (solBefore < 5_000_000) {
    console.log('claiming SOL for fees…')
    try {
      const r = await claimSol(id.address)
      console.log(`  faucet sig ${r.signature}`)
    } catch (e) {
      // The deployed faucet occasionally dies on its own RPC call. The relayer's
      // /fund is the other SOL path the app already uses, so fall back to it.
      console.log(`  vanta faucet failed (${e.message}) — falling back to relayer /fund`)
      const r = await fetch(`${RELAYER}/fund`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-vanta-token': RELAYER_TOKEN },
        body: JSON.stringify({ address: id.address, amount: 0.05 }),
      }).then((x) => x.json())
      if (!r.ok) throw new Error(`relayer /fund: ${r.error}`)
      console.log(`  fund sig ${r.signature}`)
    }
    await sleep(6000)
  }
  console.log(`SOL ${(await conn.getBalance(id.kp.publicKey) / 1e9).toFixed(6)}`)

  // 2. The token itself, from the upstream Umbra faucet (our faucet has no SPL).
  let dusdc = await dusdcOf(id.kp.publicKey)
  if (dusdc === 0n) {
    // The faucet's fee payer is the mint authority itself, and it funds the ATA
    // out of its own balance. That wallet runs near empty, so a fresh recipient
    // pushes it below the rent-exempt floor and the whole drip fails with
    // "insufficient funds for rent". Creating the ATA here — with SOL we already
    // hold — turns their tx into a pure mintTo that needs no rent debit.
    await ensureAta(id.kp)
    console.log('claiming 1,000 dUSDC from Umbra faucet…')
    const r = await claimDusdc(id.address)
    console.log(' ', JSON.stringify(r).slice(0, 300))
    for (let i = 0; i < 20 && dusdc === 0n; i++) {
      await sleep(3000)
      dusdc = await dusdcOf(id.kp.publicKey)
    }
  }
  console.log(`dUSDC ${dusdc} raw`)
  if (dusdc === 0n) throw new Error('no dUSDC arrived from the faucet')

  // 3. Client, exactly as App.jsx / e2e build it.
  const client = await zk.createZolanaClient({
    solanaRpcUrl: RPC_URL,
    solanaRpcSubscriptionsUrl: RPC_WSS,
    indexerUrl: 'https://d2xah7tnhdhcom.cloudfront.net',
    proverUrl: 'https://d21ni15goiip6l.cloudfront.net',
  })
  const shielded = zk.ShieldedKeypair.fromKeypair(zk.SigningKey.fromEd25519Bytes(id.seed))
  const signer = await kit.createKeyPairSignerFromPrivateKeyBytes(id.seed)
  console.log(`shielded ${shielded.shieldedAddress()}`)

  // 4. Registration gates nothing for a deposit, but App.jsx does it at onboarding.
  const reg = await zk.buildRegistrationTransaction({
    client, owner: signer.address, address: shielded.shieldedAddress(), feePayer: signer.address,
  })
  if (reg !== undefined) {
    console.log('registering shielded address…')
    const { ed25519 } = await import('@noble/curves/ed25519.js')
    const mb = new Uint8Array(reg.messageBytes)
    const sigs = Object.entries(reg.signatures).map(([addr, sig]) => ({
      addr, sig: sig ?? (addr === signer.address ? Buffer.from(ed25519.sign(mb, id.seed)).toString('base64') : null),
    }))
    const wire = Buffer.concat([Buffer.from(mb), ...sigs.map((s) => Buffer.from(s.sig, 'base64'))])
    const out = await fetch(RPC_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [wire.toString('base64'), { encoding: 'base64' }] }),
    }).then((r) => r.json())
    if (out.error) console.log('  registration:', JSON.stringify(out.error).slice(0, 200))
    else console.log('  reg sig', out.result)
    await sleep(4000)
  } else console.log('already registered')

  // 4b. Private state as it stands BEFORE the deposit. The check at the end is on
  //     the delta: comparing the total only held while the wallet was empty, so a
  //     second deposit onto an existing private balance reported a false failure.
  const keys = await zk.LocalKeys.fromKeypair(shielded, client.proofService)
  const wallet = new zk.Wallet({ identity: shielded.shieldedAddress() })
  await zk.syncWallet({ client, wallet, keys }).catch((e) => console.log('  pre-sync:', String(e).slice(0, 120)))
  const privBefore = wallet.balances().find((b) => b.mint === MINT)?.amount ?? 0n
  console.log(`private dUSDC before ${privBefore} raw`)

  // 5. THE DEPOSIT — the SPL branch of App.jsx shield(), verbatim in shape.
  await ensureSplInterface(id.kp)
  const { getAssociatedTokenAddress } = await import('@solana/spl-token')
  const ata = await getAssociatedTokenAddress(new PublicKey(MINT), id.kp.publicKey)
  console.log(`source ATA ${ata.toBase58()}`)

  const amount = 10n * 10n ** BigInt(DUSDC_DECIMALS) // the drawer's 10 dUSDC preset
  const relayerInfo = await fetch(`${RELAYER}/status`).then((r) => r.json())
  const depositTx = await zk.buildDepositTransaction({
    client,
    feePayer: relayerInfo.address,
    depositor: id.address,
    recipient: shielded.shieldedAddress(),
    amount,
    asset: MINT,
    splTokenAccount: ata.toBase58(),
  })
  console.log(`built deposit: ${amount} raw dUSDC, feePayer ${relayerInfo.address}`)

  const sig = await relayDeposit(depositTx, id.address, id.seed)
  console.log(`relay sig ${sig}`)

  // 6. Confirm on chain, then read the private balance back.
  let landed = null
  for (let i = 0; i < 30 && !landed; i++) {
    await sleep(2000)
    const st = await fetch(RPC_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignatureStatuses', params: [[sig], { searchTransactionHistory: true }] }),
    }).then((r) => r.json())
    const v = st.result?.value?.[0]
    if (v) {
      if (v.err) throw new Error(`on-chain failure: ${JSON.stringify(v.err)}`)
      landed = v
    }
  }
  if (!landed) throw new Error('deposit never confirmed')
  console.log('CONFIRMED on chain')

  const tx = await fetch(RPC_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }] }),
  }).then((r) => r.json())
  const parsed = tx.result?.transaction?.message?.instructions ?? []
  console.log('instructions:', parsed.map((i) => `${i.program}:${i.parsed?.type ?? 'raw'}`).join(' | '))

  console.log('waiting for indexer…')
  let balances = []
  let privAfter = privBefore
  for (let i = 0; i < 15; i++) {
    await zk.syncWallet({ client, wallet, keys }).catch((e) => console.log('  sync retry:', String(e).slice(0, 120)))
    await sleep(4000)
    balances = wallet.balances()
    privAfter = balances.find((b) => b.mint === MINT)?.amount ?? 0n
    if (privAfter >= privBefore + amount) break
  }
  console.log('private balances:', balances.map((b) => `${b.mint}=${b.amount}`).join(' ') || '(none)')
  console.log(`\nRESULT private dUSDC = ${privAfter} raw (was ${privBefore}, deposited ${amount})`)
  if (privAfter - privBefore !== amount) throw new Error('private dUSDC did not rise by the deposited amount')
  console.log('USDC DEPOSIT WORKS')
}

// ── Shared plumbing for the two spend paths ──────────────────────────────────
// Everything below mirrors App.jsx's non-deposit branch: one identity is both
// the shielded owner X and the fee payer, which is why the SDK takes `feePayer`
// from the signing key rather than from the relayer.

const ZOLANA_CONFIG = {
  indexerUrl: 'https://d2xah7tnhdhcom.cloudfront.net',
  proverUrl: 'https://d21ni15goiip6l.cloudfront.net',
}

async function openContext(zk, id) {
  const kit = await import('@solana/kit')
  const client = await zk.createZolanaClient({
    solanaRpcUrl: RPC_URL,
    solanaRpcSubscriptionsUrl: RPC_WSS,
    ...ZOLANA_CONFIG,
  })
  const shielded = zk.ShieldedKeypair.fromKeypair(zk.SigningKey.fromEd25519Bytes(id.seed))
  const signer = await kit.createKeyPairSignerFromPrivateKeyBytes(id.seed)
  const keys = await zk.LocalKeys.fromKeypair(shielded, client.proofService)
  const wallet = new zk.Wallet({ identity: shielded.shieldedAddress() })
  return { kit, client, shielded, signer, keys, wallet }
}

/** Pull private state from the indexer. Required before any spend. */
async function syncPrivate(zk, ctx, tries = 12) {
  let balances = []
  for (let i = 0; i < tries; i++) {
    await zk.syncWallet({ client: ctx.client, wallet: ctx.wallet, keys: ctx.keys })
      .catch((e) => console.log('  sync retry:', String(e).slice(0, 120)))
    await sleep(4000)
    balances = ctx.wallet.balances()
    if (balances.some((b) => b.amount > 0n)) break
  }
  return balances
}

/** X pays its own fee on Ghost and Shadow, so it needs a little SOL of its own. */
async function ensureXFloat(address, min = 2_000_000) {
  const bal = await conn.getBalance(new PublicKey(address))
  if (bal >= min) {
    console.log(`X fee float ${(bal / 1e9).toFixed(6)} SOL — enough`)
    return
  }
  console.log(`X fee float ${(bal / 1e9).toFixed(6)} SOL — funding via relayer /fund`)
  const res = await fetch(`${RELAYER}/fund`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vanta-token': RELAYER_TOKEN },
    body: JSON.stringify({ address, amount: 0.01 }),
  }).then((r) => r.json())
  if (!res.ok) throw new Error(`relayer /fund: ${res.error}`)
  console.log('  fund sig', res.signature)
  await sleep(8000)
}

/** App.jsx's xSubmit: X signs its own slot and broadcasts; no relayer involved. */
async function xSubmit(kit, client, signer, tx) {
  const sendAndConfirm = kit.sendAndConfirmTransactionFactory({
    rpc: client.solanaRpc,
    rpcSubscriptions: client.solanaRpcSubscriptions,
  })
  const signed = await kit.signTransactionWithSigners([signer], tx)
  await sendAndConfirm(signed, { commitment: 'confirmed' })
  return kit.getSignatureFromTransaction(signed)
}

/** Register a shielded address on chain, so a Shadow can be sent to it. */
async function registerShielded(zk, ctx, id) {
  const reg = await zk.buildRegistrationTransaction({
    client: ctx.client,
    owner: ctx.signer.address,
    address: ctx.shielded.shieldedAddress(),
    feePayer: ctx.signer.address,
  })
  if (reg === undefined) {
    console.log('shielded address already registered')
    return null
  }
  const { ed25519 } = await import('@noble/curves/ed25519.js')
  const mb = new Uint8Array(reg.messageBytes)
  const sigs = Object.entries(reg.signatures).map(([addr, sig]) => ({
    addr,
    sig: sig ?? (addr === ctx.signer.address ? Buffer.from(ed25519.sign(mb, id.seed)).toString('base64') : null),
  }))
  const wire = Buffer.concat([Buffer.from(mb), ...sigs.map((s) => Buffer.from(s.sig, 'base64'))])
  const out = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [wire.toString('base64'), { encoding: 'base64' }] }),
  }).then((r) => r.json())
  if (out.error) throw new Error(`registration: ${JSON.stringify(out.error).slice(0, 300)}`)
  console.log('  reg sig', out.result)
  await sleep(6000)
  return out.result
}

/**
 * Ghost — private dUSDC to a public wallet.
 *
 * The recipient is a plain Solana address with no Vanta account, so this also
 * proves the pool can fund a wallet that has never been registered: the payout
 * arrives from the pool, not from the sender.
 */
async function ghost(amountRaw) {
  const zk = await import('@heliuslabs/zolana')
  const id = identity()
  const dest = identityNamed('usdcGhostDest')
  const ctx = await openContext(zk, id)
  console.log(`X (sender) ${id.address}`)
  console.log(`ghost destination ${dest.address}`)

  const privateBefore = await syncPrivate(zk, ctx)
  const held = privateBefore.find((b) => b.mint === MINT)?.amount ?? 0n
  console.log(`private dUSDC before ${held} raw`)
  if (held < amountRaw) {
    throw new Error(`private dUSDC ${held} < ${amountRaw}; run \`deposit\` first`)
  }

  await ensureXFloat(id.address)
  const destBefore = await dusdcOf(dest.kp.publicKey)

  const withdrawal = await zk.buildWithdrawalTransaction({
    client: ctx.client,
    wallet: ctx.wallet,
    keys: ctx.keys,
    feePayer: ctx.signer.address,
    recipient: dest.address,
    amount: amountRaw,
    asset: MINT,
  })
  const sig = await xSubmit(ctx.kit, ctx.client, ctx.signer, withdrawal)
  console.log(`ghost sig ${sig}`)
  await ctx.client.confirmTransaction(sig).catch((e) => console.log('  confirm:', String(e).slice(0, 120)))

  // The payout is public, so it is checkable without syncing anything.
  let after = destBefore
  for (let i = 0; i < 20 && after === destBefore; i++) {
    await sleep(3000)
    after = await dusdcOf(dest.kp.publicKey)
  }
  console.log(`destination public dUSDC ${destBefore} -> ${after}`)
  if (after - destBefore !== amountRaw) {
    throw new Error(`ghost delivered ${after - destBefore}, expected ${amountRaw}`)
  }

  const privateAfter = await syncPrivate(zk, ctx)
  const left = privateAfter.find((b) => b.mint === MINT)?.amount ?? 0n
  console.log(`private dUSDC after ${left} raw (spent ${held - left})`)
  console.log('USDC GHOST SEND WORKS')
  return { sig, dest }
}

/**
 * Shadow — private dUSDC to another Vanta account.
 *
 * The recipient is given as its plain Solana owner address; the SDK resolves the
 * registered shielded address from the on-chain registry, which is why the
 * recipient has to be registered first.
 */
async function shadow(amountRaw) {
  const zk = await import('@heliuslabs/zolana')
  const id = identity()
  const peer = identityNamed('usdcShadowPeer')
  const ctx = await openContext(zk, id)
  const peerCtx = await openContext(zk, peer)
  console.log(`X (sender) ${id.address}`)
  console.log(`shadow recipient owner ${peer.address}`)

  // The recipient must exist in the on-chain registry for the resolve to work.
  await ensureXFloat(peer.address)
  await registerShielded(zk, peerCtx, peer)

  const privateBefore = await syncPrivate(zk, ctx)
  const held = privateBefore.find((b) => b.mint === MINT)?.amount ?? 0n
  console.log(`private dUSDC before ${held} raw`)
  if (held < amountRaw) {
    throw new Error(`private dUSDC ${held} < ${amountRaw}; run \`deposit\` first`)
  }
  await ensureXFloat(id.address)

  const transfer = await zk.buildTransferTransaction({
    client: ctx.client,
    wallet: ctx.wallet,
    keys: ctx.keys,
    feePayer: ctx.signer.address,
    recipient: peer.address,
    amount: amountRaw,
    asset: MINT,
  })
  const sig = await xSubmit(ctx.kit, ctx.client, ctx.signer, transfer)
  console.log(`shadow sig ${sig}`)
  await ctx.client.confirmTransaction(sig).catch((e) => console.log('  confirm:', String(e).slice(0, 120)))

  // Only the recipient's own spend key can see this arrive — which is the point.
  const peerBalances = await syncPrivate(zk, peerCtx)
  const arrived = peerBalances.find((b) => b.mint === MINT)?.amount ?? 0n
  console.log(`recipient private dUSDC ${arrived} raw`)
  if (arrived < amountRaw) {
    throw new Error(`shadow delivered ${arrived}, expected at least ${amountRaw}`)
  }

  const privateAfter = await syncPrivate(zk, ctx)
  const left = privateAfter.find((b) => b.mint === MINT)?.amount ?? 0n
  console.log(`sender private dUSDC after ${left} raw (spent ${held - left})`)
  console.log('USDC SHADOW SEND WORKS')
  return { sig }
}

/** Both spends in one run, on one already-funded private balance. */
async function sends() {
  const oneRaw = 10n ** BigInt(DUSDC_DECIMALS) // 1 dUSDC
  await ghost(oneRaw)
  console.log('')
  await shadow(oneRaw)
}

const mode = process.argv[2] ?? 'probe'
try {
  if (mode === 'probe') await probe()
  else if (mode === 'ghost') await ghost(BigInt(process.argv[3] ?? 1) * 10n ** BigInt(DUSDC_DECIMALS))
  else if (mode === 'shadow') await shadow(BigInt(process.argv[3] ?? 1) * 10n ** BigInt(DUSDC_DECIMALS))
  else if (mode === 'sends') await sends()
  else await deposit()
} catch (err) {
  console.error(`\nFAILED: ${err?.message ?? err}`)
  if (err?.cause) console.error('cause:', String(err.cause).slice(0, 500))
  process.exitCode = 1
}
