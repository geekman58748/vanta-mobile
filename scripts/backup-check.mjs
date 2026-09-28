// Round-trip check for src/lib/backup.js (AUDIT-2026-09-27 H4/C3).
// Run: node scripts/backup-check.mjs
//
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}

const { createBackup, openBackup, applyBackup, describeBackup } = await import('../src/lib/backup.js')

let failures = 0
const check = (label, cond, detail = '') => {
  if (!cond) failures++
  console.log(`  ${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
}

const seed = Array.from({ length: 64 }, (_, i) => (i * 11 + 3) % 256)
const walletSeed = Array.from({ length: 64 }, (_, i) => (i * 5 + 7) % 256)
store.set('vanta-ephemeral', JSON.stringify({ secretKey: seed, publicKey: 'IDENTITY' }))
store.set('vanta-wallet-session', JSON.stringify({ publicKey: 'PubKey111', secretKey: walletSeed }))
store.set('vanta-wallet-active', 'session')
store.set('vanta-wallet', JSON.stringify({ publicKey: 'PubKey111', secretKey: walletSeed }))
store.set('vanta-zwallet', 'ENCRYPTED-NOTES-BLOB')
store.set('vanta-history-v1', 'ENCRYPTED-HISTORY-BLOB')

check('short passphrase refused', (await createBackup('short')).ok === false)
const made = await createBackup('correct horse battery')
check('backup created', made.ok === true, made.error ?? '')
check('envelope hides the seed', made.ok && !made.text.includes('secretKey') && !made.text.includes('ENCRYPTED'))

const good = await openBackup(made.text, 'correct horse battery')
check('opens with the right passphrase', good.ok === true, good.error ?? '')
check('payload has the identity', good.ok && good.payload.identity.secretKey[0] === seed[0])
check('payload has the in-app wallet', good.ok && good.payload.wallet.publicKey === 'PubKey111')
const summary = describeBackup(good.payload)
check('summary lists wallet + notes + history', summary.wallet === 'PubKey111' && summary.hasNotes && summary.hasHistory)

const wrong = await openBackup(made.text, 'wrong passphrase here')
check('wrong passphrase refused', wrong.ok === false, wrong.error)
const corrupt = await openBackup(made.text.slice(0, made.text.length - 8) + 'AAAAAAA=', 'correct horse battery')
check('truncated text refused', corrupt.ok === false, corrupt.error)
check('garbage refused', (await openBackup('not-a-backup', 'correct horse battery')).ok === false)
check('non-Vanta JSON refused', (await openBackup(btoa('{"hello":1}'), 'x')).ok === false)

// Wipe the device, then restore.
for (const k of [...store.keys()]) store.delete(k)
check('device is empty before restore', store.size === 0)
const applied = applyBackup(good.payload)
check('apply succeeds', applied.ok === true, applied.error ?? '')
check('identity restored', JSON.parse(store.get('vanta-ephemeral')).secretKey[0] === seed[0])
check('session slot restored', JSON.parse(store.get('vanta-wallet-session')).publicKey === 'PubKey111')
check('active pointer set to session', store.get('vanta-wallet-active') === 'session')
check('legacy mirror kept in step', JSON.parse(store.get('vanta-wallet')).publicKey === 'PubKey111')
check('notes restored', store.get('vanta-zwallet') === 'ENCRYPTED-NOTES-BLOB')
check('history restored', store.get('vanta-history-v1') === 'ENCRYPTED-HISTORY-BLOB')

console.log(`\n${failures === 0 ? '✓ backup all green' : `✗ ${failures} failed`}\n`)
process.exit(failures === 0 ? 0 : 1)
