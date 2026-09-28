/**
 * Prove we recover the depositor's signature from whatever the wallet hands
 * back — before it goes on the wire.
 *
 * Why this exists: on the Shield MWA path the app asks the device wallet to
 * sign, then lifts that signature out of the returned payload and posts it to
 * the relayer, which forwards it without looking at it. That means a
 * mis-extracted signature is not caught anywhere until the RPC rejects the
 * transaction with `Transaction did not pass signature verification` — an
 * error that names nothing and points at nothing.
 *
 * The old `signatureFromSignedTx` located the signature by ARITHMETIC over the
 * returned bytes (`signedBytes[1]` = count, block at the tail). That is only
 * the inverse of the envelope the reference wallet writes. Anything else —
 * a wallet that fills the slot itself chose, a wallet that re-serialises in the
 * legacy `[count][sigs][message]` order, a wallet that returns the payload
 * unsigned — silently yields 64 bytes of zeros or message, which is a valid
 * LENGTH and therefore sails through both the client and the relayer.
 *
 *   node scripts/mwa-signature-extract-check.mjs
 */
import { Keypair } from '@solana/web3.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createTransactionMessage,
  getBase58Decoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit'
import { serializeCompiledTx, verifiedSignatureFromSignedTx } from '../src/lib/mwa.js'

// What `signatureFromSignedTx` used to do — read the count from byte 1, take
// that many signatures off the tail, index into the block. Kept here verbatim so
// the harness can show what each envelope yields under it; the app no longer
// has this function, because being wrong here is invisible until the RPC rejects
// the transaction.
function offsetSignatureFromSignedTx(signedBytes, index, v1 = true) {
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

const SIG_LEN = 64
const POOL_PROGRAM = 'sppU489D7A4U1exNo1oeMGZtLEofq3a6o2fR7UeoWB6'

const b58 = getBase58Decoder()
const equalBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
const hex = (bytes) => bytes.slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join(' ')
const short = (bytes) => bytes.slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('') + '…'

// ── A realistic deposit: fee payer (relayer) + depositor, both required ──
// Same shape zolana compiles for /relay: the relayer pays, the device wallet
// signs only as depositor, so there are exactly two signer slots and the
// depositor is NOT slot 0.
const relayer = Keypair.generate()
const depositor = Keypair.generate()
const relayerAddr = relayer.publicKey.toBase58()
const depositorAddr = depositor.publicKey.toBase58()
const depositorSeed = new Uint8Array(depositor.secretKey.slice(0, 32))

const message = pipe(
  createTransactionMessage({ version: 1 }),
  (tx) => setTransactionMessageFeePayer(address(relayerAddr), tx),
  (tx) =>
    setTransactionMessageLifetimeUsingBlockhash(
      { blockhash: b58.decode(new Uint8Array(32).fill(7)), lastValidBlockHeight: 1n },
      tx,
    ),
  (tx) =>
    appendTransactionMessageInstruction(
      {
        programAddress: address(POOL_PROGRAM),
        accounts: [{ address: address(depositorAddr), role: AccountRole.WRITABLE_SIGNER }],
      },
      tx,
    ),
)

const compiled = compileTransaction(message)
const order = Object.keys(compiled.signatures)
const messageBytes = new Uint8Array(compiled.messageBytes)
const walletSlot = order.indexOf(depositorAddr)

console.log('signer slots        :', JSON.stringify(order))
console.log('relayer is slot 0   :', order[0] === relayerAddr)
console.log('depositor slot      :', walletSlot)
console.log('messageBytes[0]     : 0x' + messageBytes[0].toString(16), messageBytes[0] === 0x81 ? '(v1, signatures trail)' : '(NOT v1)')
console.log()

if (walletSlot !== 1) {
  console.error('✗ harness assumption broken: expected the depositor in slot 1')
  process.exit(1)
}

// ── The wallet, verbatim from the MWA reference implementation ──────────
// fakewallet's SolanaSigningUseCase.signV1Transaction: read the count from
// byte 1, sign the message, write the signature at `signaturesOffset +
// 64*accountIndex` where accountIndex is the account's position among the
// required signers.
function walletSignature() {
  return ed25519.sign(messageBytes, depositorSeed)
}

function v1Envelope(slotForSignature) {
  const out = new Uint8Array(serializeCompiledTx(compiled).bytes)
  const signaturesOffset = out.length - SIG_LEN * order.length
  out.set(walletSignature(), signaturesOffset + SIG_LEN * slotForSignature)
  return out
}

function legacyEnvelope() {
  const out = new Uint8Array(1 + SIG_LEN * order.length + messageBytes.length)
  out[0] = order.length
  out.set(walletSignature(), 1 + SIG_LEN * walletSlot)
  out.set(messageBytes, 1 + SIG_LEN * order.length)
  return out
}

const ENVELOPES = [
  {
    name: 'v1, wallet fills its own slot',
    bytes: v1Envelope(walletSlot),
    expect: 'recovers',
  },
  {
    name: 'v1, wallet fills slot 0',
    bytes: v1Envelope(0),
    expect: 'recovers',
  },
  {
    // A v1 message wrapped in the legacy envelope is not something kit's codec
    // can read, and we will not guess at it: the deposit is refused, loudly,
    // instead of shipped to the RPC with a signature lifted from the wrong
    // place. (The old arithmetic produced 0 bytes here and the relayer refused
    // it for the wrong reason — "Bad sig length" — so this is not a regression.)
    name: 'legacy [count][sigs][message]',
    bytes: legacyEnvelope(),
    expect: 'refuses',
  },
  {
    name: 'unsigned payload returned',
    bytes: serializeCompiledTx(compiled).bytes,
    expect: 'refuses',
  },
]

const wanted = walletSignature()
const results = []

const verifies = (sig) =>
  sig instanceof Uint8Array && sig.length === 64 && (() => {
    try {
      return ed25519.verify(sig, messageBytes, depositor.publicKey.toBytes())
    } catch {
      return false
    }
  })()

async function check(name, envelope, expect) {
  let oldSig = null
  let oldError = null
  try {
    oldSig = offsetSignatureFromSignedTx(envelope, walletSlot, messageBytes[0] === 0x81)
  } catch (err) {
    oldError = err.message
  }
  const oldOk = verifies(oldSig)
  const oldZero = oldSig?.length === 64 && oldSig.every((b) => b === 0)

  let newOk = false
  let newError = null
  try {
    const sig = await verifiedSignatureFromSignedTx(envelope, depositorAddr, messageBytes)
    newOk = equalBytes(sig, wanted)
  } catch (err) {
    newError = err.message
  }

  const label = expect === 'recovers' ? 'recover the signature' : 'refuse it'
  const oldVerdict = oldError
    ? `threw (${oldError})`
    : oldZero
      ? 'all-zero signature'
      : oldOk
        ? 'correct signature'
        : oldSig?.length === 64
          ? '64 bytes that verify against nothing'
          : `${oldSig?.length ?? 0} bytes (not a signature)`
  const newVerdict = newError ? `refused: ${newError}` : newOk ? 'correct signature' : 'WRONG SIGNATURE'

  const ok = expect === 'recovers' ? newOk : Boolean(newError)
  results.push(ok)
  console.log(`${ok ? '✓' : '✗'} ${name}  — wallet must: ${label}`)
  console.log(`   offset arithmetic : ${oldVerdict}`)
  console.log(`   verify-by-address : ${newVerdict}`)
  console.log(`   raw bytes         : ${hex(envelope)} … (${envelope.length} bytes)`)
  console.log(`   extracted (short) : ${short(oldSig ?? new Uint8Array(8))}`)
  console.log()
}

for (const envelope of ENVELOPES) await check(envelope.name, envelope.bytes, envelope.expect)

const passed = results.filter(Boolean).length
console.log(`════ ${passed}/${results.length} envelopes handled correctly ════`)
console.log('(offset arithmetic is shown for comparison only; the app no longer uses it)')
process.exitCode = passed === results.length ? 0 : 1
