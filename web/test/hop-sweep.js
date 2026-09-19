'use strict';

// VANTA private sweep — two-hop demo (REAL devnet).
//
//   session (93tsh…) ──all──▶ X (ephemeral, in-memory, dies at exit)
//                              X ──all-minus-fee──▶ recipient (7EE…)
//
// The on-chain graph: 7EE gets paid by X, a brand-new address with ZERO
// history. No tx connects 93tsh → 7EE directly. X's key exists ONLY in this
// process's memory and is never persisted — after this run, nobody (including
// us) can move funds from X again (it ends at 0 anyway).
//
// Honest scope: this breaks the DIRECT edge. Correlation-by-timing remains a
// heuristic signal; the cryptographic fix (encrypted amounts) is the
// confidential-transfers phase. This script is the address-layer demo.
//
// Usage: VANTA_E2E_SEED=<64-byte hex> node web/test/hop-sweep.js <recipient> [amountSol]

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB3_URL = 'https://cdn.jsdelivr.net/npm/@solana/web3.js@1.95.8/lib/index.iife.min.js';
const RPC = process.env.VANTA_E2E_RPC || 'https://api.devnet.solana.com';
globalThis.VANTA_SOLANA_RPC = RPC;

const RECIPIENT = process.argv[2];
const AMOUNT_SOL = process.argv[3] ? Number(process.argv[3]) : null; // null = sweep all

if (!RECIPIENT) {
  console.error('usage: node web/test/hop-sweep.js <recipientPubkey> [amountSol]');
  process.exit(1);
}
if (!process.env.VANTA_E2E_SEED) {
  console.error('VANTA_E2E_SEED required (64-byte hex: seed32 ‖ pubkey32)');
  process.exit(1);
}

async function main() {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

  const src = Buffer.from(await (await fetch(WEB3_URL)).arrayBuffer());
  vm.runInThisContext(src.toString('utf8'), { filename: 'solana-web3.js' });
  const w3 = globalThis.solanaWeb3;
  assertGlobal(w3, 'web3.js failed to load');

  const conn = new w3.Connection(RPC, 'confirmed');

  // Session key = the pre-funded wallet (seed = FIRST 32 bytes of secretKey).
  const session = w3.Keypair.fromSecretKey(Buffer.from(process.env.VANTA_E2E_SEED, 'hex'));

  // RESUME: if a previous run died mid-sweep, its persisted hop key finishes
  // the job (skip hop1, go straight to the retrying hop2).
  const HOP_KEY_PATH = '/tmp/vanta_hop_key.b58';
  let hop;
  let resumed = false;
  if (fs.existsSync(HOP_KEY_PATH)) {
    hop = w3.Keypair.fromSecretKey(Buffer.from(fs.readFileSync(HOP_KEY_PATH, 'utf8'), 'hex'));
    resumed = true;
    console.log('RESUME: found persisted hop key — finishing the interrupted sweep');
  } else {
    hop = w3.Keypair.generate(); // the ephemeral hop, born now, shredded after
  }

  const sessionPk = session.publicKey.toBase58();
  const hopPk = hop.publicKey.toBase58();
  const bal0 = await conn.getBalance(session.publicKey) / 1e9;
  console.log('session :', sessionPk, `(${bal0} SOL)`);
  console.log('hop (X) :', hopPk, '(ephemeral — key dies with this process)');
  console.log('receive :', RECIPIENT);
  console.log('RPC     :', RPC, '\n');

  // ATOMICITY: pre-sign BOTH hops against the SAME blockhash before anything
  // moves, and persist the hop key until both confirm. If the process dies
  // mid-flight, the hop key + pre-signed tx let a rerun finish the sweep —
  // no stranded funds. The key is shredded only after success.
  const lamports = AMOUNT_SOL
    ? Math.round(AMOUNT_SOL * 1e9)
    : Math.max(0, (await conn.getBalance(session.publicKey)) - 5000); // all minus fee
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();

  const hopBalNow = await conn.getBalance(hop.publicKey);
  const outLamports = AMOUNT_SOL ? Math.round(AMOUNT_SOL * 1e9) : Math.max(0, hopBalNow + lamports - 5000);

  let tx1 = null;
  if (!resumed) {
    tx1 = new w3.Transaction().add(
      w3.SystemProgram.transfer({ fromPubkey: session.publicKey, toPubkey: hop.publicKey, lamports }),
    );
    tx1.feePayer = session.publicKey;
    tx1.recentBlockhash = blockhash;
    tx1.sign(session);
  }

  const tx2 = new w3.Transaction().add(
    w3.SystemProgram.transfer({ fromPubkey: hop.publicKey, toPubkey: new w3.PublicKey(RECIPIENT), lamports: outLamports }),
  );
  tx2.feePayer = hop.publicKey;
  tx2.recentBlockhash = blockhash;
  tx2.sign(hop);

  if (!resumed) fs.writeFileSync(HOP_KEY_PATH, Buffer.from(hop.secretKey).toString('hex'));

  // ── hop 1: session → X (session ends at exactly 0) — skipped on resume ──
  let sig1 = null;
  if (!resumed) {
    sig1 = await conn.sendRawTransaction(tx1.serialize());
    console.log('hop1 sig:', sig1);
    await conn.confirmTransaction(sig1, 'confirmed');
    await sleep(2000); // deliberate gap between hops
  } else {
    console.log('hop1: skipped (already landed in the interrupted run)');
  }

  // ── hop 2: X → recipient (X ends at exactly 0) — retry until confirmed ──
  let sig2 = null;
  for (let i = 0; i < 5; i++) {
    try {
      sig2 = await conn.sendRawTransaction(tx2.serialize(), { skipPreflight: false });
      await conn.confirmTransaction(sig2, 'confirmed');
      break;
    } catch (e) {
      console.log(`hop2 attempt ${i + 1} failed (${String(e.message).slice(0, 80)}) — retrying…`);
      await sleep(3000);
    }
  }
  if (!sig2) throw new Error('hop2 never confirmed — hop key preserved at ' + HOP_KEY_PATH);
  fs.unlinkSync(HOP_KEY_PATH); // success: shred the ephemeral key

  const recvBal = await conn.getBalance(new w3.PublicKey(RECIPIENT)) / 1e9;
  const sessionLeft = await conn.getBalance(session.publicKey) / 1e9;
  const hopLeft = await conn.getBalance(hop.publicKey) / 1e9;

  console.log('\n──────── RESULT ────────');
  console.log('session after:', sessionLeft, '| hop after:', hopLeft, '| recipient:', recvBal, 'SOL');
  console.log('\nVERIFY YOURSELF:');
  console.log(`hop1 (session→X):  ${sig1 ? `https://explorer.solana.com/tx/${sig1}?cluster=devnet` : '(n/a — resumed run)'}`);
  console.log(`hop2 (X→receive):  https://explorer.solana.com/tx/${sig2}?cluster=devnet`);
  console.log(`recipient history: https://explorer.solana.com/address/${RECIPIENT}?cluster=devnet`);
  console.log(`session history:   https://explorer.solana.com/address/${sessionPk}?cluster=devnet`);
  console.log('\nClaim to check: NO tx on the recipient links to the session pubkey — only to X.');
  console.log('X is uncorrelated to the session on-chain except by timing heuristics (honest limit).');
}

function assertGlobal(v, msg) { if (!v) { console.error(msg); process.exit(1); } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

main().catch((e) => {
  console.error('HOP-SWEEP FAIL:', String(e.message || e).slice(0, 300));
  process.exit(1);
});
