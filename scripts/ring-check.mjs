#!/usr/bin/env node
/**
 * Verify the custom ring this build points at, against the vendored binary.
 *
 * What it proves, one line each:
 *   1. The committed `.so` is the release artifact it claims to be (sha256).
 *   2. That exact binary is the one deployed at the ring program id, byte for
 *      byte (the loader's deployed hash, not a structural resemblance).
 *   3. The ring has a config, and it says out loud who the auditor is. The
 *      auditor key is the one real trade of a custom ring over the default
 *      pool, so it is printed rather than buried.
 *
 * Usage:
 *   node scripts/ring-check.mjs 8aMW8MPHBn4oGsss2NuB4QNvFx6iBSB8RHHkMAHrZduU
 *   RING_PROGRAM_ID=... RING_RPC_URL=https://... node scripts/ring-check.mjs
 *
 * Exit codes: 0 verified, 1 mismatch, 2 bad usage / not deployed.
 */
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createZolanaClient } from '@heliuslabs/zolana'
import {
  RingProgramBinary,
  fetchRingConfigs,
  fetchRingProgramData,
  verifyRingProgram,
} from '@heliuslabs/zolana/ring'

// The release asset this repository vendors. Regenerate with the command in
// vendor/README.md; update BOTH the digest and the file together.
const SO_URL = new URL('../vendor/ring/custom-ring-program-v0.4.0-alpha.so', import.meta.url)
const SO_SHA256 = '46a890a2b001a92baf269f161a7819e02e6de89d5dd0df873799615ffaa78c6e'

const ringProgramId = (process.env.RING_PROGRAM_ID || process.argv[2] || '').trim()
const rpcUrl = (process.env.RING_RPC_URL || 'https://api.devnet.solana.com').trim()
const indexerUrl = process.env.VITE_INDEXER_URL || 'https://d2xah7tnhdhcom.cloudfront.net'
const proverUrl = process.env.VITE_PROVER_URL || 'https://d21ni15goiip6l.cloudfront.net'

if (!ringProgramId) {
  console.error('usage: node scripts/ring-check.mjs <ring-program-id>')
  console.error('   or: RING_PROGRAM_ID=<id> node scripts/ring-check.mjs')
  process.exit(2)
}

const fail = (message) => {
  console.error(`✗ ${message}`)
  process.exit(1)
}

const bytes = new Uint8Array(await readFile(SO_URL))
const digest = createHash('sha256').update(bytes).digest('hex')
if (digest !== SO_SHA256) {
  fail(`vendored binary digest ${digest} does not match the pinned ${SO_SHA256}`)
}
console.log(`✓ vendored binary  ${SO_SHA256}`)
console.log(`  ${bytes.byteLength} bytes, Apache-2.0, zolana v0.4.0-alpha`)

const binary = RingProgramBinary.parse(bytes)
const client = await createZolanaClient({
  solanaRpcUrl: rpcUrl,
  indexerUrl,
  proverUrl,
})

let programData
try {
  programData = await verifyRingProgram(client, ringProgramId, binary)
} catch (err) {
  fail(`ring program ${ringProgramId} is not the vendored binary: ${err?.message ?? err}`)
}
console.log(`✓ deployed binary  ${ringProgramId}`)
console.log(`  last deploy slot ${programData.lastDeploySlot}`)
console.log(
  `  upgrade authority ${programData.upgradeAuthority ?? 'renounced (immutable)'}`,
)

const data = await fetchRingProgramData(client, ringProgramId)
if (!data) fail(`no program data at ${ringProgramId}`)

const configs = await fetchRingConfigs(client, ringProgramId)
console.log('✓ ring config')
console.log(`  authority ${configs.config.authority}`)
// Compressed SEC1 hex, the same value the CLI writes to keys/auditor.key.pub,
// so the two can be compared by eye.
const auditor = Buffer.from(configs.config.auditorPublicKey.toBytes()).toString('hex')
console.log(`  auditor   ${auditor}`)
console.log(`  policy    ${configs.hasPolicy ? 'pinned' : 'none (audit-only ring)'}`)
console.log(`  key escrow ${configs.config.keyEscrow ? 'on' : 'off'}`)
console.log('\nThe auditor key can open every transfer on this ring. Every ring receipt says so.')
