/**
 * Vanta Privacy Relayer
 *
 * Holds a funded devnet wallet. Clients sign their owner slot with kit,
 * then send the raw message + empty-slot addresses here. The relayer
 * signs ONLY its own fee-payer slot (slot 0) with node:crypto and
 * submits the raw v1 wire bytes: [message][sig slot0][sig slot1]...
 *
 * POST /relay   — { message: base64, signers: [addr,...] } (empty slots, fee payer first)
 * POST /fund    — { address, amount } → sends SOL from relayer wallet
 * GET  /status  — health + balance
 * GET  /address — relayer pubkey
 */

import express from 'express'
import cors from 'cors'
import { Keypair, Connection, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import crypto from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEYPAIR_PATH = join(__dirname, 'relayer-keypair.json')
const PORT = process.env.RELAYER_PORT || 3001
const RPC_URL = 'https://api.devnet.solana.com'

// ── Ed25519 via node:crypto — bypasses web3's serialize() entirely ──
function ed25519KeyObject(seed32) {
  const prefix = Buffer.from('302e020100300506032b657004220420', 'hex')
  return crypto.createPrivateKey({
    key: Buffer.concat([prefix, Buffer.from(seed32)]),
    format: 'der',
    type: 'pkcs8',
  })
}

// ── Load or generate relayer keypair ──────────────────────────────
let relayerKeypair
if (existsSync(KEYPAIR_PATH)) {
  const secret = JSON.parse(readFileSync(KEYPAIR_PATH, 'utf-8'))
  relayerKeypair = Keypair.fromSecretKey(new Uint8Array(secret))
} else {
  relayerKeypair = Keypair.generate()
  writeFileSync(KEYPAIR_PATH, JSON.stringify(Array.from(relayerKeypair.secretKey)))
}

const connection = new Connection(RPC_URL, 'confirmed')
const RELAYER_ADDR = relayerKeypair.publicKey.toBase58()
const relayerKeyObj = ed25519KeyObject(relayerKeypair.secretKey.slice(0, 32))

// ── Express ───────────────────────────────────────────────────────
const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/status', async (req, res) => {
  try {
    const balance = await connection.getBalance(relayerKeypair.publicKey)
    res.json({ ok: true, address: RELAYER_ADDR, balance: balance / LAMPORTS_PER_SOL, network: 'devnet' })
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
app.post('/relay', async (req, res) => {
  try {
    const { message, slots } = req.body
    if (!message || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ error: 'Expected { message: base64, slots: [{addr, sig}] }' })
    }

    console.log(`\n── Relay request: ${slots.length} slot(s) ──`)

    const msgBytes = new Uint8Array(Buffer.from(message, 'base64'))

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
      return res.status(400).json({ error: `Relayer ${RELAYER_ADDR} has no empty slot in this tx` })
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

    res.json({ ok: true, signature: txid })
  } catch (err) {
    console.error('Relay error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Fund endpoint: send SOL from relayer to an address ────────────
app.post('/fund', async (req, res) => {
  try {
    const { address, amount } = req.body
    if (!address) return res.status(400).json({ error: 'Missing address' })
    const lamports = Math.round((amount || 0.5) * LAMPORTS_PER_SOL)

    const balance = await connection.getBalance(relayerKeypair.publicKey)
    if (balance < lamports + 10000) {
      return res.status(400).json({ error: `Relayer insufficient: ${balance / LAMPORTS_PER_SOL} SOL` })
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: relayerKeypair.publicKey, toPubkey: address, lamports })
    )
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.lastValidBlockHeight = lastValidBlockHeight
    tx.feePayer = relayerKeypair.publicKey
    tx.sign(relayerKeypair)

    const sig = await connection.sendRawTransaction(tx.serialize())
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
    console.log(`Funded ${address.slice(0, 8)}... with ${amount || 0.5} SOL`)
    res.json({ ok: true, signature: sig, amount: amount || 0.5 })
  } catch (err) {
    console.error('Fund error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`\n🛡️  Vanta Relayer on http://localhost:${PORT}`)
  console.log(`   Wallet: ${RELAYER_ADDR}`)
  console.log(`   Network: Solana Devnet\n`)
})
