// ── On-device transaction history ────────────────────────────────────────────
//
// Why this exists (AUDIT-2026-09-27 H1): history and receipts lived in React
// state only, so closing the app threw away every row — Activity came back to
// "No transactions yet" after a restart while the relayer still held the
// anchors, and every PDF receipt became unreachable. Beta-test flow #8 ("history
// survives a restart") could not pass.
//
// It matters more now than it did: since the relayer stopped storing amounts and
// recipients (C2), THIS is the only place those two facts exist. A restart that
// loses them loses the receipt itself.
//
// Encrypted with XChaCha20-Poly1305 under a key derived from the shielded
// identity's seed. Honest scope, the same as the wallet snapshot: the seed is in
// `vanta-ephemeral` on the same device, so this defends against a stray
// localStorage dump or a casual forensic read of the app's data — NOT against
// someone who already holds X's seed (PLAN §10 / AUDIT C3). It is a real
// improvement over the previous state, which stored nothing at all, but it is
// not a claim of at-rest secrecy against a device compromise.
//
// Failure policy: a store we cannot decrypt is left UNTOUCHED on disk and we
// return an empty list. Losing the rows is bad; silently overwriting the only
// copy of a user's receipts would be worse.

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { sha256 } from '@noble/hashes/sha2.js'

const STORE_KEY = 'vanta-history-v1'
const EPHEMERAL_KEY = 'vanta-ephemeral'
const KDF_SALT = 'vanta-history-v1'
// Rows are bounded so a runaway loop cannot fill the device's storage quota.
const MAX_ROWS = 500
// @noble/ciphers v2 takes the nonce at the factory: xchacha20poly1305(key, nonce)
// then .encrypt(plaintext). (v1 took it per call.)
const NONCE_BYTES = 24

function toBase64(bytes) {
  let binary = ''
  const STEP = 0x8000
  for (let i = 0; i < bytes.length; i += STEP) {
    binary += String.fromCharCode(...bytes.subarray(i, i + STEP))
  }
  return btoa(binary)
}

function fromBase64(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** The identity seed, or null when this install has no shielded identity yet. */
export function identitySeed() {
  try {
    const data = JSON.parse(localStorage.getItem(EPHEMERAL_KEY) || 'null')
    const secret = data?.secretKey
    if (!Array.isArray(secret) || secret.length < 32) return null
    return new Uint8Array(secret.slice(0, 32))
  } catch {
    return null
  }
}

/** Deterministic 32-byte key for the history store, derived from the seed. */
function historyKey(seed) {
  const material = new Uint8Array(seed.length + KDF_SALT.length)
  material.set(seed, 0)
  material.set(new TextEncoder().encode(KDF_SALT), seed.length)
  return sha256(material)
}

const openStore = (key, nonce) => xchacha20poly1305(key, nonce)

/**
 * Rewrite copy that an earlier build wrote into a stored row.
 *
 * Rows written before 2026-09-28 named a send "Ghost → CNfN…R2qu". The arrow is
gone from every current string, but the row is sitting ENCRYPTED on disk: the
 * send path can no longer produce that title, and nothing else would ever reach
 * back and fix it, so the old glyph would render on the dashboard and in every
 * PDF receipt forever. Normalising on read is the only place that can repair an
 * already-stored row.
 *
 * Deliberately narrow: `title` is the only user-facing string a row carries.
 * Amount, mode and signature are data, and rewriting data to tidy punctuation is
 * how a receipt starts lying.
 */
function normalizeTitle(title) {
  if (typeof title !== 'string') return title
  return title.replace(/\s*→\s*/g, ' to ').replace(/\s*—\s*/g, ' · ')
}

/**
 * Read the persisted rows.
 * @returns {Array} [] when there is nothing stored, or when the blob cannot be
 *   decrypted (the blob is preserved in that case, not cleared).
 */
export function loadHistory() {
  const seed = identitySeed()
  if (!seed) return []
  let raw
  try {
    raw = localStorage.getItem(STORE_KEY)
  } catch {
    return []
  }
  if (!raw) return []
  try {
    const packed = fromBase64(raw)
    if (packed.length <= NONCE_BYTES) throw new Error('blob too short')
    const nonce = packed.slice(0, NONCE_BYTES)
    const ciphertext = packed.slice(NONCE_BYTES)
    const plaintext = openStore(historyKey(seed), nonce).decrypt(ciphertext)
    const rows = JSON.parse(new TextDecoder().decode(plaintext))
    return Array.isArray(rows)
      ? rows.map((row) =>
          row && typeof row === 'object' ? { ...row, title: normalizeTitle(row.title) } : row,
        )
      : []
  } catch (err) {
    console.warn('[history] could not decrypt the local store — leaving it untouched:', err?.message ?? err)
    return []
  }
}

/** Persist rows. Returns true when the write landed. */
export function saveHistory(rows) {
  const seed = identitySeed()
  if (!seed) return false
  try {
    const trimmed = Array.isArray(rows) ? rows.slice(0, MAX_ROWS) : []
    const bytes = new TextEncoder().encode(JSON.stringify(trimmed))
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
    const ciphertext = openStore(historyKey(seed), nonce).encrypt(bytes)
    const packed = new Uint8Array(nonce.length + ciphertext.length)
    packed.set(nonce, 0)
    packed.set(ciphertext, nonce.length)
    localStorage.setItem(STORE_KEY, toBase64(packed))
    return true
  } catch (err) {
    console.warn('[history] could not persist:', err?.message ?? err)
    return false
  }
}

/**
 * Wipe the store. Called on an explicit disconnect, where the identity it is
 * encrypted for is being destroyed too.
 */
export function clearHistory() {
  try {
    localStorage.removeItem(STORE_KEY)
  } catch (err) {
    console.warn('[history] could not clear:', err?.message ?? err)
  }
}
