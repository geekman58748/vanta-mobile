/**
 * Vanta Privacy Relayer
 *
 * Holds a funded devnet wallet. Clients sign their owner slot with kit,
 * then send the raw message + empty-slot addresses here. The relayer
 * signs ONLY its own fee-payer slot (slot 0) with node:crypto and
 * submits the raw v1 wire bytes: [message][sig slot0][sig slot1]...
 *
 * POST /relay   — { message: base64, slots: [{addr, sig}] } (empty slots, fee payer first)
 * POST /fund    — { address, amount } → sends SOL from relayer wallet
 * GET  /status  — health + balance        (public, read-only)
 * GET  /address — relayer pubkey          (public, read-only)
 * GET  /healthz — liveness for the platform probe (public, no RPC call)
 *
 * ── SECURITY MODEL ────────────────────────────────────────────────────
 * Two different kinds of gate, deliberately:
 *
 *  1. SPENDING (/relay, /fund, /names/claim) → shared RELAYER_TOKEN. Without it
 *     deployed publicly, /fund is an open faucet: anyone can drain the relayer
 *     by POSTing an address. The token is abuse-deterrence, not authentication.
 *
 *  2. PER-IDENTITY DATA (/tx/report, /tx/:address) → an Ed25519 signature by the
 *     address the row belongs to, with no shared secret involved. This is the
 *     fix for AUDIT-2026-09-27 C1: the history endpoints used to be token-gated,
 *     but the token ships inside the APK, so anyone who unzipped it could read
 *     the recipient and amount of every Shadow send. Because the read/write
 *     proof uses the identity's OWN key — which never leaves the device — an
 *     extracted bundle grants nothing.
 *     · POST /tx/report  { signature, flow, actor, proof }
 *       proof signs  "vanta-report:<signature>:<actor>"
 *     · GET  /tx/:address?ts=<ms>&sig=<b58>
 *       sig signs    "vanta-history:<address>:<ts>"  (ts must be < 5 min old)
 *
 *  3. Nothing here stores an amount or a recipient any more. The relayer keeps
 *     a receipt ANCHOR — signature, flow, actor, time, verified_on_chain — which
 *     is all the receipt UI needs and all ActivityDrawer promises its users
 *     ("never the amount or the recipient"). See schema.sql.
 *
 * Deliberate limitations, stated so nobody mistakes this for hardened infra:
 *  - The token is a shared secret embedded in the client bundle, so it deters
 *    scanners and casual abuse, not a determined attacker. It now protects only
 *    the spending endpoints; the data endpoints are identity-signed. A leaked
 *    token is a capped faucet drain (see the /fund caps), not a privacy breach.
 *  - Rate limits are per-process and in-memory: they reset on redeploy and do
 *    not coordinate across machines. Run one machine.
 *  - Program-ID validation parses the v1 message's static account keys. If the
 *    parse fails we log and allow, because a parser bug would otherwise brick
 *    the demo. A crafted malformed message is therefore *not* rejected here.
 *    Disable the whole check with RELAYER_ENFORCE_PROGRAMS=0.
 */

// NOTE: must come first. ESM evaluates imports in source order, and db.js reads
// DATABASE_URL — loading env after it would leave the database unconfigured.
import './env.js'
import express from 'express'
import cors from 'cors'
import { Keypair, Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import crypto from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import * as db from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEYPAIR_PATH = join(__dirname, 'relayer-keypair.json')

const PORT = Number(process.env.RELAYER_PORT || 3001)
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'

// ── Config ────────────────────────────────────────────────────────
const TOKEN = (process.env.RELAYER_TOKEN || '').trim()
const isProd = process.env.NODE_ENV === 'production'
const ENFORCE_PROGRAMS = process.env.RELAYER_ENFORCE_PROGRAMS !== '0'

// The two programs that identify a Vanta transaction. Also used to infer the
// flow of a relayed tx: registration touches the registry, a shield does not.
const POOL_PROGRAM = 'sppU489D7A4U1exNo1oeMGZtLEofq3a6o2fR7UeoWB6'
const REGISTRY_PROGRAM = 'regyS5rkAcw2YzDJCmTwCTHs2s246FXxbmuRZ42u2PD'

// Signed-data proof prefixes. MUST match src/lib/identityProof.js — these strings
// are the whole wire contract between the app and this verification.
const REPORT_PREFIX = 'vanta-report:'
const HISTORY_PREFIX = 'vanta-history:'
const PROOF_MAX_AGE_MS = 5 * 60 * 1000

// Programs the relayer is willing to co-sign for. Anything else is refused.
const ALLOWED_PROGRAMS = (
  process.env.RELAYER_ALLOWED_PROGRAMS ||
  [
    POOL_PROGRAM, // shieldz shielded-pool
    REGISTRY_PROGRAM, // user registry
    '11111111111111111111111111111111', // system program (rent / transfers)
    'ComputeBudget111111111111111111111111111111',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // spl-token
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // associated token account
  ].join(',')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const allowedProgramSet = new Set(ALLOWED_PROGRAMS)

// /fund caps — the endpoint that actually moves money.
const MAX_FUND_SOL = Number(process.env.RELAYER_MAX_FUND_SOL ?? 0.05)
const FUND_WINDOW_MS = Number(process.env.RELAYER_FUND_WINDOW_MS ?? 60 * 60 * 1000)
const MAX_FUND_PER_WINDOW = Number(process.env.RELAYER_FUND_MAX_PER_WINDOW ?? 10)
const MAX_FUND_LAMPORTS_PER_WINDOW = Number(
  process.env.RELAYER_FUND_LAMPORTS_PER_WINDOW ?? 0.5 * LAMPORTS_PER_SOL,
)

// ── Ed25519 via node:crypto — bypasses web3's serialize() entirely ──
function ed25519KeyObject(seed32) {
  const prefix = Buffer.from('302e020100300506032b657004220420', 'hex')
  return crypto.createPrivateKey({
    key: Buffer.concat([prefix, Buffer.from(seed32)]),
    format: 'der',
    type: 'pkcs8',
  })
}

// ── Load the relayer keypair ──────────────────────────────────────
// RELAYER_KEYPAIR (a JSON secret-key array or a base58 string) takes priority so
// hosts can inject it as a secret; the on-disk file is the local-dev fallback.
function loadKeypair() {
  const fromEnv = (process.env.RELAYER_KEYPAIR || '').trim()
  if (fromEnv) {
    try {
      if (fromEnv.startsWith('[')) {
        return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fromEnv)))
      }
      return Keypair.fromSecretKey(new Uint8Array(bs58Decode(fromEnv)))
    } catch (err) {
      throw new Error(`RELAYER_KEYPAIR is set but could not be parsed: ${err.message}`)
    }
  }
  if (isProd) {
    // Never auto-generate in production: a silent fresh keypair is a funded-
    // looking relayer with zero balance, and the failure would look like an
    // RPC problem rather than a config one.
    throw new Error(
      'RELAYER_KEYPAIR must be set in production (JSON secret-key array or base58). ' +
        'Set it as a platform secret — do not bake it into the image.',
    )
  }
  if (existsSync(KEYPAIR_PATH)) {
    const secret = JSON.parse(readFileSync(KEYPAIR_PATH, 'utf-8'))
    return Keypair.fromSecretKey(new Uint8Array(secret))
  }
  console.warn('⚠  No RELAYER_KEYPAIR and no relayer-keypair.json — generating a dev-only key.')
  const generated = Keypair.generate()
  writeFileSync(KEYPAIR_PATH, JSON.stringify(Array.from(generated.secretKey)))
  return generated
}

const relayerKeypair = loadKeypair()
const connection = new Connection(RPC_URL, 'confirmed')
const RELAYER_ADDR = relayerKeypair.publicKey.toBase58()
const relayerKeyObj = ed25519KeyObject(relayerKeypair.secretKey.slice(0, 32))

// ── Minimal base58 (only needed to accept a base58 keypair from env) ──
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function bs58Decode(str) {
  const bytes = [0]
  for (const ch of str) {
    const value = B58_ALPHABET.indexOf(ch)
    if (value === -1) throw new Error(`invalid base58 character '${ch}'`)
    let carry = value
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58
      bytes[i] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  for (let i = 0; i < str.length && str[i] === '1'; i++) bytes.push(0)
  return bytes.reverse()
}

// ── v1 message parsing (static account keys) ──────────────────────
// Layout: [0x81][header: 3][compact-u16 keyCount][keyCount × 32 bytes]…
function readCompactU16(buf, offset) {
  let value = 0
  let shift = 0
  let i = offset
  for (;;) {
    const byte = buf[i++]
    if (byte === undefined) throw new Error('truncated compact-u16')
    value |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return { value, offset: i }
    shift += 7
    if (shift > 21) throw new Error('compact-u16 too long')
  }
}

function staticAccountKeysFromV1Message(msg) {
  const version = msg[0]
  if (version !== 0x81) throw new Error(`not a v1 message (first byte 0x${version?.toString(16)})`)
  let off = 1 + 3 // version byte + message header
  const { value: keyCount, offset } = readCompactU16(msg, off)
  off = offset
  if (keyCount === 0 || keyCount > 64) throw new Error(`implausible static key count ${keyCount}`)
  if (msg.length < off + keyCount * 32 + 32) throw new Error('message too short for declared keys')
  const keys = []
  for (let i = 0; i < keyCount; i++) {
    keys.push(new PublicKey(msg.subarray(off + i * 32, off + (i + 1) * 32)).toBase58())
  }
  return keys
}

// ── Per-identity proofs ───────────────────────────────────────────
/**
 * True when `signature` (base58, 64 bytes) is a valid Ed25519 signature of
 * `message` by `address` (base58, 32 bytes). Never throws.
 */
function verifyProof(address, message, signature) {
  if (!address || !signature) return false
  try {
    const publicKey = Buffer.from(bs58Decode(String(address)))
    const sigBytes = Buffer.from(bs58Decode(String(signature)))
    if (publicKey.length !== 32 || sigBytes.length !== 64) return false
    return db.verifyEd25519(publicKey, message, sigBytes)
  } catch {
    return false
  }
}

/** A proof timestamp must be recent, so a captured one expires. */
function isFreshTs(ts) {
  const value = Number(ts)
  return Number.isFinite(value) && Math.abs(Date.now() - value) <= PROOF_MAX_AGE_MS
}

// ── In-memory per-IP sliding window for /fund ─────────────────────
const fundWindows = new Map()
let globalFundLamports = 0

function takeFundSlot(ip, lamports) {
  const now = Date.now()
  const hits = (fundWindows.get(ip) || []).filter((t) => now - t.at < FUND_WINDOW_MS)
  const spent = hits.reduce((sum, t) => sum + t.lamports, 0)
  if (hits.length >= MAX_FUND_PER_WINDOW) {
    return { ok: false, error: `Rate limit: max ${MAX_FUND_PER_WINDOW} /fund calls per window` }
  }
  if (spent + lamports > MAX_FUND_LAMPORTS_PER_WINDOW) {
    return { ok: false, error: 'Rate limit: per-IP SOL allowance for this window is exhausted' }
  }
  if (globalFundLamports + lamports > MAX_FUND_LAMPORTS_PER_WINDOW * 20) {
    return { ok: false, error: 'Relayer global /fund budget exhausted for this window' }
  }
  hits.push({ at: now, lamports })
  fundWindows.set(ip, hits)
  globalFundLamports += lamports
  return { ok: true }
}

// ── Express ───────────────────────────────────────────────────────
const app = express()
app.set('trust proxy', 1)

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
app.use(express.json({ limit: '256kb' }))

// Gate spending endpoints behind the shared token.
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
  try {
    const balance = await connection.getBalance(relayerKeypair.publicKey)
    let database = { configured: false }
    try {
      database = await db.health()
    } catch (err) {
      database = { configured: true, ok: false, error: err.message }
    }
    res.json({
      ok: true,
      address: RELAYER_ADDR,
      balance: balance / LAMPORTS_PER_SOL,
      network: 'devnet',
      database,
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.get('/address', (req, res) => {
  res.json({ address: RELAYER_ADDR })
})

// ── Relay endpoint: fill relayer-owned slots & submit ─────────────
// Body: { message: base64, slots: [{ addr, sig: base64|null }, ...] }
// slots = the tx's required-signer list IN WIRE ORDER (fee payer first).
// sig=null → this relayer signs it IF addr matches; otherwise the tx is refused.
// v1 wire layout (kit v8): [messageBytes][sig slot0][sig slot1]...
app.post('/relay', requireToken, async (req, res) => {
  try {
    const { message, slots } = req.body
    if (!message || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ ok: false, error: 'Expected { message: base64, slots: [{addr, sig}] }' })
    }
    if (slots.length > 8) {
      return res.status(400).json({ ok: false, error: 'Too many signer slots' })
    }

    const msgBytes = new Uint8Array(Buffer.from(message, 'base64'))
    if (msgBytes.length === 0 || msgBytes.length > 1400) {
      return res.status(400).json({ ok: false, error: 'Message size out of range' })
    }

    // The relayer must be the fee payer, or it has no reason to co-sign.
    if (slots[0].addr !== RELAYER_ADDR) {
      return res.status(400).json({ ok: false, error: 'Relayer must be the fee payer (slot 0)' })
    }

    // Only relay for the programs Vanta actually uses. The parsed key list is
    // kept for the history row so we can see what a tx actually touched.
    let touchedPrograms = []
    if (ENFORCE_PROGRAMS) {
      try {
        const keys = staticAccountKeysFromV1Message(msgBytes)
        touchedPrograms = keys.filter((k) => allowedProgramSet.has(k))
        if (touchedPrograms.length === 0) {
          console.warn(`  ✗ refused: no allowlisted program among ${keys.length} static keys`)
          return res.status(400).json({ ok: false, error: 'Transaction does not touch an allowed program' })
        }
      } catch (err) {
        // Fail open: a parser bug must not brick the demo. See the header note.
        console.warn(`  ⚠ program check skipped (${err.message})`)
      }
    }

    console.log(`\n── Relay request: ${slots.length} slot(s) ──`)

    // Sign the message once; reuse for every relayer-owned slot
    const relayerSig = new Uint8Array(crypto.sign(null, msgBytes, relayerKeyObj))

    // Resolve every slot
    const wireSigs = slots.map(({ addr, sig }) => {
      if (sig) {
        const s = new Uint8Array(Buffer.from(sig, 'base64'))
        if (s.length !== 64) throw new Error(`Bad sig length for ${addr}`)
        return s
      }
      if (addr === RELAYER_ADDR) return relayerSig
      throw new Error(`Unfilled slot for ${addr} — not the relayer, refusing`)
    })
    if (!slots.some(({ addr, sig }) => addr === RELAYER_ADDR && !sig)) {
      return res.status(400).json({ ok: false, error: `Relayer ${RELAYER_ADDR} has no empty slot in this tx` })
    }

    // Assemble trailing-sig wire
    const wire = new Uint8Array(msgBytes.length + 64 * wireSigs.length)
    wire.set(msgBytes, 0)
    wireSigs.forEach((s, i) => wire.set(s, msgBytes.length + 64 * i))

    const txid = await connection.sendRawTransaction(Buffer.from(wire), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    })
    console.log(`  Submitted: ${txid}`)

    const { lastValidBlockHeight } = await connection.getLatestBlockhash()
    const conf = await connection.confirmTransaction({ signature: txid, lastValidBlockHeight }, 'confirmed')
    console.log(`  Confirmed ✓ err: ${JSON.stringify(conf.value.err)}`)

    // Record history. Must never fail the relay — the tx already landed.
    const signerAddrs = slots.map((s) => s.addr)
    const actors = signerAddrs.filter((a) => a !== RELAYER_ADDR)
    recordSafe({
      signature: txid,
      status: conf.value.err ? 'failed' : 'confirmed',
      error: conf.value.err ? JSON.stringify(conf.value.err) : null,
      // Best guess from the programs touched; the client can refine it.
      flow: touchedPrograms.includes(REGISTRY_PROGRAM) ? 'register' : 'shield',
      flowSource: 'relayer',
      relayerFeePayer: RELAYER_ADDR,
      actors,
      primaryActor: actors[0] ?? null,
      programs: touchedPrograms,
    })

    res.json({ ok: true, signature: txid, actors, flow: touchedPrograms.includes(REGISTRY_PROGRAM) ? 'register' : 'shield' })
  } catch (err) {
    console.error('Relay error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Fund endpoint: send SOL from relayer to an address ────────────
// This is the only endpoint that moves the relayer's own money. It is capped in
// three ways: per-request size, per-IP sliding window, and a global budget.
app.post('/fund', requireToken, async (req, res) => {
  try {
    const { address, amount } = req.body
    if (!address) return res.status(400).json({ ok: false, error: 'Missing address' })

    let toPubkey
    try {
      toPubkey = new PublicKey(address)
    } catch {
      return res.status(400).json({ ok: false, error: 'Invalid address' })
    }

    const requested = Number(amount ?? 0.05)
    if (!Number.isFinite(requested) || requested <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid amount' })
    }
    if (requested > MAX_FUND_SOL) {
      return res.status(400).json({ ok: false, error: `Amount exceeds per-request cap of ${MAX_FUND_SOL} SOL` })
    }
    const lamports = Math.round(requested * LAMPORTS_PER_SOL)

    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    const slot = takeFundSlot(ip, lamports)
    if (!slot.ok) return res.status(429).json({ ok: false, error: slot.error })

    const balance = await connection.getBalance(relayerKeypair.publicKey)
    if (balance < lamports + 10000) {
      return res.status(400).json({ ok: false, error: `Relayer insufficient: ${balance / LAMPORTS_PER_SOL} SOL` })
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: relayerKeypair.publicKey, toPubkey, lamports }),
    )
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.lastValidBlockHeight = lastValidBlockHeight
    tx.feePayer = relayerKeypair.publicKey
    tx.sign(relayerKeypair)

    const sig = await connection.sendRawTransaction(tx.serialize())
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
    console.log(`Funded ${address.slice(0, 8)}... with ${requested} SOL`)

    // No amount, no counterparty — the anchor is enough (AUDIT-2026-09-27 C2).
    recordSafe({
      signature: sig,
      status: 'confirmed',
      flow: 'fund',
      flowSource: 'relayer',
      relayerFeePayer: RELAYER_ADDR,
      actors: [address],
      primaryActor: address,
    })

    res.json({ ok: true, signature: sig, amount: requested })
  } catch (err) {
    console.error('Fund error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Transaction history ───────────────────────────────────────────────

/** Fire-and-forget DB write. A Neon blip must never break the money path. */
function recordSafe(row) {
  if (!db.isEnabled()) return
  db.recordTransaction(row).catch((err) => console.error('[db] record failed:', err.message))
}

/**
 * Confirm a signature exists on-chain. Returns null when it can't be checked
 * (unknown signature, or an RPC that won't decode a v1 transaction) — callers
 * must treat null as "unverified", never as "valid".
 *
 * Verified live on devnet: for a real Shield tx this returns 5 static account
 * keys with the device wallet as fee payer, matching HANDOFF.md §4.3.
 */
async function lookupSignature(signature) {
  try {
    // ⚠ maxSupportedTransactionVersion MUST be 1, not the usual 0.
    //
    // Zolana compiles every builder to a v1 transaction (version byte 0x81), and
    // the standard `0` value makes the RPC refuse to decode them:
    //   "Transaction version (1) is not supported by the requesting client."
    // That failure is indistinguishable from "signature not found", so with 0
    // every Zolana tx would silently read as unverified forever. This is the
    // RPC-client twin of the v1 wallet-signing trap in HANDOFF.md §4.1.
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 1,
    })
    if (!tx) return null
    const msg = tx.transaction?.message ?? {}
    const keys = msg.staticAccountKeys ?? msg.accountKeys ?? []
    return {
      slot: tx.slot ?? null,
      blockTime: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null,
      accounts: keys.map((k) => (typeof k === 'string' ? k : k.toBase58?.() ?? String(k))),
    }
  } catch (err) {
    console.warn(`[tx] on-chain lookup failed for ${signature.slice(0, 12)}…: ${err.message}`)
    return null
  }
}

/**
 * History for one address.
 *
 * Identity-gated, not token-gated: the caller must sign with the very key whose
 * history it is. A token would be useless here because the token ships in the
 * APK — that is exactly how the amounts and recipients of Shadow sends used to
 * be readable by anyone who unzipped the bundle (AUDIT-2026-09-27 C1).
 *
 * Auth is checked BEFORE the configured check so an unsigned request gets an
 * honest 401 whether or not a database is attached.
 */
app.get('/tx/:address', async (req, res) => {
  const address = req.params.address
  const { ts, sig } = req.query
  if (!sig || !isFreshTs(ts)) {
    return res.status(401).json({
      ok: false,
      error: 'This endpoint requires a recent signature by the key it reads (ts, sig)',
    })
  }
  if (!verifyProof(address, `${HISTORY_PREFIX}${address}:${ts}`, sig)) {
    return res.status(401).json({ ok: false, error: 'Proof signature does not match the requested address' })
  }
  if (!db.isEnabled()) return res.json({ ok: true, configured: false, transactions: [] })
  try {
    const transactions = await db.listTransactions(address, { limit: req.query.limit })
    res.json({ ok: true, configured: true, count: transactions.length, transactions })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

/**
 * Client-reported transaction. Shadow, Ghost and plain sends never touch the
 * relayer (X pays its own fees), so this is how they reach the history — and it
 * is why they are stored as client-reported until the chain lookup confirms
 * them. `verified_on_chain` is the honest flag for the receipt UI.
 *
 * Identity-signed, and it carries no amount and no recipient (AUDIT C1/C2). The
 * body is deliberately tiny: a signature, which flow it was, the address it
 * belongs to, and a proof that the reporter holds that address's key.
 */
app.post('/tx/report', async (req, res) => {
  const { signature, flow, actor, proof, intent } = req.body ?? {}
  if (!signature || typeof signature !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing signature' })
  }
  if (flow && !db.FLOWS.includes(flow)) {
    return res.status(400).json({ ok: false, error: `Unknown flow '${flow}'` })
  }
  if (!actor || !proof) {
    return res.status(401).json({ ok: false, error: 'A report must be signed by the address it is filed under' })
  }
  if (!verifyProof(actor, `${REPORT_PREFIX}${signature}:${actor}`, proof)) {
    return res.status(401).json({ ok: false, error: 'Proof signature does not match actor' })
  }
  if (!db.isEnabled()) return res.json({ ok: true, configured: false, stored: false })

  try {
    const onChain = await lookupSignature(signature)

    // The proof says who is reporting; the chain says whether the claim is real.
    // A transaction that does not include the signer is REFUSED rather than
    // attributed to whoever its first signer happens to be — otherwise anyone
    // could file a stranger's signature and plant a row in their history.
    //
    // Shield is the one exception, and it has to be. A deposit is funded by the
    // user's PUBLIC wallet and lands a note for X, but X is never a static
    // account of the deposit (verified on chain 2026-09-28: signature
    // 3tH33fUPHi…, 5 static keys, device wallet + pool present, X absent). So a
    // shield report could NEVER pass this guard from the client — which is why
    // every Shield row in the table is `flow_source='relayer'` (only the relayer
    // ever observed one itself) and a device-wallet Shield receipt was stuck at
    // "Not checked" no matter how many times it was re-opened.
    //
    // The abuse this guard exists for does not apply here: the reporter has
    // already proved it holds X's key, the transaction provably touches the pool
    // program, and the row stores no amount and no recipient. A false claim
    // could only pollute the claimant's own book.
    const isShieldDeposit = flow === 'shield' && onChain.accounts.includes(POOL_PROGRAM)
    if (onChain && !onChain.accounts.includes(actor) && !isShieldDeposit) {
      return res.status(403).json({ ok: false, error: 'That transaction does not involve the reporting address' })
    }
    const verified = Boolean(onChain)
    const primaryActor = actor

    await db.recordTransaction({
      signature,
      status: onChain ? 'confirmed' : 'submitted',
      flow: flow ?? null,
      flowSource: 'client',
      actors: [primaryActor],
      primaryActor,
      clientReport: intent ?? null,
      slot: onChain?.slot ?? null,
    })
    if (onChain && verified) {
      await db.markConfirmed(signature, { slot: onChain.slot, blockTime: onChain.blockTime })
    }
    await db.setVerifiedOnChain(signature, verified)

    res.json({ ok: true, stored: true, verified_on_chain: verified })
  } catch (err) {
    console.error('tx/report error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── .vanta name registry ──────────────────────────────────────────────
// A name resolves a handle to a Vanta *shielded identity* owner address so a
// sender can pay `ai.vanta` instead of pasting a key. App-level registry, not
// on-chain: SNS owns `.sol` and there is no `.vanta` TLD. Never market it as a
// privacy feature.

app.get('/names/:name', async (req, res) => {
  if (!db.isEnabled()) return res.json({ ok: true, configured: false, found: false })
  try {
    const name = db.normalizeName(req.params.name)
    if (!name) return res.status(400).json({ ok: false, error: db.describeNameProblem(req.params.name) })
    const record = await db.resolveName(name)
    if (!record) return res.json({ ok: true, found: false, name: `${name}.vanta` })
    res.json({ ok: true, found: true, name: `${record.name}.vanta`, address: record.owner_address })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.get('/names/available/:name', async (req, res) => {
  if (!db.isEnabled()) return res.json({ ok: true, configured: false })
  try {
    const name = db.normalizeName(req.params.name)
    const problem = db.describeNameProblem(req.params.name)
    if (problem) return res.json({ ok: true, available: false, reason: problem })
    const status = await db.nameAvailability(name)
    res.json({ ok: true, ...status, handle: `${name}.vanta` })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.get('/names/owned/:address', async (req, res) => {
  if (!db.isEnabled()) return res.json({ ok: true, configured: false, names: [] })
  try {
    const names = await db.namesByOwner(req.params.address)
    res.json({ ok: true, names: names.map((n) => ({ ...n, handle: `${n.name}.vanta` })) })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

/**
 * Claim a name.
 *
 * Requires an Ed25519 proof: the client signs the exact message
 * `vanta-name-claim:<name>` with the identity it is claiming for, so nobody can
 * register a handle against someone else's address. Signature and public key
 * arrive as base58 strings.
 */
app.post('/names/claim', requireToken, async (req, res) => {
  if (!db.isEnabled()) return res.status(503).json({ ok: false, error: 'Name registry is not configured' })
  try {
    const { name: rawName, ownerAddress, signature, claimSignature, skrPaid } = req.body ?? {}
    if (!ownerAddress) return res.status(400).json({ ok: false, error: 'Missing ownerAddress' })

    const problem = db.describeNameProblem(rawName)
    if (problem) return res.status(400).json({ ok: false, error: problem })
    const name = db.normalizeName(rawName)

    if (!signature) return res.status(400).json({ ok: false, error: 'Missing proof signature' })
    const message = `vanta-name-claim:${name}`

    // bs58Decode returns a plain array; node:crypto wants Buffers, so coerce and
    // validate lengths before handing anything to the verifier.
    let publicKey
    let sigBytes
    try {
      publicKey = Buffer.from(bs58Decode(ownerAddress))
      sigBytes = Buffer.from(bs58Decode(signature))
    } catch (err) {
      return res.status(400).json({ ok: false, error: `Malformed proof input: ${err.message}` })
    }
    if (publicKey.length !== 32) {
      return res.status(400).json({ ok: false, error: 'ownerAddress is not a 32-byte key' })
    }
    if (sigBytes.length !== 64) {
      return res.status(400).json({ ok: false, error: 'Malformed proof signature' })
    }
    if (!db.verifyEd25519(publicKey, message, sigBytes)) {
      return res.status(401).json({ ok: false, error: 'Proof signature does not match ownerAddress' })
    }

    const result = await db.claimName({ name, ownerAddress, claimSignature, skrPaid })
    if (!result.ok) return res.status(409).json({ ok: false, error: result.error, code: result.code })

    console.log(`  ⟡ claimed @${name}.vanta for ${ownerAddress.slice(0, 8)}…`)
    res.json({ ok: true, handle: `${name}.vanta`, ...result.record })
  } catch (err) {
    console.error('names/claim error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Unknown paths answer JSON, not Express's HTML `Cannot GET /x` page
// (AUDIT-2026-09-27 L4). Two reasons it matters: every other surface of this
// service is JSON, so a client that parses the body should never have to special
// case one response shape; and an HTML error page leaks the framework and the
// fact that path normalisation — not auth — is what rejected the request.
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Not found: ${req.method} ${req.path}` })
})

// Last-resort handler: a thrown route error must still be JSON, never the
// default Express stack page.
app.use((err, req, res, _next) => {
  console.error('unhandled route error:', err?.message ?? err)
  res.status(500).json({ ok: false, error: 'Internal error' })
})

// ── Waitlist ──────────────────────────────────────────────────────────
// Signups from the landing page (vanta-mobile.xyz). The site is static, so it
// cannot write to Postgres itself — this is the endpoint its card posts to.
// No token: a public marketing form has no secret to carry, and requiring one
// would put the token in the bundle, which is the mistake C1 already fixed.
// Abuse is bounded by the per-IP window below.
//
// The row is the whole feature today. There is no send path yet: an email reply
// is a later job, and doing it here would mean holding a mail credential for a
// form that is still just collecting addresses.

const waitlistWindows = new Map()
const WAITLIST_WINDOW_MS = 60 * 60 * 1000
const MAX_WAITLIST_PER_WINDOW = 5

// Deliberately loose: the address is stored, not used to route mail yet, so the
// job here is to reject garbage rather than to decide deliverability.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function takeWaitlistSlot(ip) {
  const now = Date.now()
  const hits = (waitlistWindows.get(ip) || []).filter((t) => now - t < WAITLIST_WINDOW_MS)
  if (hits.length >= MAX_WAITLIST_PER_WINDOW) return false
  hits.push(now)
  waitlistWindows.set(ip, hits)
  return true
}

app.post('/waitlist', async (req, res) => {
  if (!db.isEnabled()) {
    return res.status(503).json({ ok: false, error: 'Waitlist is not configured' })
  }
  const ip = req.ip || 'unknown'
  if (!takeWaitlistSlot(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many signups from here. Try again later.' })
  }
  try {
    const { email, device, wants, note } = req.body ?? {}
    if (!email || !EMAIL_RE.test(String(email).trim())) {
      return res.status(400).json({ ok: false, error: 'That email address does not look right' })
    }
    const clip = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)
    const result = await db.recordWaitlistSignup({
      email: String(email).trim(),
      device: clip(device, 40),
      wants: clip(wants, 40),
      note: clip(note, 200),
    })
    if (!result.ok) return res.status(500).json({ ok: false, error: result.error })
    res.json({ ok: true, already: Boolean(result.duplicate) })
  } catch (err) {
    console.error('waitlist error:', err.message)
    res.status(500).json({ ok: false, error: 'Could not save that. Try again.' })
  }
})

// Bootstrap the schema before accepting traffic. A failure here is logged but
// not fatal — the relayer must still relay with Neon down.
const schemaReady = db.isEnabled()
  ? db
      .initSchema()
      .then(() => {
        console.log('   Postgres: schema ready (tx history + .vanta names)')
        return true
      })
      .catch((err) => {
        console.error(`   ⚠ Postgres: schema init failed — history disabled: ${err.message}`)
        return false
      })
  : Promise.resolve(false)

app.listen(PORT, async () => {
  console.log(`\n🛡️  Vanta Relayer listening on :${PORT}`)
  console.log(`   Wallet:  ${RELAYER_ADDR}`)
  console.log(`   Network: ${RPC_URL}`)
  console.log(`   /fund cap: ${MAX_FUND_SOL} SOL/request, ${MAX_FUND_PER_WINDOW}/window/IP`)
  console.log(`   Program allowlist check: ${ENFORCE_PROGRAMS ? 'on' : 'OFF'}`)
  const dbUp = await schemaReady
  console.log(
    `   Postgres: ${!db.isEnabled() ? 'not configured (history off)' : dbUp ? 'connected' : 'UNAVAILABLE'}`,
  )
  if (!TOKEN) {
    console.warn(
      '\n   ⚠  RELAYER_TOKEN is not set — /relay and /fund are UNAUTHENTICATED.\n' +
        '      Fine on localhost. NEVER deploy it this way: /fund would be an open faucet.\n',
    )
  }
  if (isProd && !TOKEN) {
    console.error('   ✗ Refusing to run in production without RELAYER_TOKEN.')
    process.exit(1)
  }
})
