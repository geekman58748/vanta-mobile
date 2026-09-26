/**
 * Vanta linkability report — answers "can this spend be tied back to my wallet?"
 *
 *   node scripts/linkability-report.mjs --watch <addr,addr,...> [--limit N]
 *
 * Scans recent shielded-pool + registry activity and extracts the edges that
 * deanonymize users: who funded a deposit, who initiated a spend, who registered.
 * Any --watch address appearing in ANY of those txs is a live link.
 */
const RPC = 'https://devnet.helius-rpc.com/?api-key=REDACTED_HELIUS_KEY'
const POOL = 'sppU489D7A4U1exNo1oeMGZtLEofq3a6o2fR7UeoWB6'
const REGISTRY = 'regyS5rkAcw2YzDJCmTwCTHs2s246FXxbmuRZ42u2PD'
const SYSTEM_PROGRAM = '11111111111111111111111111111111'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const args = process.argv.slice(2)
const watch = (args.find(a => a.startsWith('--watch=')) ?? '--watch=').slice(8)
  .split(',').map(s => s.trim()).filter(Boolean)
const limit = Number((args.find(a => a.startsWith('--limit=')) ?? '--limit=15').slice(8))

async function rpc(method, params, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(RPC, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }).then(r => r.json())
    if (r.error?.code === 429) { await sleep(1200 * (i + 1)); continue }
    if (r.error) throw new Error(JSON.stringify(r.error).slice(0, 140))
    return r.result
  }
  throw new Error('rate limited')
}

function short(a) { return a.slice(0, 4) + '…' + a.slice(-4) }

async function scanProgram(label, programId, kind) {
  const sigs = await rpc('getSignaturesForAddress', [programId, { limit }])
  console.log(`\n── ${label}: ${sigs.length} recent txs ──`)
  const edges = []
  for (const s of sigs) {
    await sleep(200)
    if (s.err) continue
    let tx
    try {
      tx = await rpc('getTransaction', [s.signature, {
        encoding: 'jsonParsed', maxSupportedTransactionVersion: 1, commitment: 'confirmed',
      }])
    } catch { continue }
    if (!tx) continue

    const keys = tx.transaction.message.accountKeys
    const feePayer = keys[0]?.pubkey
    const signers = keys.filter(k => k.signer).map(k => k.pubkey)
    const programs = new Set(tx.transaction.message.instructions.map(ix =>
      typeof ix.program === 'string' ? ix.program : ix.programId))

    // SOL movers (only meaningful on system-transfer legs)
    const movers = keys.map((k, i) => ({
      addr: k.pubkey,
      delta: (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / 1e9,
    })).filter(m => Math.abs(m.delta) > 0.00001 && !programs.has(m.addr) &&
      m.addr !== SYSTEM_PROGRAM)

    const touched = new Set([...signers, ...movers.map(m => m.addr)])
    const hits = [...touched].filter(a => watch.includes(a))
    const when = s.blockTime ? new Date(s.blockTime * 1000).toISOString().slice(5, 16) : '?'

    console.log(`${when}  payer ${short(feePayer)}  ${hits.length ? '🔴 LINKED' : '⚪'}  ${s.signature.slice(0, 20)}`)
    if (movers.length) {
      console.log(`         movers: ${movers.map(m => `${short(m.addr)} ${m.delta > 0 ? '+' : ''}${m.delta.toFixed(4)}`).join('  ')}`)
    }
    if (kind === 'registry') console.log(`         owner(signer): ${signers.map(short).join(', ')}`)
    if (hits.length) edges.push({ sig: s.signature, kind, hits, feePayer, when })
  }
  return edges
}

const poolEdges = await scanProgram('SHIELDED POOL', POOL, 'pool')
const regEdges = await scanProgram('USER REGISTRY', REGISTRY, 'registry')

console.log('\n════════ LINKABILITY VERDICT ════════')
console.log(`watched wallets: ${watch.map(short).join(', ') || '(none)'}`)
const all = [...poolEdges, ...regEdges]
if (!all.length) {
  console.log('✅ CLEAN — no watched wallet appears in recent pool/registry activity.')
  console.log('   The spend-side identities are pseudonymous with no visible edge back.')
} else {
  console.log(`❌ ${all.length} on-chain edge(s) tie the watched wallet(s) to privacy activity:\n`)
  for (const e of all) {
    console.log(`  [${e.kind}] ${e.when}  ${e.sig}`)
    console.log(`     exposed: ${e.hits.map(short).join(', ')}   (tx payer: ${short(e.feePayer)})`)
  }
  console.log('\n  → Each edge above is a one-hop walk for anyone with an explorer.')
  console.log('  → Fix: fund the deposit from a single-use burner funded by the relayer,')
  console.log('    never from a wallet the user controls. See docs/vanta-privacy-architecture.md §3.')
}
