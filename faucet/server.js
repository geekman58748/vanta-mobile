/**
 * Vanta Devnet Faucet — standalone service.
 *
 * Gives a judge whose wallet is empty enough SOL to try Shield, Shadow and
 * Ghost. It runs as its own process with its own wallet, deliberately
 * SEPARATE from the relayer:
 *
 *  - The relayer pays NETWORK FEES from its fee float. It never grants funds.
 *  - This service pays GRANTS only, from faucet-keypair.json. Draining it is
 *    structurally incapable of touching the relayer's fee float — different
 *    process, different key, different wallet.
 *
 * Endpoints:
 *   POST /faucet  — { address } → transfer FAUCET_SOL (token-gated)
 *   GET  /status  — address, balance, caps (public, read-only)
 *   GET  /address — faucet pubkey (public, read-only)
 *   GET  /healthz — liveness (public, no RPC call)
 *
 * Caps (env-tunable, see .env.example):
 *   FAUCET_SOL                 — per-claim grant           (default 0.2)
 *   FAUCET_MAX_PER_ADDRESS_SOL — lifetime cap per address  (default 0.2)
 *   FAUCET_BUDGET_SOL          — per-process budget ledger (default 2)
 *
 * Honest residual: the per-address/budget ledger is in-memory and resets on
 * restart. The only hard cap is the faucet wallet's actual balance — fund it
 * with only what you are willing to lose.
 */

// Loads relayer/.env + .env.local (the same files as the relayer, so local dev
// has one place to configure everything). No-op when NODE_ENV=production,
// where real env vars are platform secrets.
import '../relayer/env.js'

import express from 'express'
import cors from 'cors'
import { Keypair, Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FAUCET_KEYPAIR_PATH = join(__dirname, 'faucet-keypair.json')

const PORT = Number(process.env.FAUCET_PORT || 3002)
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const isProd = process.env.NODE_ENV === 'production'

// Token gate: abuse-deterrence, not authentication (it ships in the APK).
// FAUCET_TOKEN first so this service can rotate independently; falls back to
// the relayer's shared token so the client's existing x-vanta-token works.
const TOKEN = (process.env.FAUCET_TOKEN || process.env.RELAYER_TOKEN || '').trim()

// ── Caps ────────────────────────────────────────────────────────────
// Tight defaults on purpose: a judge needs ~0.1 SOL to Shield 0.05–0.1 plus
// the network fee, so 0.2 covers a full try. The budget ledger is per-process
// (in-memory, resets on restart); the wallet balance is the real backstop.
const FAUCET_SOL = Number(process.env.FAUCET_SOL ?? 0.2)
const FAUCET_MAX_PER_ADDRESS_SOL = Number(process.env.FAUCET_MAX_PER_ADDRESS_SOL ?? 0.2)
const FAUCET_BUDGET_SOL = Number(process.env.FAUCET_BUDGET_SOL ?? 2)
const FAUCET_MAX_ADDRESS_LAMPORTS = Math.round(FAUCET_MAX_PER_ADDRESS_SOL * LAMPORTS_PER_SOL)
const FAUCET_BUDGET_LAMPORTS = Math.round(FAUCET_BUDGET_SOL * LAMPORTS_PER_SOL)

// ── Load the faucet keypair ────────────────────────────────────────
// FAUCET_KEYPAIR (a JSON secret-key array) takes priority so hosts can inject
// it as a secret; the on-disk file is the local-dev fallback. This key signs
// nothing except faucet claims — it never touches the relayer.
function loadFaucetKeypair() {
  const fromEnv = (process.env.FAUCET_KEYPAIR || '').trim()
  if (fromEnv) {
    try {
      return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fromEnv)))
    } catch (err) {
      throw new Error(`FAUCET_KEYPAIR is set but could not be parsed (JSON secret-key array): ${err.message}`)
    }
  }
  if (existsSync(FAUCET_KEYPAIR_PATH)) {
    const secret = JSON.parse(readFileSync(FAUCET_KEYPAIR_PATH, 'utf-8'))
    return Keypair.fromSecretKey(new Uint8Array(secret))
  }
  return null
}

const faucetKeypair = loadFaucetKeypair()
const FAUCET_ADDR = faucetKeypair ? faucetKeypair.publicKey.toBase58() : null
const connection = new Connection(RPC_URL, 'confirmed')

// ── In-memory per-address ledger ───────────────────────────────────
// In-memory on purpose: persisting judge addresses next to amounts would
// rebuild exactly the linkage the history tables deliberately dropped
// (AUDIT-2026-09-27 C2). Losing the ledger on restart only means the faucet
// reopens, which is a fine trade for a devnet demo.
const faucetLedger = new Map()
let globalFaucetLamports = 0

function takeFaucetSlot(address, lamports) {
  const given = faucetLedger.get(address) ?? 0
  if (given + lamports > FAUCET_MAX_ADDRESS_LAMPORTS) {
    return { ok: false, error: `This address has already claimed its ${FAUCET_MAX_PER_ADDRESS_SOL} SOL` }
  }
  if (globalFaucetLamports + lamports > FAUCET_BUDGET_LAMPORTS) {
    return { ok: false, error: 'Faucet budget exhausted — fund the faucet wallet on devnet' }
  }
  faucetLedger.set(address, given + lamports)
  globalFaucetLamports += lamports
  return { ok: true, spent: given + lamports }
}

/** Give the allowance back when the transfer never made it on chain. */
function refundFaucetSlot(address, lamports) {
  const next = Math.max(0, (faucetLedger.get(address) ?? 0) - lamports)
  if (next === 0) faucetLedger.delete(address)
  else faucetLedger.set(address, next)
  globalFaucetLamports = Math.max(0, globalFaucetLamports - lamports)
}

// ── Express ────────────────────────────────────────────────────────
const app = express()

const origins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
app.use(
  cors(
    origins.length
      ? { origin: origins, methods: ['GET', 'POST'] }
      : // No allowlist configured: appassets.androidplatform.net is the bundled
        // APK origin, and localhost covers dev. Native WebViews send no Origin
        // header at all, so requests without one must be allowed through.
        { origin: ['https://appassets.androidplatform.net', /^http:\/\/localhost(:\d+)?$/], methods: ['GET', 'POST'] },
  ),
)
app.use(express.json({ limit: '16kb' }))

// Gate the grant behind the shared token. Same pattern as the relayer.
function requireToken(req, res, next) {
  if (!TOKEN) return next() // dev mode — warned about at boot
  const provided = req.get('x-vanta-token') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!provided || provided !== TOKEN) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }
  next()
}

app.get('/healthz', (req, res) => res.json({ ok: true }))

app.get('/status', async (req, res) => {
  if (!faucetKeypair) return res.json({ ok: true, address: null, configured: false })
  try {
    const balance = await connection.getBalance(faucetKeypair.publicKey)
    res.json({
      ok: true,
      configured: true,
      address: FAUCET_ADDR,
      balance: balance / LAMPORTS_PER_SOL,
      network: 'devnet',
      caps: { perClaim: FAUCET_SOL, perAddress: FAUCET_MAX_PER_ADDRESS_SOL, budget: FAUCET_BUDGET_SOL },
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.get('/address', (req, res) => {
  res.json({ address: FAUCET_ADDR })
})

// ── Faucet: fixed grant to the connected public wallet ─────────────
// `Connection.requestAirdrop` is rate-limited by the public devnet faucet and
// spent most of the demo failing with -32603, so this moves the money out of
// the dedicated faucet wallet instead. Token-gated like the relayer's
// spending endpoints — abuse deterrence, not authentication, since the token
// ships in the APK. The money comes from FAUCET_KEYPAIR only.
app.post('/faucet', requireToken, async (req, res) => {
  try {
    if (!faucetKeypair) {
      return res.status(503).json({
        ok: false,
        error: 'Faucet not configured: set FAUCET_KEYPAIR or faucet/faucet-keypair.json',
      })
    }

    const { address } = req.body
    if (!address) return res.status(400).json({ ok: false, error: 'Missing address' })

    let toPubkey
    try {
      toPubkey = new PublicKey(address)
    } catch {
      return res.status(400).json({ ok: false, error: 'Invalid address' })
    }

    const lamports = Math.round(FAUCET_SOL * LAMPORTS_PER_SOL)

    const balance = await connection.getBalance(faucetKeypair.publicKey)
    if (balance < lamports + 10000) {
      return res.status(503).json({
        ok: false,
        error: `Faucet is empty (${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL). Fund ${FAUCET_ADDR} on devnet.`,
      })
    }

    const slot = takeFaucetSlot(address, lamports)
    if (!slot.ok) return res.status(429).json({ ok: false, error: slot.error })

    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: faucetKeypair.publicKey, toPubkey, lamports }),
      )
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      tx.recentBlockhash = blockhash
      tx.lastValidBlockHeight = lastValidBlockHeight
      tx.feePayer = faucetKeypair.publicKey
      tx.sign(faucetKeypair)

      const sig = await connection.sendRawTransaction(tx.serialize())
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
      // Deliberately NOT recorded. A faucet claim is not a payment, and
      // persisting judge addresses here would rebuild exactly the linkage the
      // history tables dropped (AUDIT-2026-09-27 C2). The in-memory ledger and
      // this log line are the whole record.
      console.log(
        `Faucet ${address.slice(0, 8)}... +${FAUCET_SOL} SOL (from ${String(FAUCET_ADDR).slice(0, 8)}...)`,
      )

      res.json({
        ok: true,
        signature: sig,
        amount: FAUCET_SOL,
        remaining: Number(((FAUCET_MAX_ADDRESS_LAMPORTS - slot.spent) / LAMPORTS_PER_SOL).toFixed(6)),
      })
    } catch (err) {
      refundFaucetSlot(address, lamports)
      throw err
    }
  } catch (err) {
    console.error('Faucet error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Boot ────────────────────────────────────────────────────────────
// Refuse broken configs loudly rather than serving a button that404s for
// every judge.
if (isProd && !TOKEN) {
  console.error('✗ Refusing to run in production without a token (FAUCET_TOKEN or RELAYER_TOKEN).')
  process.exit(1)
}
if (isProd && !faucetKeypair) {
  console.error('✗ Refusing to run in production without a faucet keypair (FAUCET_KEYPAIR or faucet/faucet-keypair.json).')
  process.exit(1)
}

app.listen(PORT, () => {
  console.log(`\n🚰  Vanta Faucet listening on :${PORT}`)
  console.log(`   Wallet:  ${FAUCET_ADDR ?? '(none — /faucet returns 503)'}`)
  console.log(`   Network: ${RPC_URL}`)
  console.log(`   Caps:    ${FAUCET_SOL} SOL/claim, ${FAUCET_MAX_PER_ADDRESS_SOL} SOL/address, ${FAUCET_BUDGET_SOL} SOL budget/process`)
  if (!TOKEN) {
    console.warn(
      '\n   ⚠  No token — /faucet is UNAUTHENTICATED.\n' +
        '      Fine on localhost. NEVER deploy it this way.\n',
    )
  }
  if (faucetKeypair) {
    connection
      .getBalance(faucetKeypair.publicKey)
      .then((b) => console.log(`   Balance: ${(b / LAMPORTS_PER_SOL).toFixed(4)} SOL`))
      .catch((err) => console.log(`   Balance: unavailable (${err.message})`))
  }
})
