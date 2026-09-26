/**
 * Tops up the relayer wallet from devnet faucets (retries both paths).
 *   node scripts/topup-relayer.mjs [amountSOL]
 */
import { Keypair } from '@solana/web3.js'
import { readFileSync } from 'fs'

const amount = Number(process.argv[2] || 2)
const relayer = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(readFileSync('./relayer/relayer-keypair.json', 'utf-8'))),
)
const dest = relayer.publicKey.toBase58()
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function balance() {
  const res = await fetch('https://api.devnet.solana.com', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [dest] }),
  }).then(r => r.json())
  return res.result.value / 1e9
}

console.log(`Relayer ${dest} — current: ${await balance()} SOL`)

for (let attempt = 1; attempt <= 5; attempt++) {
  // Path 1: classic RPC airdrop
  try {
    const res = await fetch('https://api.devnet.solana.com', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'requestAirdrop', params: [dest, Math.round(amount * 1e9)] }),
    }).then(r => r.json())
    if (res.result) {
      console.log(`attempt ${attempt}: airdrop requested — ${res.result}`)
      await sleep(12000)
      const b = await balance()
      console.log(`balance now: ${b} SOL`)
      if (b > 0.3) { console.log('✅ topped up'); process.exit(0) }
    } else {
      console.log(`attempt ${attempt}: RPC airdrop error: ${JSON.stringify(res.error).slice(0, 100)}`)
    }
  } catch (e) {
    console.log(`attempt ${attempt}: RPC airdrop threw: ${e.message}`)
  }

  // Path 2: faucet.solana.com
  try {
    const res = await fetch('https://faucet.solana.com/api/request-airdrop', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: dest, amount }),
    })
    const text = await res.text()
    if (text.trim().startsWith('{')) {
      const json = JSON.parse(text)
      console.log(`attempt ${attempt}: faucet.solana.com → ${JSON.stringify(json).slice(0, 140)}`)
      await sleep(12000)
      const b = await balance()
      console.log(`balance now: ${b} SOL`)
      if (b > 0.3) { console.log('✅ topped up'); process.exit(0) }
    } else {
      console.log(`attempt ${attempt}: faucet.solana.com returned HTML (${res.status}) — first 80 chars: ${text.slice(0, 80)}`)
    }
  } catch (e) {
    console.log(`attempt ${attempt}: faucet.solana.com threw: ${e.message}`)
  }

  if (attempt < 5) { console.log(`waiting 25s before retry…\n`); await sleep(25000) }
}

console.log(`\n❌ automatic top-up failed. Manual fix (30s): open https://faucet.solana.com, paste ${dest}, request 2 SOL (may need 2 requests).`)
process.exit(1)
