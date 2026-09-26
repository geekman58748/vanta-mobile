/**
 * Is a transaction indexed by the Photon indexer?
 *
 *   node scripts/check-indexed.mjs <txSignature>
 *
 * Read-only. Separates two failure modes:
 *   - chain has it, indexer has it, client can't see it  → stale sync cursors
 *     (fix: Settings → "Force resync from chain")
 *   - indexer does not have it at all                   → the note never landed
 *     in a form the recipient can discover
 */
const HELIUS_KEY = process.env.VITE_HELIUS_API_KEY ?? process.env.HELIUS_API_KEY ?? ''
const RPC_URL = `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
const RPC_WSS = `wss://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
const INDEXER_URL = 'https://d2xah7tnhdhcom.cloudfront.net'
const PROVER_URL = 'https://d21ni15goiip6l.cloudfront.net'

const sig = process.argv[2]
if (!sig) {
  console.error('usage: node scripts/check-indexed.mjs <txSignature>')
  process.exit(1)
}

const zk = await import('@heliuslabs/zolana')
const client = await zk.createZolanaClient({
  solanaRpcUrl: RPC_URL,
  solanaRpcSubscriptionsUrl: RPC_WSS,
  indexerUrl: INDEXER_URL,
  proverUrl: PROVER_URL,
})

const replacer = (_k, v) => {
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof Uint8Array) {
    return `0x${Buffer.from(v).toString('hex').slice(0, 40)}${v.length > 20 ? '…' : ''}`
  }
  return v
}

try {
  const res = await client.getShieldedTransactionsBySignature(sig)
  const txs = res?.transactions ?? []
  console.log(`tx:      ${sig}`)
  console.log(`indexed: ${txs.length > 0 ? 'YES ✅' : 'NO ❌'}  (${txs.length} row(s))`)
  console.log(`keys:    ${Object.keys(res ?? {}).join(', ') || '(empty)'}`)
  for (const [i, t] of txs.entries()) {
    const tx = t?.transaction ?? t
    const tags = (tx?.outputSlots ?? []).map(s => s?.viewTag).filter(Boolean)
    console.log(`  [${i}] slot=${tx?.slot} proofless=${tx?.proofless} viewTags=${tags.join(', ') || '(none)'}`)
  }
} catch (err) {
  console.error('indexer query failed:', err?.message || err)
  console.error('cause:', String(err?.cause ?? '(none)').slice(0, 400))
  process.exitCode = 1
}
