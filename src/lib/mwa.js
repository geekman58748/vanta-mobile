// Mobile Wallet Adapter (MWA) — the custody layer.
//
// Vanta's privacy engine must stay in the WebView (the ZK prover is JS), but the
// user's *public* wallet — the account that funds a Shield and receives a Ghost —
// should not be a raw key sitting in localStorage. That wallet lives in Seed
// Vault / Phantom / Solflare and signs through MWA. The webshell exists precisely
// so this works: it bridges the `solana-wallet://` intents that a plain WebView
// blocks.
//
// `@solana-mobile/wallet-standard-mobile` registers an MWA wallet-standard wallet;
// discovery goes through our in-repo registry (see ./wallets.js).

import {
  registerMwa,
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
} from '@solana-mobile/wallet-standard-mobile'
import { getWallets } from './wallets.js'

export const DEVNET_CHAIN = 'solana:devnet'

const MWA_WALLET_NAMES = ['Mobile Wallet Adapter', 'Remote Mobile Wallet Adapter']

let registered = false
let connectedWallet = null
let connectedAccount = null

/** The wallet we are currently signed in to, for an error the user can act on. */
function walletLabel() {
  return connectedAccount?.label || connectedWallet?.name || 'Your wallet'
}

/**
 * An error already addressed to the user, with the action in the message.
 *
 * `userFacing` is what stops App.jsx's shieldErrorMessage prefixing it with
 * "Shield failed: " and burying the instruction the user needs (see the tail of
 * that function). Anything thrown because of how a WALLET behaved belongs here.
 */
function userFacing(message, cause) {
  const err = new Error(message, cause ? { cause } : undefined)
  err.userFacing = true
  return err
}

// Idempotent. Must run before `getWallets()` resolves a wallet so the registry
// listener is attached when `registerMwa` announces it.
export function initMwa() {
  if (registered || typeof window === 'undefined') return
  getWallets()
  registerMwa({
    appIdentity: {
      name: 'Vanta',
      uri: window.location.origin,
      icon: 'favicon.svg',
    },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: [DEVNET_CHAIN],
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  })
  registered = true
}

function resolveWallet() {
  initMwa()
  return getWallets()
    .get()
    .find((wallet) => MWA_WALLET_NAMES.includes(wallet?.name))
}

export function isMwaAvailable() {
  return !!resolveWallet()
}

// Connecting had NO timeout at all: signing was bounded but association was
// not, so an unanswered connect (or a wallet that dies mid-association) left the
// button spinning with no error and no retry — reported during the 2026-09-27
// audit and reproducible by never tapping AUTHORIZE in the wallet. Generous but
// bounded: launching a wallet app and approving is allowed to take a while.
const MWA_CONNECT_TIMEOUT_MS = 120_000

// Connect failures get the same treatment: a wallet that half-opens a session
// and dies surfaces as a generic association error to the user.
export async function connectMwa() {
  const wallet = resolveWallet()
  if (!wallet) throw new Error('No Mobile Wallet Adapter wallet found on this device')
  const connect = wallet.features?.['standard:connect']
  if (!connect) throw new Error('Wallet does not support standard:connect')
  try {
    const { accounts } = await withTimeout(connect.connect(), 'Connecting', MWA_CONNECT_TIMEOUT_MS)
    if (!accounts?.length) throw new Error('Wallet returned no accounts')
    connectedWallet = wallet
    connectedAccount = accounts[0]
    return connectedAccount
  } catch (err) {
    throw translateWalletError(err)
  }
}

export async function disconnectMwa() {
  const wallet = connectedWallet ?? resolveWallet()
  try {
    await wallet?.features?.['standard:disconnect']?.disconnect()
  } finally {
    connectedWallet = null
    connectedAccount = null
  }
}

export function getConnectedAccount() {
  return connectedAccount
}

export function isConnected() {
  return !!connectedAccount
}

// ── Signing ────────────────────────────────────────────────────────────────

// The library only times out *association* (waiting for the wallet app to
// appear). Once a session is open, a request the user never answers — or a wallet
// that dies mid-request — leaves the promise pending forever, and every caller
// awaits it inside a loading state. That is what wedged the Shield button: the
// session went unanswered and the app stayed `loading` until a restart. Bound it.
const MWA_REQUEST_TIMEOUT_MS = 90_000

// Wallets that lack Solana v1-transaction support (the format zolana always
// emits, with no opt-out) refuse the payload at deserialization, and every
// wallet family words it differently:
//   · web3.js-based wallets (Backpack, RN apps) → "reached end of buffer unexpectedly"
//   · mobile reference wallets / fakewallet   → "payloads invalid for signing"
//   · RPC-shaped rejections                   → "Transaction version (1) is not supported"
//   · older wallets                           → a bare deserialization crash
//
// All four are the same story to the user, and the raw strings are useless to
// them (AUDIT-2026-09-27 finding: a v1 parse failure surfaced as a generic
// signing error, which reads like the app is broken rather than the wallet).
// One message, one action, and the original error is kept as `cause`.
const V1_UNSUPPORTED = /end of buffer|failed to process request|unexpectedly|payloads? invalid|invalid payload|transaction version \(1\)|not supported by the requesting client|deserializ/i

function translateWalletError(err) {
  const msg = String(err?.message || err || '')
  if (V1_UNSUPPORTED.test(msg)) {
    return userFacing(
      `${walletLabel()} could not read this transaction: it does not support Solana v1 transactions yet, ` +
        'and every Vanta privacy transaction is a v1 by design. Shield and send it with the ' +
        'in-app wallet instead (Settings → Device wallet → Disconnect), then move funds over.',
      err,
    )
  }
  return err
}

function withTimeout(promise, label, timeoutMs = MWA_REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out — approve the request in your wallet and try again`)),
      timeoutMs,
    )
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(translateWalletError(err)) },
    )
  })
}

export async function signTransactionWithMwa(transactionBytes) {
  if (!connectedWallet || !connectedAccount) throw new Error('Wallet not connected')
  const feature = connectedWallet.features?.['solana:signTransaction']
  if (!feature) throw new Error('Wallet does not support solana:signTransaction')
  const [result] = await withTimeout(
    feature.signTransaction({
      account: connectedAccount,
      chain: DEVNET_CHAIN,
      transaction: transactionBytes,
    }),
    'Signing',
  )
  return result.signedTransaction
}

export async function signAndSendTransactionWithMwa(transactionBytes, options) {
  if (!connectedWallet || !connectedAccount) throw new Error('Wallet not connected')
  const feature = connectedWallet.features?.['solana:signAndSendTransaction']
  if (!feature) throw new Error('Wallet does not support solana:signAndSendTransaction')
  const [result] = await withTimeout(
    feature.signAndSendTransaction({
      account: connectedAccount,
      chain: DEVNET_CHAIN,
      transaction: transactionBytes,
      ...(options ? { options } : {}),
    }),
    'Signing',
  )
  return result.signature // Uint8Array(64)
}

// ── Zolana compiled-tx ↔ wire-format bridge ────────────────────────────────
//
// zolana's `build*Transaction` returns an already-compiled tx as
// `{ messageBytes, signatures: { [address]: sigOrNull } }`, where the signature
// key order is the required-signer order (fee payer first).
//
// zolana emits **V1** transactions: `messageBytes` starts with the 0x81 version
// prefix and carries its own signature count at index 1, with signatures trailing
// the message. Wallet parsers dispatch on that first byte, so the legacy layout
// ([sigCount][sig×n][message]) is not interchangeable here — prepending a count
// makes the wallet read 0x81 as a message header and reject the payload with
// "Accounts array extends beyond buffer bounds". Message first, signatures last.

export function serializeCompiledTx(compiledTx) {
  const order = Object.keys(compiledTx.signatures)
  const message = new Uint8Array(compiledTx.messageBytes)
  const out = new Uint8Array(message.length + order.length * 64)
  out.set(message, 0)
  return { bytes: out, order, v1: message[0] === 0x81 }
}

// ── Lifting the wallet's signature back out ────────────────────────────────
//
// THE BUG THIS REPLACES — found by a real Shield on a real phone failing
// (2026-09-28: Solflare as the device wallet, devnet; the relayer's log shows the
// deposit rejected by the RPC as `Transaction did not pass signature
// verification`) — is that the signature used to be located by ARITHMETIC over
// the payload the wallet returned: read the count from byte 1, take
// `numSignatures * 64` bytes off the tail, index into that block. That is the
// exact inverse of the envelope the reference wallet writes, and nothing else.
// A wallet that fills the slot of its choosing, that re-serialises in the legacy
// `[count][sigs][message]` order, or that hands the payload back without signing
// it yields 64 bytes of something-that-is-not-a-signature — a valid LENGTH, so
// it satisfied the client, satisfied the relayer's `length !== 64` check, and
// died only at the RPC, which does not name the signer it rejected.
//
// So: never trust a position, and never hand the relayer an unproven signature.
// Decode the returned bytes with kit's own codec — which dispatches on the
// envelope it is actually given, v1 or legacy — collect whatever signatures
// came back, and keep the one that VERIFIES against this account over this
// message. Everything else is refused here, where the error can name the wallet
// and the deposit is still unsubmitted.
//
// ⚠ NOT ON THE APP'S PATH TODAY, deliberately. A device-wallet Shield now has
// the wallet pay its own fee and broadcast (App.jsx shield), so it has exactly
// one signer and there is no foreign signature to recover. This survives because
// it is the correct way to do the relayer-funded variant — which buys initiator
// privacy and is worth revisiting — and because the harness next to it
// (scripts/mwa-signature-extract-check.mjs) is what proves a wallet's reply is
// usable before anyone trusts one again. Solflare's reply was not.
export async function verifiedSignatureFromSignedTx(signedBytes, address, messageBytes) {
  const { getTransactionDecoder, getBase58Encoder } = await import('@solana/kit')
  const { ed25519 } = await import('@noble/curves/ed25519.js')
  // kit's string codecs: the encoder turns the base58 string back into the 32 bytes.
  const publicKey = getBase58Encoder().encode(address)

  let signatures
  try {
    const transaction = getTransactionDecoder().decode(signedBytes)
    // kit maps an all-zero slot to null, which is what an unsigned payload is.
    signatures = Object.values(transaction.signatures).filter(Boolean)
  } catch (err) {
    throw userFacing(
      `${walletLabel()} returned something that is not a Solana transaction — the deposit was not submitted. ` +
        'Update the wallet, or Shield with the in-app wallet instead (Settings → Device wallet → Disconnect).',
      err,
    )
  }

  const signature = signatures.find((candidate) => {
    try {
      return ed25519.verify(candidate, messageBytes, publicKey)
    } catch {
      return false
    }
  })
  if (signature) return signature

  throw userFacing(
    signatures.length === 0
      ? `${walletLabel()} returned this deposit unsigned — it did not sign for your account, so nothing was submitted. ` +
        'Try again, or Shield with the in-app wallet instead (Settings → Device wallet → Disconnect).'
      : `${walletLabel()} returned a signature that does not match this deposit, so nothing was submitted. ` +
        'No funds moved. Try again, or Shield with the in-app wallet instead (Settings → Device wallet → Disconnect).',
  )
}

export function bytesToBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export async function bytesToBase58(bytes) {
  const { getBase58Decoder } = await import('@solana/kit')
  return getBase58Decoder().decode(bytes)
}
