// Round-trip check for src/lib/localHistory.js (AUDIT-2026-09-27 H1).
// Run: node scripts/history-store-check.mjs
//
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}

const { loadHistory, saveHistory, clearHistory } = await import('../src/lib/localHistory.js')

let failures = 0
const check = (label, cond, detail = '') => {
  if (!cond) failures++
  console.log(`  ${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
}

// No identity yet → nothing, and no store written.
check('empty before an identity exists', loadHistory().length === 0)
check('no store written before identity', !store.has('vanta-history-v1'))

// Give it an identity, as App.jsx would (vanta-ephemeral holds the X seed).
const seed = Array.from({ length: 64 }, (_, i) => (i * 7) % 256)
store.set('vanta-ephemeral', JSON.stringify({ secretKey: seed }))

const rows = [
  { title: 'Shadow sent', amount: '-0.05 SOL', type: 'expense', isPrivate: true, at: 1759000000000, mode: 'Shadow', symbol: 'SOL', value: 0.05, signature: 'SigOne', proof: 'verified', counterparty: 'bob' },
  { title: 'Ghost received', amount: '+0.02 SOL', type: 'income', isPrivate: true, at: 1759000001000, mode: 'Ghost', symbol: 'SOL', value: 0.02, signature: 'SigTwo', proof: 'observed' },
]

check('save succeeds', saveHistory(rows) === true)
const blob = store.get('vanta-history-v1')
check('blob is not plaintext', blob && !blob.includes('bob') && !blob.includes('SigOne'), `${blob?.length} b64 chars`)

const back = loadHistory()
check('round-trips both rows', back.length === 2, `got ${back.length}`)
check('keeps the recipient (local-only data)', back[0].counterparty === 'bob')
check('keeps amounts', back[0].value === 0.05 && back[1].value === 0.02)
check('keeps the signature', back[1].signature === 'SigTwo')
check('keeps the proof level', back[0].proof === 'verified')

// Tamper: a flipped byte must fail closed and the blob must survive.
const tampered = blob.slice(0, 20) + (blob[20] === 'A' ? 'B' : 'A') + blob.slice(21)
store.set('vanta-history-v1', tampered)
check('tampered blob decrypts to nothing', loadHistory().length === 0)
check('tampered blob is preserved, not cleared', store.get('vanta-history-v1') === tampered)

// Overwrite with real data, then clear.
saveHistory(rows)
check('clear removes the store', (clearHistory(), !store.has('vanta-history-v1')))

console.log(`\n${failures === 0 ? '✓ localHistory all green' : `✗ ${failures} failed`}\n`)
process.exit(failures === 0 ? 0 : 1)
