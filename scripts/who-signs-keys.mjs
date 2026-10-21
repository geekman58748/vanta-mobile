/** Print EVERY static account key of the six test txs — what each tx actually exposes. */
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
const RPC_URL = HELIUS ? `https://devnet.helius-rpc.com/?api-key=${HELIUS}` : 'https://api.devnet.solana.com'
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

const KNOWN = {
  W: '7pyksc7P97ECwouidyPEWrwoogJGwu1KLzUAvsUFV3aT',
  X: '141cNkh4Z9XQ3nBBW2YX3L3o9XqoRQXEaU4jxdfD4HrE',
  G: 'CUT4Fzrgx2GkRRnwatWtEHkE2j5wMW3vsAMpkEcCRNmY',
  bob: '9b4j2Fenrw4Ut49LG7ooQNiyfBTuDqhmDqvWWq4UN44a',
  relayer: 'FhV7cyfVAC8gyQqSRYiw5oKdC95GVw83ukvxhhu7uRk7',
  pool: 'sppU489D7A4U1exNo1oeMGZtLEofq3a6o2fR7UeoWB6',
  registry: 'regyS5rkAcw2YzDJCmTwCTHs2s246FXxbmuRZ42u2PD',
  system: '11111111111111111111111111111111',
}

const TXNS = [
  ['SHIELD W → pool', '3F3BekQio7gWUjxQoZbB5JWMsNQo6xowraoMvdep5pS2qzq4hBQFDBa9h5LKsxwFdriiA9Z5jWjYai5h8HSUTKja'],
  ['REGISTER X', '3wsHVkmGK3NNZt4TbLEJ7nopHkHXffSiXhc4tbU9H7dThf2qe3FXusDXqAv8xHPpUuWypr6zqfvq5K382BueqbqF'],
  ['SHADOW X → bob', '4xDGsYYXPhDWmGkXn1qPoe3uKhc1hgxG38VUoLFKzHQ4SovMpA4XbnULrU3wA4RV94irTY8Dn77T7RZ6bgChEJVY'],
  ['GHOST X → G', '3WMBf1Spzgipb8ESmvpopi3Z1YP9spZ1jk7MKCsfrPRKTJWW6FPMYKeSHKGbFYq1mpSBvKdSLX7iBGyL81gMCVZ2'],
]

for (const [label, sig] of TXNS) {
  let tx = null
  for (const ver of [1, 0]) {
    for (let i = 0; i < 6 && !tx; i++) {
      try {
        tx = await rawRpc('getTransaction', [sig, { commitment: 'confirmed', maxSupportedTransactionVersion: ver }])
      } catch (e) {
        if (/not supported/i.test(String(e.message))) break
      }
      if (!tx) await sleep(2000)
    }
    if (tx) break
  }
  console.log(`\n── ${label} ──`)
  if (!tx) {
    console.log('   ✗ not found')
    continue
  }
  const msg = tx.transaction.message
  const keys = (msg.staticAccountKeys ?? msg.accountKeys ?? []).map((k) =>
    typeof k === 'string' ? k : k.pubkey ?? k.toBase58?.() ?? String(k),
  )
  const n = msg.header?.numRequiredSignatures ?? keys.length
  keys.forEach((k, i) => {
    const who = Object.entries(KNOWN).find(([, a]) => a === k)
    const tag = who ? who[0] : '—'
    const flags = `${i < n ? 'SIGNER' : '     '} ${i === 0 ? 'FEEPAYER' : '        '}`
    console.log(`   [${flags}] ${k}  ${tag}`)
  })
}
