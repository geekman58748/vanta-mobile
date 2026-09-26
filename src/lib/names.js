import { relayerFetch } from './config'
import { bytesToBase58 } from './mwa'

// ── .vanta handle registry (client side) ─────────────────────────────────────
// A handle is a lookup convenience: it maps `ai.vanta` → the Vanta *shielded
// identity* owner address. It is NOT a privacy primitive and must never be
// presented as one — SNS owns `.sol`, there is no `.vanta` TLD, and this registry
// lives in the relayer's Postgres.
//
// The claim needs proof of ownership. The client signs
//     "vanta-name-claim:<name>"
// with the same seed that owns the shielded identity, and the relayer verifies it
// with node:crypto. Nothing is written on-chain, and no signature ever leaves
// the app — so claiming a handle reveals nothing new about the wallet.
//
// Wire contract (relayer/server.js → POST /names/claim):
//   body: { name, ownerAddress, signature }        signature = base58, 64 bytes
//   400 validation · 401 proof mismatch · 409 taken/reserved/already-owned

const CLAIM_PREFIX = 'vanta-name-claim:'
const EPHEMERAL_KEY = 'vanta-ephemeral'

/** The exact string the server verifies. */
export const claimMessage = (handle) => `${CLAIM_PREFIX}${handle}`

/**
 * 32-byte seed behind the shielded identity.
 *
 * Read straight from `vanta-ephemeral` — the same store App.jsx derives X from.
 * It is plaintext by design (the ZK prover is JS-only, so it must be readable by
 * the app); returning `null` when it is absent rather than throwing, so a profile
 * sheet on a not-yet-initialised wallet degrades instead of crashing.
 */
function identitySeed() {
  try {
    const data = JSON.parse(localStorage.getItem(EPHEMERAL_KEY) || 'null')
    const secret = data?.secretKey
    if (!Array.isArray(secret) || secret.length < 32) return null
    return new Uint8Array(secret.slice(0, 32))
  } catch {
    return null
  }
}

/** Availability + the reason when unavailable ('taken', 'reserved', or a format problem). */
export async function checkName(rawName) {
  try {
    const res = await relayerFetch(`/names/available/${encodeURIComponent(String(rawName).trim())}`)
    if (!res.ok) return { available: false, reason: `Registry error ${res.status}` }
    const data = await res.json()
    if (data?.ok === false) return { available: false, reason: data.error || 'Registry unavailable' }
    return {
      available: Boolean(data.available),
      reason: data.reason ?? null,
      handle: data.handle ?? null,
      configured: data.configured !== false,
    }
  } catch {
    return { available: false, reason: 'Registry unreachable', unreachable: true }
  }
}

/** Handles already bound to an address. One owner can hold one. */
export async function ownedNames(ownerAddress) {
  if (!ownerAddress) return []
  try {
    const res = await relayerFetch(`/names/owned/${encodeURIComponent(ownerAddress)}`)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data?.names) ? data.names : []
  } catch {
    return []
  }
}

/**
 * Bind `name` to `ownerAddress`, proving ownership with an Ed25519 signature
 * over the claim message. Local validation runs first so a typo never costs a
 * round trip — but the server stays authoritative.
 */
export async function claimName({ name, ownerAddress }) {
  const handle = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/\.vanta$/, '')

  if (!handle) return { ok: false, error: 'Enter a name first' }
  if (!ownerAddress) return { ok: false, error: 'Your Vanta identity is not ready yet' }

  const seed = identitySeed()
  if (!seed) return { ok: false, error: 'No signing identity in this browser yet' }

  try {
    const { ed25519 } = await import('@noble/curves/ed25519.js')
    const bytes = new TextEncoder().encode(claimMessage(handle))
    const signature = await bytesToBase58(ed25519.sign(bytes, seed))

    const res = await relayerFetch('/names/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: handle, ownerAddress, signature }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: data?.error || `Registry rejected the claim (${res.status})` }
    }
    return { ok: true, handle: data.handle || `${handle}.vanta`, record: data }
  } catch (err) {
    return { ok: false, error: err?.message || 'Claim failed' }
  }
}
