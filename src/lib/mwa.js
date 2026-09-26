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
import { getWallets } from './wallets'

export const DEVNET_CHAIN = 'solana:devnet'

const MWA_WALLET_NAMES = ['Mobile Wallet Adapter', 'Remote Mobile Wallet Adapter']

let registered = false
let connectedWallet = null
let connectedAccount = null

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

// Connect failures get the same treatment: a wallet that half-opens a session
// and dies surfaces as a generic association error to the user.
export async function connectMwa() {
  const wallet = resolveWallet()
  if (!wallet) throw new Error('No Mobile Wallet Adapter wallet found on this device')
  const connect = wallet.features?.['standard:connect']
  if (!connect) throw new Error('Wallet does not support standard:connect')
  try {
    const { accounts } = await connect.connect()
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

// Wallets that lack Solana v1-transaction support (the format zolana always emits)
// reject the payload at deserialization with wallet-specific errors: web3.js-based
// wallets (Backpack, RN apps) say "reached end of buffer unexpectedly", older
// reference wallets just crash. Translate both into one actionable message instead
// of a raw parse error the user cannot act on.
function translateWalletError(err) {
  const msg = String(err?.message || err || '')
  if (/end of buffer|failed to process request|unexpectedly/i.test(msg)) {
    return new Error(
      'Your wallet could not read this transaction — it likely does not support Solana v1 transactions yet. ' +
        'Use the in-app key, or a v1-capable wallet (see Settings).',
      { cause: err },
    )
  }
  return err
}

function withTimeout(promise, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out — approve the request in your wallet and try again`)),
      MWA_REQUEST_TIMEOUT_MS,
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

// Pull one signer's 64-byte signature out of a signed wire transaction. V1 puts
// the signature block at the tail; legacy transactions put it after the count.
export function signatureFromSignedTx(signedBytes, index, v1 = true) {
  if (index < 0) throw new Error('Account is not a required signer of this transaction')
  if (v1) {
    const numSignatures = signedBytes[1]
    return signedBytes.slice(
      signedBytes.length - numSignatures * 64 + index * 64,
      signedBytes.length - numSignatures * 64 + (index + 1) * 64,
    )
  }
  return signedBytes.slice(1 + index * 64, 1 + (index + 1) * 64)
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
