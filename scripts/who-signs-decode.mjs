/** Decode pass for who-signs-check.mjs — no new transactions, just getTransaction on known sigs. */
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const HELIUS = env.VITE_HELIUS_API_KEY || ''
let RPC_URL = HELIUS ? `https://devnet.helius-rpc.com/?api-key=${HELIUS}` : 'https://api.devnet.solana.com'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function rawRpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }).then((r) => r.json())
  if (res.error) throw new Error(`${method}: ${JSON.stringify(res.error)}`)
  return res.result
}

const ADDR = {
  W: '7pyksc7P97ECwouidyPEWrwoogJGwu1KLzUAvsUFV3aT',
  X: '141cNkh4Z9XQ3nBBW2YX3L3o9XqoRQXEaU4jxdfD4HrE',
  G: 'CUT4Fzrgx2GkRRnwatWtEHkE2j5wMW3vsAMpkEcCRNmY',
  bob: '9b4j2Fenrw4Ut49LG7ooQNiyfBTuDqhmDqvWWq4UN44a',
  relayer: 'FhV7cyfVAC8gyQqSRYiw5oKdC95GVw83ukvxhhu7uRk7',
}

const TXNS = [
  ['fund X float (relayer → X)', '5JRuNLiKyvtxrpyckd6hgScnHG7D9QErimuu3QCwtyJs3Ma34seo6Yu6Hu8RifGuC8JcuLVasnPt21Y8rfewPwxA'],
  ['fund W (relayer → W)', '4AadFLXrx5WPqPZc5h3HYVxvZXgou2LUtouHHD55QKqoXDsfoU13DNHkfGy1EYBkBe1eNdJaekRynsEvp81sse3x'],
  ['register X (relayer pays)', '3wsHVkmGK3NNZt4TbLEJ7nopHkHXffSiXhc4tbU9H7dThf2qe3FXusDXqAv8xHPpUuWypr6zqfvq5K382BueqbqF'],
  ['SHIELD W → pool → X', '3F3BekQio7gWUjxQoZbB5JWMsNQo6xowraoMvdep5pS2qzq4hBQFDBa9h5LKsxwFdriiA9Z5jWjYai5h8HSUTKja'],
  ['SHADOW X → bob (v2v)', '4xDGsYYXPhDWmGkXn1qPoe3uKhc1hgxG38VUoLFKzHQ4SovMpA4XbnULrU3wA4RV94irTY8Dn77T7RZ6bgChEJVY'],
  ['GHOST X → G (withdrawal)', '3WMBf1Spzgipb8ESmvpopi3Z1YP9spZ1jk7MKCsfrPRKTJWW6FPMYKeSHKGbFYq1mpSBvKdSLX7iBGyL81gMCVZ2'],
]

function roleOf(addr, t) {
  if (t.feePayer === addr) return 'IS FEE PAYER (paid the fee)'
  if (t.signers.includes(addr)) return 'signer, did NOT pay'
  return 'present as non-signer account'
}

async function describe(label, signature) {
  let tx = null
  for (const ver of [1, 0]) {
    for (let i = 0; i < 8 && !tx; i++) {
      try {
        tx = await rawRpc('getTransaction', [signature, { commitment: 'confirmed', maxSupportedTransactionVersion: ver }])
      } catch (e) {
        if (/not supported/i.test(String(e.message))) break
      }
      if (!tx) await sleep(2000)
    }
    if (tx) break
  }
  if (!tx) return { label, signature, error: 'not found' }
  const msg = tx.transaction.message
  const keys = (msg.staticAccountKeys ?? msg.accountKeys ?? []).map((k) =>
    typeof k === 'string' ? k : k.pubkey ?? k.toBase58?.() ?? String(k),
  )
  const n = msg.header?.numRequiredSignatures ?? keys.length
  return {
    label,
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null,
    feePayer: keys[0] ?? null,
    signers: keys.slice(0, n),
    feeLamports: tx.meta?.fee ?? null,
    accounts: keys,
    err: tx.meta?.err ?? null,
  }
}

console.log('══════ RAW ON-CHAIN DECODE — who signed, who paid ══════')
for (const [label, sig] of TXNS) {
  const t = await describe(label, sig)
  console.log(`\n── ${t.label} ──`)
  if (t.error) {
    console.log(`   ✗ ${t.error}`)
    continue
  }
  console.log(`   signature : ${t.signature}`)
  console.log(`   explorer  : https://explorer.solana.com/tx/${t.signature}?cluster=devnet`)
  console.log(`   when      : ${t.blockTime} · slot ${t.slot}${t.err ? ' · ⚠ ' + JSON.stringify(t.err) : ''}`)
  console.log(`   fee payer : ${t.feePayer}  ← PAID ${(t.feeLamports / 1e9).toFixed(6)} SOL`)
  for (const s of t.signers) console.log(`   signer    : ${s}   (${roleOf(s, t)})`)
  // who of our cast appears at all
  const cast = Object.entries(ADDR).filter(([, a]) => t.accounts.includes(a)).map(([n]) => n)
  console.log(`   cast in tx: ${cast.join(', ') || '(none of ours)'}`)
}

// ghost destination balance
const bal = await rawRpc('getBalance', [ADDR.G])
console.log(`\nghost dest G balance: ${(bal.value / 1e9).toFixed(6)} SOL`)
