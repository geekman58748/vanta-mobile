/**
 * Prove which wire encoding a zolana deposit needs.
 *
 * fakewallet parses the bytes MWA hands it with this dispatch:
 *     transaction[0] === 0x81  -> V1  (signatures live at the END)
 *     otherwise                -> legacy/v0 (signatures follow a shortvec count)
 *
 * So the encoding is not a style choice: get it wrong and the wallet throws
 * `Accounts array extends beyond buffer bounds` while resolving signers.
 *
 *   node scripts/mwa-wire-check.mjs
 */
import { Keypair } from '@solana/web3.js'

const HELIUS_KEY = 'REDACTED_HELIUS_KEY'
const RPC_URL = `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
const RPC_WSS = `wss://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
const INDEXER_URL = 'https://d2xah7tnhdhcom.cloudfront.net'
const PROVER_URL = 'https://d21ni15goiip6l.cloudfront.net'

const SIG_LEN = 64
const PUBKEY_LEN = 32

// Verbatim port of fakewallet's getSignersForLegacyV0Transaction bounds checks.
function legacyChecks(tx) {
  const readCompact = (off) => {
    if (off >= tx.length) return null
    const b0 = tx[off]
    let len = b0 & 0x7f
    if ((b0 & 0x80) === 0) return { len, size: 1 }
    if (off + 1 >= tx.length) return null
    const b1 = tx[off + 1]
    len = (len << 7) | (b1 & 0x7f)
    if ((b1 & 0x80) === 0) return { len, size: 2 }
    if (off + 2 >= tx.length) return null
    const b2 = tx[off + 2]
    len = (len << 2) | b2
    return { len, size: 3 }
  }

  const n = readCompact(0)
  if (!n) return 'compact array length extends beyond buffer bounds'
  const numSignatures = n.len
  const prefixOffset = n.size + SIG_LEN * numSignatures
  if (prefixOffset >= tx.length) return 'prefix extends beyond buffer bounds'
  const prefix = tx[prefixOffset]
  const txnVersionOffset = (prefix & 0x7f) === prefix ? 0 : 1
  const headerOffset = prefixOffset + txnVersionOffset
  const accountsArrayOffset = headerOffset + 3
  if (accountsArrayOffset > tx.length) return 'transaction header extends beyond buffer bounds'
  if (tx[headerOffset] !== numSignatures) return 'Signatures array length does not match transaction required number of signatures'
  const na = readCompact(accountsArrayOffset)
  if (!na) return 'numAccounts compact length out of bounds'
  const numAccounts = na.len
  if (numAccounts < numSignatures) return 'Accounts array is smaller than number of required signatures'
  const blockhashOffset = accountsArrayOffset + na.size + PUBKEY_LEN * numAccounts
  if (blockhashOffset > tx.length) return 'Accounts array extends beyond buffer bounds'
  return null
}

// Verbatim port of fakewallet's getSignersForV1Transaction, which is the branch the
// wallet actually takes for a 0x81-prefixed payload.
function v1Signers(tx) {
  const numSignatures = tx[1]
  const numAccounts = tx[41]
  const accountsArrayOffset = 42
  if (!(numAccounts >= numSignatures)) return { error: 'Accounts array is smaller than number of required signatures' }
  const signers = []
  for (let i = 0; i < numSignatures; i++) {
    const off = accountsArrayOffset + PUBKEY_LEN * i
    signers.push([...tx.slice(off, off + PUBKEY_LEN)])
  }
  return { numSignatures, numAccounts, signers }
}

const { getBase58Decoder } = await import('@solana/kit')

const zk = await import('@heliuslabs/zolana')
const client = await zk.createZolanaClient({
  solanaRpcUrl: RPC_URL, solanaRpcSubscriptionsUrl: RPC_WSS,
  indexerUrl: INDEXER_URL, proverUrl: PROVER_URL,
})

const kp = Keypair.generate()
const seed = new Uint8Array(kp.secretKey.slice(0, 32))
const shielded = zk.ShieldedKeypair.fromKeypair(zk.SigningKey.fromEd25519Bytes(seed))
const address = kp.publicKey.toBase58()

const deposit = await zk.buildDepositTransaction({
  client,
  feePayer: address,
  depositor: address,
  recipient: shielded.shieldedAddress(),
  amount: 100_000_000n,
})

const message = new Uint8Array(deposit.messageBytes)
const order = Object.keys(deposit.signatures)
const blob = new Uint8Array(message.length + order.length * SIG_LEN)

console.log('messageBytes.length   :', message.length)
console.log('messageBytes[0]       : 0x' + message[0].toString(16), message[0] === 0x81 ? '(V1 prefix 0x81)' : '(NOT v1)')
console.log('messageBytes[1]       :', message[1])
console.log('signature slots        :', JSON.stringify(order))

// A: what mwa.js serializeCompiledTx currently emits (legacy layout)
const current = new Uint8Array(1 + order.length * SIG_LEN + message.length)
current[0] = order.length
current.set(message, 1 + order.length * SIG_LEN)

// B: what e2e-zolana.mjs emits, and what V1 requires
const v1 = new Uint8Array(message.length + order.length * SIG_LEN)
v1.set(message, 0)

console.log()
console.log('current serializeCompiledTx ->', legacyChecks(current) ?? 'parses OK')
console.log()

// The wallet dispatches on byte 0, so validate each layout with the branch it
// would actually select rather than assuming one parser fits both.
console.log('V1 branch on current encoding (byte0=0x%x)', current[0], '->', legacyChecks(current) ?? 'legacy branch parses OK')
const v1res = v1Signers(v1)
console.log('V1 branch on message-first    (byte0=0x%x)', v1[0], '->', v1res.error ?? 'parses OK')
if (v1res.signers) {
  console.log('  numSignatures:', v1res.numSignatures, ' numAccounts:', v1res.numAccounts)
  console.log('  extracted signer:', getBase58Decoder().decode(new Uint8Array(v1res.signers[0])))
  console.log('  expected signer :', address)
}
console.log()
console.log('first 8 bytes, current :', [...current.slice(0, 8)])
console.log('first 8 bytes, v1      :', [...v1.slice(0, 8)])
console.log()
console.log('messageBytes[0..8]  :', [...message.slice(0, 9)])
console.log('messageBytes[41]    :', message[41], '(V1 numAccounts lives here)')
console.log('messageBytes[42..48]:', [...message.slice(42, 49)])
console.log('messageBytes[4]     :', message[4], '(legacy account-array length lives here)')
console.log('messageBytes[5..12] :', [...message.slice(5, 13)])
console.log()
console.log('bytes 36..56:', [...message.slice(36, 57)])
