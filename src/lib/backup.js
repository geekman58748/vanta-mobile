// ── Backup & restore ─────────────────────────────────────────────────────────
//
// Why this exists (AUDIT-2026-09-27 H4): everything that matters lives in this
// app's localStorage and nowhere else. `pm clear` (or an uninstall) deleted the
// shielded identity and the in-app wallet's key with no export path and no way
// back — the audit reproduced exactly that, orphaning 0.15 SOL. The app now says
// "this device is the whole wallet" on its own onboarding screen, so it has to
// ship the one feature that sentence implies: a backup.
//
// What goes in: the shielded identity X (without it the private balance and all
// note history are unrecoverable), the in-app session wallet key if one exists,
// the cached note snapshot, and the encrypted history blob (which only decrypts
// again once the same identity is restored — its key comes from X's seed).
//
// What deliberately does NOT: an MWA device wallet. Its key is in Seed Vault /
// Phantom; reconnecting it on the new device recovers it. Copying a key that the
// app never held would break the one custody promise the app does keep.
//
// The envelope is scrypt + XChaCha20-Poly1305 under a user passphrase, so the
// exported file is useless on its own. Restoring overwrites the local stores,
// which is why the UI double-checks before calling it.

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { scryptAsync } from '@noble/hashes/scrypt.js'
import { saveSessionWallet } from './walletStore.js'

const FORMAT = 'vanta-backup'
const VERSION = 1
// ~2^14 blocks: a second or so of JS key stretching, which is the point of a KDF
// here, while staying short enough to feel like a normal button press.
const KDF_PARAMS = { N: 2 ** 14, r: 8, p: 1, dkLen: 32 }
const NONCE_BYTES = 24

const STORES = {
  identity: 'vanta-ephemeral',
  zwallet: 'vanta-zwallet',
  history: 'vanta-history-v1',
}

function toBase64(bytes) {
  let binary = ''
  const STEP = 0x8000
  for (let i = 0; i < bytes.length; i += STEP) {
    binary += String.fromCharCode(...bytes.subarray(i, i + STEP))
  }
  return btoa(binary)
}

function fromBase64(value) {
  const binary = atob(String(value))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const readJson = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

/**
 * Build the encrypted envelope.
 * @param {string} passphrase user-chosen; never stored
 * @returns {Promise<{ok: boolean, text?: string, items?: string[], error?: string}>}
 */
export async function createBackup(passphrase) {
  if (!passphrase || passphrase.length < 8) {
    return { ok: false, error: 'Use a passphrase of at least 8 characters' }
  }
  const identity = readJson(STORES.identity)
  if (!identity?.secretKey) {
    return { ok: false, error: 'This device has no shielded identity to back up yet' }
  }

  // Read the session slot directly rather than importing walletStore, so this
  // module has no opinion about which wallet is active.
  let sessionWallet = null
  try {
    sessionWallet = JSON.parse(localStorage.getItem('vanta-wallet-session') || 'null')
  } catch {
    sessionWallet = null
  }
  const legacyWallet = readJson('vanta-wallet')
  if (!sessionWallet && legacyWallet?.secretKey) sessionWallet = legacyWallet

  const payload = {
    v: VERSION,
    createdAt: new Date().toISOString(),
    identity: { secretKey: identity.secretKey },
    wallet: sessionWallet?.secretKey
      ? { publicKey: sessionWallet.publicKey, secretKey: sessionWallet.secretKey }
      : null,
    zwallet: localStorage.getItem(STORES.zwallet) || null,
    history: localStorage.getItem(STORES.history) || null,
  }

  const items = ['shielded identity']
  if (payload.wallet) items.push(`in-app wallet ${payload.wallet.publicKey.slice(0, 8)}…`)
  if (payload.zwallet) items.push('cached note state')
  if (payload.history) items.push('encrypted history')

  try {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
    const key = await scryptAsync(passphrase, salt, KDF_PARAMS)
    const plaintext = new TextEncoder().encode(JSON.stringify(payload))
    const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext)
    const envelope = {
      format: FORMAT,
      v: VERSION,
      kdf: 'scrypt',
      ...KDF_PARAMS,
      salt: toBase64(salt),
      nonce: toBase64(nonce),
      ct: toBase64(ciphertext),
    }
    // One copyable line: no line breaks to survive a clipboard or a chat app.
    return { ok: true, text: btoa(JSON.stringify(envelope)), items }
  } catch (err) {
    return { ok: false, error: err?.message || 'Could not build the backup' }
  }
}

/** Parse + decrypt. Returns the payload without touching any local store. */
export async function openBackup(text, passphrase) {
  if (!text || !passphrase) return { ok: false, error: 'Both the backup text and its passphrase are required' }
  let envelope
  try {
    envelope = JSON.parse(atob(String(text).trim()))
  } catch {
    return { ok: false, error: 'That does not look like a Vanta backup' }
  }
  if (envelope?.format !== FORMAT) return { ok: false, error: 'That is not a Vanta backup file' }
  if (Number(envelope.v) > VERSION) return { ok: false, error: 'This backup was made by a newer version of Vanta' }

  try {
    const salt = fromBase64(envelope.salt)
    const nonce = fromBase64(envelope.nonce)
    const key = await scryptAsync(passphrase, salt, {
      N: Number(envelope.N) || KDF_PARAMS.N,
      r: Number(envelope.r) || KDF_PARAMS.r,
      p: Number(envelope.p) || KDF_PARAMS.p,
      dkLen: KDF_PARAMS.dkLen,
    })
    const plaintext = xchacha20poly1305(key, nonce).decrypt(fromBase64(envelope.ct))
    const payload = JSON.parse(new TextDecoder().decode(plaintext))
    if (!payload?.identity?.secretKey) return { ok: false, error: 'The backup is missing its shielded identity' }
    return { ok: true, payload }
  } catch {
    // Wrong passphrase and a corrupted file are indistinguishable here, and
    // saying so is more honest than picking one.
    return { ok: false, error: 'Could not open it. Wrong passphrase, or the text was truncated' }
  }
}

/** The addresses this backup would restore, for a confirm screen. */
export function describeBackup(payload) {
  return {
    wallet: payload?.wallet?.publicKey ?? null,
    hasNotes: Boolean(payload?.zwallet),
    hasHistory: Boolean(payload?.history),
    createdAt: payload?.createdAt ?? null,
  }
}

/**
 * Write a decrypted payload into local storage, replacing what is there.
 * Callers must have confirmed with the user first.
 */
export function applyBackup(payload) {
  try {
    localStorage.setItem(STORES.identity, JSON.stringify({ secretKey: payload.identity.secretKey }))
    if (payload.wallet?.secretKey) {
      // Through walletStore, so the session slot, the active pointer and the
      // legacy mirror all move together (see lib/walletStore.js).
      saveSessionWallet({ publicKey: payload.wallet.publicKey, secretKey: payload.wallet.secretKey })
    }
    if (payload.zwallet) localStorage.setItem(STORES.zwallet, payload.zwallet)
    if (payload.history) localStorage.setItem(STORES.history, payload.history)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || 'Could not write the restored data' }
  }
}
