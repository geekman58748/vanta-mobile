/**
 * Linkability probe: does the shielded recipient that W deposited to reappear
 * in registration / shadow / ghost? Extract candidate 32-byte keys from
 * instruction data and intersect them across the four txs.
 */
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

const TXNS = {
  SHIELD: '3F3BekQio7gWUjxQoZbB5JWMsNQo6xowraoMvdep5pS2qzq4hBQFDBa9h5LKsxwFdriiA9Z5jWjYai5h8HSUTKja',
  REGISTER: '3wsHVkmGK3NNZt4TbLEJ7nopHkHXffSiXhc4tbU9H7dThf2qe3FXusDXqAv8xHPpUuWypr6zqfvq5K382BueqbqF',
  SHADOW: '4xDGsYYXPhDWmGkXn1qPoe3uKhc1hgxG38VUoLFKzHQ4SovMpA4XbnULrU3wA4RV94irTY8Dn77T7RZ6bgChEJVY',
  GHOST: '3WMBf1Spzgipb8ESmvpopi3Z1YP9spZ1jk7MKCsfrPRKTJWW6FPMYKeSHKGbFYq1mpSBvKdSLX7iBGyL81gMCVZ2',
}

const KNOWN = {
  W: '7pyksc7P97ECwouidyPEWrwoogJGwu1KLzUAvsUFV3aT',
  X: '141cNkh4Z9XQ3nBBW2YX3L3o9XqoRQXEaU4jxdfD4HrE',
  G: 'CUT4Fzrgx2GkRRnwatWtEHkE2j5wMW3vsAMpkEcCRNmY',
  bob: '9b4j2Fenrw4Ut49LG7ooQNiyfBTuDqhmDqvWWq4UN44a',
  relayer: 'FhV7cyfVAC8gyQqSRYiw5oKdC95GVw83ukvxhhu7uRk7',
}

// base58 (BTC alphabet) — decode any 32-byte window back to an address for labeling
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function b58encode(bytes) {
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++
  const digits = [0]
  for (const byte of bytes) {
    let carry = byte
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8
      digits[i] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  return '1'.repeat(zeros) + digits.reverse().map((d) => B58[d]).join('')
}

const fetched = {}
for (const [name, sig] of Object.entries(TXNS)) {
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
  if (!tx) {
    console.log(`${name}: not found`)
    continue
  }
  fetched[name] = tx
}

// collect every 32-byte-aligned-ish window from all instruction data of a tx
function windows32(dataB64) {
  const buf = Buffer.from(dataB64, 'base64')
  const out = new Set()
  for (let off = 0; off + 32 <= buf.length; off++) {
    out.add(Buffer.from(buf.subarray(off, off + 32)).toString('hex'))
  }
  return { set: out, len: buf.length }
}

const perTx = {}
for (const [name, tx] of Object.entries(fetched)) {
  const ixs = tx.transaction.message.instructions ?? []
  const inner = tx.meta?.innerInstructions?.flatMap((x) => x.instructions) ?? []
  const all = [...ixs, ...inner]
  const combined = new Set()
  let totalLen = 0
  for (const ix of all) {
    if (!ix.data) continue
    const w = windows32(ix.data)
    totalLen += w.len
    for (const h of w.set) combined.add(h)
  }
  perTx[name] = combined
  console.log(`${name}: ${all.filter((i) => i.data).length} data ixs, ${totalLen} data bytes, ${combined.size} distinct 32B windows`)
}

function label(hex) {
  const addr = b58encode(Buffer.from(hex, 'hex'))
  const who = Object.entries(KNOWN).find(([, a]) => a === addr)
  return who ? `${who[0]}=${addr}` : addr
}

// pairwise intersections (exclude windows that are obviously alloc/system 32B noise? show all)
const names = Object.keys(perTx)
console.log('\n── pairwise shared 32-byte windows (candidate identities in data) ──')
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const a = names[i]
    const b = names[j]
    const shared = [...perTx[a]].filter((h) => perTx[b].has(h))
    // filter out windows that are almost certainly not keys: keep only those
    // decoding to something meaningful OR appearing in >= 2 txs of interest
    console.log(`\n${a} ∩ ${b}: ${shared.length}`)
    for (const h of shared.slice(0, 12)) console.log(`   ${h}  ${label(h)}`)
  }
}

// the decisive question: does SHIELD's data key appear in GHOST or SHADOW?
console.log('\n── decisive: SHIELD data windows ∩ (SHADOW ∪ GHOST) ──')
const spend = new Set([...(perTx.SHADOW ?? []), ...(perTx.GHOST ?? [])])
const hits = [...(perTx.SHIELD ?? [])].filter((h) => spend.has(h))
console.log(`hits: ${hits.length}`)
for (const h of hits.slice(0, 20)) console.log(`   ${h}  ${label(h)}`)
