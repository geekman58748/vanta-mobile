import { readFileSync } from 'fs'

const RELAYER = 'FhV7cyfVAC8gyQqSRYiw5oKdC95GVw83ukvxhhu7uRk7'
const X = '7EE3GdX2UrT3tzsJqnD3FU3fxaMNnfQcYKtVdiVw2fUc'
const HELIUS_KEY = process.env.VITE_HELIUS_API_KEY ?? process.env.HELIUS_API_KEY ?? ''
const RPC = HELIUS_KEY ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : 'https://api.devnet.solana.com'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function rpc(method, params, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
    const json = await res.json()
    if (json.error?.code === 429) { await sleep(1500 * (i + 1)); continue }
    if (json.error) throw new Error(JSON.stringify(json.error))
    return json.result
  }
  throw new Error('rate limited after retries')
}

const sigs = await rpc('getSignaturesForAddress', [X, { limit: 100 }])
console.log(`X ${X} — ${sigs.length} txs (newest first)\n`)

const counts = { ok: 0, fail: 0 }
for (const s of sigs) {
  await sleep(250)
  const when = s.blockTime ? new Date(s.blockTime * 1000).toISOString().slice(5, 16) : '?'
  if (s.err) { counts.fail++; console.log(`${when}  FAIL  ${JSON.stringify(s.err).slice(0, 90)}  ${s.signature.slice(0, 20)}`); continue }
  const tx = await rpc('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }])
  if (!tx) { console.log(`${when}  ?     ${s.signature.slice(0, 20)}`); continue }
  counts.ok++
  const logs = (tx.meta?.logMessages || [])
  const cpi = logs.filter(l => l.includes('invoke [1]')).map(l => l.replace('Program ', '').replace(' invoke [1]', '').slice(0, 44))
  const programs = [...new Set(cpi)]
  const fee = ((tx.meta?.fee || 0) / 1e9).toFixed(6)
  console.log(`${when}  OK    fee:${fee}  ${s.signature.slice(0, 20)}`)
  if (programs.length) console.log(`        cpi: ${programs.slice(0, 4).join(' | ')}`)
  const notable = logs.find(l => /shie|ghost|shadow|withdraw|deposit|transfer|register|utxo|note/i.test(l))
  if (notable) console.log(`        log: ${notable.trim().slice(0, 120)}`)
}
console.log(`\n=== ${counts.ok} landed / ${counts.fail} failed ===`)
