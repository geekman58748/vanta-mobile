import { Keypair } from '@solana/web3.js'
import { readFileSync } from 'fs'

const secret = JSON.parse(readFileSync('./relayer/relayer-keypair.json', 'utf-8'))
const relayer = Keypair.fromSecretKey(new Uint8Array(secret))
const RELAYER = relayer.publicKey.toBase58()
const RPC = 'https://api.devnet.solana.com'

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = await res.json()
  if (json.error) throw new Error(JSON.stringify(json.error))
  return json.result
}

const sigs = await rpc('getSignaturesForAddress', [RELAYER, { limit: 25 }])
console.log(`Relayer ${RELAYER} — ${sigs.length} recent txs\n`)

for (const s of sigs) {
  const when = s.blockTime ? new Date(s.blockTime * 1000).toISOString().slice(5, 16) : '?'
  if (s.err) {
    console.log(`${when}  FAIL          ${s.signature}`)
    continue
  }
  const tx = await rpc('getTransaction', [
    s.signature,
    { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1, commitment: 'confirmed' },
  ])
  if (!tx) { console.log(`${when}  ?(not found)  ${s.signature}`); continue }

  const accounts = (tx.transaction.message.accountKeys || []).map(k => k.pubkey)
  const isSigner = accounts.includes(RELAYER) &&
    tx.transaction.message.accountKeys.find(k => k.pubkey === RELAYER)?.signer
  const programs = new Set()
  for (const ix of tx.transaction.message.instructions) {
    programs.add(ix.program ?? (typeof ix.programId === 'string' ? ix.programId : ix.programId?.toBase58?.() ?? '?'))
  }
  const solChange = (tx.meta.postBalances[0] - tx.meta.preBalances[0]) / 1e9
  const logs = (tx.meta.logMessages || []).join(' ')
  const zk = /utxo|zolana|privacy|shadow|ghost|note/i.test(logs)
  const kind = zk ? 'ZK OP' : programs.has('system') ? 'FUND?' : 'OTHER'
  const firstLog = (tx.meta.logMessages || [])[1] || ''
  console.log(`${when}  ${kind.padEnd(7)} signer:${isSigner ? 'Y' : 'n'} Δ:${solChange.toFixed(6)}  ${s.signature.slice(0, 20)}`)
  console.log(`        progs: ${[...programs].slice(0, 3).join(', ').slice(0, 100)}`)
  console.log(`        ${firstLog.slice(0, 130)}`)
}
