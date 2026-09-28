// ── Proving ownership of an on-device key to the relayer ─────────────────────
//
// Why this exists (AUDIT-2026-09-27 C1/C2): the relayer history endpoints were
// gated by `RELAYER_TOKEN`, which is compiled into the client bundle. Anyone who
// unzipped the public APK could read a history row's recipient and exact amount
// by feeding that address into `GET /tx/:address`. The relayer stored the only
// copy of the payment graph the shielded pool hides, behind a key that shipped
// with the app.
//
// The history endpoints now authenticate with an **Ed25519 signature by the key
// the row belongs to**:
//
//   GET  /tx/:address?ts=<ms>&sig=<b58>   signs  vanta-history:<address>:<ts>
//   POST /tx/report  { actor, sig }       signs  vanta-report:<signature>:<actor>
//
// No shared secret is involved, so an extracted APK proves nothing: without the
// private key there is nothing to sign with. The relayer no longer stores
// amounts or counterparties at all — those live only in the client's own
// encrypted history (lib/txHistory.js + lib/localHistory.js).
//
// Which keys can sign, and why exactly these two:
//   · **X, the shielded identity** — signs its own Shadow/Ghost reports and
//     reads. This is the identity whose receipts carry weight.
//   · **The in-app session wallet** — a plain SOL transfer is signed by it, so
//     it can prove its own sends. It is a localStorage key, so this is silent.
//   · **The MWA device wallet — deliberately absent.** Its key is in Seed
//     Vault / Phantom and only signs with the user's approval on the phone;
//     silently prompting for a signature just to file a history row would be a
//     bad trade. Public sends from a device wallet are left unverified, which
//     the receipt shows honestly rather than guessing.

import { bytesToBase58 } from './mwa'
import { readSlots } from './walletStore'

const EPHEMERAL_KEY = 'vanta-ephemeral'
const HISTORY_PREFIX = 'vanta-history:'
const REPORT_PREFIX = 'vanta-report:'

export const historyMessage = (address, ts) => `${HISTORY_PREFIX}${address}:${ts}`
export const reportMessage = (signature, actor) => `${REPORT_PREFIX}${signature}:${actor}`

/** Signatures older/newer than this are refused, so a captured one expires. */
export const PROOF_MAX_AGE_MS = 5 * 60 * 1000

function readSeed(storeKey) {
  try {
    const data = JSON.parse(localStorage.getItem(storeKey) || 'null')
    const secret = data?.secretKey
    if (!Array.isArray(secret) || secret.length < 32) return null
    return new Uint8Array(secret.slice(0, 32))
  } catch {
    return null
  }
}

async function ed25519Api() {
  return import('@noble/curves/ed25519.js')
}

/** base58 address of the Ed25519 public key derived from a 32-byte seed. */
async function addressForSeed(seed) {
  const { ed25519 } = await ed25519Api()
  return bytesToBase58(ed25519.getPublicKey(seed))
}

/**
 * The seed that owns `address`, or null when this device cannot prove it.
 *
 * The MWA device wallet never matches here — by design, see the header.
 */
export async function seedForAddress(address) {
  if (!address) return null

  const identitySeed = readSeed(EPHEMERAL_KEY)
  if (identitySeed) {
    try {
      if ((await addressForSeed(identitySeed)) === address) return identitySeed
    } catch (err) {
      console.warn('[proof] could not derive the identity address:', err?.message ?? err)
    }
  }

  const sessionWallet = readSlots().sessionWallet
  if (sessionWallet?.publicKey === address) {
    const seed = Array.isArray(sessionWallet.secretKey) ? sessionWallet.secretKey : null
    if (seed?.length >= 32) return new Uint8Array(seed.slice(0, 32))
  }

  return null
}

/**
 * Sign `message` on behalf of `address`.
 * @returns {Promise<string|null>} base58 signature, or null when this device
 *   cannot prove that address (never throws).
 */
export async function signForAddress(address, message) {
  try {
    const seed = await seedForAddress(address)
    if (!seed) return null
    const { ed25519 } = await ed25519Api()
    return await bytesToBase58(ed25519.sign(new TextEncoder().encode(message), seed))
  } catch (err) {
    console.warn('[proof] signing failed:', err?.message ?? err)
    return null
  }
}

/**
 * Fresh `{ ts, sig }` query params for a signed history read, or null when this
 * device does not hold that address's key (caller should skip, not 401).
 */
export async function historyProof(address) {
  const ts = Date.now()
  const sig = await signForAddress(address, historyMessage(address, ts))
  return sig ? { ts, sig } : null
}
