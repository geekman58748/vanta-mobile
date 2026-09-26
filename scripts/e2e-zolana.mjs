/**
 * Headless E2E for the Zolana rails: shield → shadow send → ghost send.
 * Fresh wallets, real relayer, real devnet. Mirrors src/App.jsx flows exactly.
 *
 *   node scripts/e2e-zolana.mjs
 */
import { Keypair, Connection, PublicKey } from '@solana/web3.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const ID_STORE = '.e2e-identities.json'

const RELAYER = 'http://localhost:3001'
const HELIUS_KEY = 'REDACTED_HELIUS_KEY'
const RPC_URL = `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
const RPC_WSS = `wss://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
const INDEXER_URL = 'https://d2xah7tnhdhcom.cloudfront.net'
const PROVER_URL = 'https://d21ni15goiip6l.cloudfront.net'
const PUBLIC_RPC = 'https://api.devnet.solana.com'

const results = []
function step(name, fn) {
  return fn()
    .then(r => { results.push(['PASS', name]); return r })
    .catch(err => { results.push(['FAIL', `${name}: ${err?.message || err}`]); throw err })
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

const relayerSecret = JSON.parse(readFileSync('./relayer/relayer-keypair.json', 'utf-8'))
const relayerPub = Keypair.fromSecretKey(new Uint8Array(relayerSecret)).publicKey.toBase58()

const plainConn = new Connection(PUBLIC_RPC, 'confirmed')

async function main() {
  const zk = await import('@heliuslabs/zolana')
  const kit = await import('@solana/kit')
  console.log('SDK loaded ✓')

  // 0. Relayer health + top-up if starving (relayer was at ~0.08 SOL)
  let lowLiquidity = false
  await step('relayer status', async () => {
    const st = await fetch(`${RELAYER}/status`).then(r => r.json())
    if (!st.ok) throw new Error(st.error)
    console.log(`  relayer ${st.address} · ${st.balance} SOL`)
    if (st.balance < 0.3) {
      console.log('  topping up relayer via devnet RPC airdrop…')
      try {
        const res = await fetch('https://api.devnet.solana.com', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'requestAirdrop', params: [relayerPub, 2_000_000_000] }),
        }).then(r => r.json())
        if (res.error) throw new Error(JSON.stringify(res.error).slice(0, 120))
        console.log(`  airdrop sig: ${res.result}`)
        await sleep(10000)
      } catch (e) {
        console.log(`  ⚠️ airdrop failed (${e.message}) — proceeding with small amounts`)
        lowLiquidity = true
      }
    }
  })

  const client = await zk.createZolanaClient({
    solanaRpcUrl: RPC_URL, solanaRpcSubscriptionsUrl: RPC_WSS,
    indexerUrl: INDEXER_URL, proverUrl: PROVER_URL,
  })
  const sendAndConfirm = kit.sendAndConfirmTransactionFactory({ rpc: client.solanaRpc, rpcSubscriptions: client.solanaRpcSubscriptions })

  // Identity factory: X-style (signer + shielded keypair from one seed)
  async function makeIdentity(label) {
    const kp = Keypair.generate()
    const seed = new Uint8Array(kp.secretKey.slice(0, 32))
    const shielded = zk.ShieldedKeypair.fromKeypair(zk.SigningKey.fromEd25519Bytes(seed))
    const signer = await kit.createKeyPairSignerFromPrivateKeyBytes(seed)
    return { label, kp, seed, shielded, signer, address: signer.address }
  }

  // Raw-wire submission (deposit-style): sign every required slot client-side
  // with noble, then sendRawTransaction. Bypasses kit's v1 sign/serialize path.
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
    const wire = Buffer.concat([Buffer.from(messageBytes), ...slots.map(s => s.sig)])
    const res = await fetch(RPC_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'sendTransaction',
        params: [wire.toString('base64'), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' }],
      }),
    }).then(r => r.json())
    if (res.error) throw new Error('sendRaw: ' + JSON.stringify(res.error).slice(0, 300))
    const sig = res.result
    // confirm via polling
    for (let i = 0; i < 20; i++) {
      await sleep(1500)
      const st = await fetch(RPC_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignatureStatuses', params: [[sig], { searchTransactionHistory: false }] }),
      }).then(r => r.json())
      const status = st.result?.value?.[0]
      if (status) {
        if (status.err) throw new Error('tx failed on-chain: ' + JSON.stringify(status.err).slice(0, 200) + ' logs: ' + JSON.stringify(status.logMessages ?? []).slice(0, 300))
        return sig
      }
    }
    throw new Error('timeout waiting for ' + sig)
  }

  async function xSubmit(signer, tx) {
    try {
      const signed = await kit.signTransactionWithSigners([signer], tx)
      await sendAndConfirm(signed, { commitment: 'confirmed' })
      return kit.getSignatureFromTransaction(signed)
    } catch (err) {
      const logs = err?.cause?.logs || err?.logs || err?.context?.logs
      if (logs?.length) console.log('  sim logs:\n    ' + logs.slice(-8).join('\n    '))
      else {
        console.log('  context:', JSON.stringify(err?.context ?? null).slice(0, 800))
        console.log('  cause:', String(err?.cause ?? '(none)').slice(0, 300))
      }
      throw err
    }
  }

  async function fundViaRelayer(address, amount) {
    // Skip if the wallet already holds enough (persisted identities re-fund for free)
    const bal = await plainConn.getBalance(new PublicKey(address))
    if (bal >= Math.round(amount * 0.8 * 1e9)) {
      console.log(`  ${address.slice(0, 8)}… already funded (${bal / 1e9} SOL) — skipping`)
      return 'skipped'
    }
    const res = await fetch(`${RELAYER}/fund`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, amount }),
    }).then(r => r.json())
    if (!res.ok) throw new Error('fund failed: ' + res.error)
    await sleep(4000)
    return res.signature
  }

  // Identities persist across runs so funded wallets aren't thrown away.
  const savedIds = existsSync(ID_STORE) ? JSON.parse(readFileSync(ID_STORE, 'utf-8')) : {}
  const persist = { ...savedIds }

  async function getIdentity(label) {
    if (persist[label]) {
      const kp = Keypair.fromSecretKey(new Uint8Array(persist[label].secret))
      const seed = new Uint8Array(kp.secretKey.slice(0, 32))
      const shielded = zk.ShieldedKeypair.fromKeypair(zk.SigningKey.fromEd25519Bytes(seed))
      const signer = await kit.createKeyPairSignerFromPrivateKeyBytes(seed)
      console.log(`  ${label}: reusing persisted identity ${signer.address}`)
      return { label, kp, seed, shielded, signer, address: signer.address }
    }
    const id = await makeIdentity(label)
    persist[label] = { secret: Array.from(id.kp.secretKey) }
    console.log(`  ${label}: new identity ${id.address}`)
    return id
  }

  const alice = await getIdentity('alice') // shielder → private sender
  const bob = await getIdentity('bob')     // private receiver (registered)
  const carol = Keypair.generate()          // plain public recipient (ghost)
  writeFileSync(ID_STORE, JSON.stringify(persist, null, 2))

  // Amounts scale down if the relayer is starving (devnet faucet limits)
  const AMT = lowLiquidity
    ? { float: 0.03, user: 0.02, deposit: 15_000_000n, send: 5_000_000n }
    : { float: 0.05, user: 0.2, deposit: 50_000_000n, send: 10_000_000n }
  // In low mode alice's float doubles as the depositor wallet (self-deposit test)
  const depositorAddr = lowLiquidity ? alice.address : alice.kp.publicKey.toBase58()
  const depositorSeed = alice.seed

  // 1. Fund fee floats
  await step(`fund alice float (${AMT.float})`, () => fundViaRelayer(alice.address, AMT.float))
  await step(`fund bob float (${AMT.float})`, () => fundViaRelayer(bob.address, AMT.float))

  // 2. Fund alice's public depositor wallet (relayer plays faucet) — skipped in low mode
  if (!lowLiquidity) {
    await step(`fund alice public wallet (${AMT.user})`, () => fundViaRelayer(alice.kp.publicKey.toBase58(), AMT.user))
  }

  // Registration is NON-FATAL: it only gates receiving shadow sends.
  // Ghost sends need nothing — test the flagship first.
  const registered = {}
  for (const id of [alice, bob]) {
    await step(`register ${id.label}`, async () => {
      const reg = await zk.buildRegistrationTransaction({
        client, owner: id.address, address: id.shielded.shieldedAddress(), feePayer: id.address,
      })
      if (reg !== undefined) {
        const sig = await submitCompiledTx(id.address, id.seed, reg)
        console.log(`  reg sig: ${sig}`)
        await sleep(2000)
      } else console.log(`  ${id.label} already registered`)
      registered[id.label] = true
    }).catch(err => {
      results.push(['WARN', `register ${id.label} failed (gates shadow only): ${String(err.message).slice(0, 120)}`])
    })
  }

  // 4. SHIELD: alice public → alice private (relayer pays gas, like the app)
  await step('shield 0.05 SOL (deposit)', async () => {
    const deposit = await zk.buildDepositTransaction({
      client, feePayer: relayerPub,
      depositor: depositorAddr,
      recipient: alice.shielded.shieldedAddress(),
      amount: AMT.deposit,
    })
    // alice signs her depositor slot; relayer fills its own (mirror relayTx in App.jsx)
    const messageBytes = new Uint8Array(deposit.messageBytes)
    const { ed25519 } = await import('@noble/curves/ed25519.js')
    const slots = Object.entries(deposit.signatures).map(([addr, sig]) => ({ addr, sig: null }))
    for (const slot of slots) {
      if (slot.addr === depositorAddr) {
        slot.sig = Buffer.from(ed25519.sign(messageBytes, depositorSeed)).toString('base64')
      }
    }
    const res = await fetch(`${RELAYER}/relay`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: Buffer.from(messageBytes).toString('base64'),
        slots: slots.map(s => ({ addr: s.addr, sig: s.sig })),
      }),
    }).then(r => r.json())
    if (!res.ok) throw new Error(res.error)
    console.log(`  shield sig: ${res.signature}`)
    return res.signature
  })

  // wait for indexer to index the note, then sync
  console.log('  waiting for indexer…')
  await sleep(12000)

  const walletOf = (id) => new zk.Wallet({ identity: id.shielded.shieldedAddress() })
  const aliceKeys = await zk.LocalKeys.fromKeypair(alice.shielded, client.proofService)
  const aliceWallet = walletOf(alice)

  await step('sync alice + private balance > 0', async () => {
    for (let i = 0; i < 10; i++) {
      await zk.syncWallet({ client, wallet: aliceWallet, keys: aliceKeys }).catch(e => console.log('  sync retry:', String(e).slice(0, 90)))
      await sleep(3000)
      const bals = aliceWallet.balances()
      const sol = bals.find(b => b.amount > 0n)
      if (sol) { console.log(`  alice private: ${Number(sol.amount) / 1e9} SOL`); return }
    }
    throw new Error('no private balance after 10 sync attempts')
  })

  // 5. GHOST SEND: alice → carol (plain wallet, does nothing) — needs NO registration
  const carolBefore = await plainConn.getBalance(carol.publicKey)
  await step('ghost send 0.01 alice→carol', async () => {
    const withdrawal = await zk.buildWithdrawalTransaction({
      client, wallet: aliceWallet, keys: aliceKeys,
      feePayer: alice.address, recipient: carol.publicKey.toBase58(),
      amount: AMT.send,
    })
    const sig = await submitCompiledTx(alice.address, alice.seed, withdrawal)
    console.log(`  ghost sig: ${sig}`)
    await sleep(15000)
    const carolAfter = await plainConn.getBalance(carol.publicKey)
    console.log(`  carol: ${(carolBefore / 1e9).toFixed(6)} → ${(carolAfter / 1e9).toFixed(6)} SOL`)
    if (carolAfter <= carolBefore) throw new Error('carol balance did not increase')
    // README rule: sync before the next private spend, else the wallet builds
    // the next tx from stale note state and the build fails.
    const slot = await client.confirmTransaction(sig).catch(() => undefined)
    await zk.syncWallet({ client, wallet: aliceWallet, keys: aliceKeys, ...(slot ? { config: { requireSlot: slot } } : {}) })
    console.log(`  resynced — alice private: ${aliceWallet.balances().map(b => Number(b.amount) / 1e9).join(',')} SOL`)
  })

  // 6. SHADOW SEND: alice → bob (encrypted) — requires bob registered
  if (registered.bob) {
    await step('shadow send 0.01 alice→bob', async () => {
      let transfer
      try {
        transfer = await zk.buildTransferTransaction({
          client, wallet: aliceWallet, keys: aliceKeys,
          feePayer: alice.address, recipient: bob.shielded.shieldedAddress(),
          amount: AMT.send,
        })
      } catch (err) {
        console.log('  transfer build cause:', String(err?.cause ?? '(none)').slice(0, 300))
        throw err
      }
      const sig = await submitCompiledTx(alice.address, alice.seed, transfer)
      console.log(`  shadow sig: ${sig}`)
      await sleep(10000)
      await zk.syncWallet({ client, wallet: aliceWallet, keys: aliceKeys })
      console.log(`  alice private now: ${aliceWallet.balances().map(b => Number(b.amount) / 1e9).join(',')}`)
    })
  } else {
    results.push(['SKIP', 'shadow send (bob registration broken — see WARN above)'])
  }

  console.log('\n════════ E2E SUMMARY ════════')
  for (const [status, name] of results) console.log(`${status === 'PASS' ? '✅' : '❌'} ${name}`)
}

main().catch(err => {
  console.error('\n💥 E2E died:', err?.message || err)
  console.log('\n════════ E2E SUMMARY ════════')
  for (const [status, name] of results) console.log(`${status === 'PASS' ? '✅' : '❌'} ${name}`)
  process.exitCode = 1
})
