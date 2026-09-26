import { PublicKey } from '@solana/web3.js'

const HELIUS_KEY = process.env.VITE_HELIUS_API_KEY ?? process.env.HELIUS_API_KEY ?? ''
const RPC = HELIUS_KEY ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : 'https://api.devnet.solana.com'
const PROGRAMS = {
  'shielded-pool (sppU489)': 'sppU489D7A4U1exNo1oeMGZtLEofq3a6o2fR7UeoWB6',
  'user-registry (regyS5rk)': 'regyS5rkAcw2YzDJCmTwCTHs2s246FXxbmuRZ42u2PD',
}

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }).then(r => r.json())
  if (r.error) throw new Error(JSON.stringify(r.error).slice(0, 150))
  return r.result
}

async function readU64LE(base58) {
  const buf = Buffer.from(base58, 'base64')
  return Number(buf.readBigUInt64LE(4))
}

for (const [label, addr] of Object.entries(PROGRAMS)) {
  try {
    const prog = await rpc('getAccountInfo', [addr, { encoding: 'base64' }])
    const programDataAddr = new PublicKey(Buffer.from(prog.value.data[0], 'base64').subarray(4, 36)).toBase58()
    const pd = await rpc('getAccountInfo', [programDataAddr, { encoding: 'base64' }])
    const slot = await readU64LE(pd.value.data[0])
    const time = await rpc('getBlockTime', [slot]).catch(() => null)
    console.log(`${label}`)
    console.log(`  last deployed slot: ${slot}`)
    console.log(`  deployed at: ${time ? new Date(time * 1000).toISOString() : 'unknown'}`)
  } catch (e) {
    console.log(`${label}: ${e.message}`)
  }
}
console.log(`\nreference: successful deposits on 2026-09-21 13:36-14:43 local (~11:36-12:43 UTC)`)
console.log(`now: ${new Date().toISOString()}`)
