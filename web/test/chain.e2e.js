'use strict';

// MANUAL devnet end-to-end test for web/vanta-chain.js — run with:
//   node web/test/chain.e2e.js
//
// Not part of the CI suite (needs network + devnet faucet). Exercises the
// REAL file against REAL Solana devnet: airdrop → shielded send → sweep-back.
// The session signer here is node:crypto Ed25519 — byte-identical wire
// behavior to the browser's WebCrypto signer the engine uses.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert');

const WEB3_URL = 'https://cdn.jsdelivr.net/npm/@solana/web3.js@1.95.8/lib/index.iife.min.js';

// RPC target: devnet by default; set VANTA_E2E_RPC for a local validator
// (web/test/localnet-e2e.sh does exactly that — unlimited airdrops, no faucet).
const RPC = process.env.VANTA_E2E_RPC || 'https://api.devnet.solana.com';
globalThis.VANTA_SOLANA_RPC = RPC; // picked up by vanta-chain.js at attach time

async function main() {
  // The web3.js IIFE references `window` in its subscription path — fine in a
  // browser, a ReferenceError in Node. Node ≥22 has a native WebSocket, so
  // aliasing window→globalThis gives the IIFE everything it needs.
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

  // 1. Load web3.js IIFE into this context (what the browser <script> does).
  const src = Buffer.from(await (await fetch(WEB3_URL)).arrayBuffer());
  vm.runInThisContext(src.toString('utf8'), { filename: 'solana-web3.js' });
  assert.ok(globalThis.solanaWeb3, 'web3.js must expose the solanaWeb3 global');

  // 2. Load vanta-chain.js exactly as shipped (window undefined → root=globalThis;
  //    loadWeb3() finds the preloaded global, so no DOM is touched).
  const chainSrc = fs.readFileSync(path.join(__dirname, '..', 'vanta-chain.js'), 'utf8');
  vm.runInThisContext(chainSrc, { filename: 'vanta-chain.js' });
  const VantaChain = globalThis.VantaChain;
  assert.ok(VantaChain, 'VantaChain must be exported');

  const w3 = globalThis.solanaWeb3;

  // 3. Session wallet + recipients.
  // VANTA_E2E_SEED: 64-byte hex [seed(32) ‖ pubkey(32)] of a PRE-FUNDED
  // keypair (e.g. funded from a devnet-capable wallet when the faucet is
  // rate-limited). Lets the test run against a known, externally funded key.
  const session = process.env.VANTA_E2E_SEED
    ? w3.Keypair.fromSecretKey(Buffer.from(process.env.VANTA_E2E_SEED, 'hex'))
    : w3.Keypair.generate();
  const recipient = w3.Keypair.generate(); // an "unrelated" party on-chain
  const mainWallet = w3.Keypair.generate(); // sweep destination ("main")
  // node:crypto needs a KeyObject — wrap the 32-byte ed25519 seed in PKCS8.
  // (web3.js secretKey layout = [32-byte seed ‖ 32-byte public key]; the SEED
  // is the FIRST half.)
  const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
  const sessionPriv = crypto.createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, session.secretKey.subarray(0, 32)]),
    format: 'der',
    type: 'pkcs8',
  });
  const sessionSigner = async (wireBytes) => crypto.sign(null, wireBytes, sessionPriv);

  console.log('session :', session.publicKey.toBase58());
  console.log('recipient:', recipient.publicKey.toBase58());

  // 4. ATA derivation sanity (offline, deterministic PDA math).
  const usdcMint = new w3.PublicKey(VantaChain.USDC.mint);
  const TOKEN_PROGRAM = new w3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const ATA_PROGRAM = new w3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  const [ataOwner, ataBump] = w3.PublicKey.findProgramAddressSync(
    [session.publicKey.toBuffer(), TOKEN_PROGRAM.toBuffer(), usdcMint.toBuffer()],
    ATA_PROGRAM,
  );
  assert.ok(Number.isInteger(ataBump) && ataBump >= 0 && ataBump <= 255, 'ATA PDA bump sanity');
  assert.ok(!ataOwner.equals(w3.PublicKey.default), 'ATA PDA must derive');
  console.log('ATA derivation OK (bump', ataBump + ')');

  // 5. Fund the session wallet. With VANTA_E2E_SEED the key is ALREADY
  // funded externally (e.g. from a devnet-capable wallet when the faucet is
  // rate-limited) — airdrop becomes best-effort, the balance check decides.
  let funded = false;
  for (let i = 0; i < (process.env.VANTA_E2E_SEED ? 1 : 5) && !funded; i++) {
    try {
      await VantaChain.requestAirdrop(session.publicKey.toBase58(), 1);
      funded = true;
    } catch (e) {
      console.log(`airdrop attempt ${i + 1} failed (${String(e.message).slice(0, 60)}) — retrying…`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (!funded && process.env.VANTA_E2E_SEED) {
    console.log('faucet refused — continuing on external funding (VANTA_E2E_SEED)');
  }
  assert.ok(funded || process.env.VANTA_E2E_SEED, 'devnet airdrop must eventually succeed');
  await new Promise((r) => setTimeout(r, 1500));
  const bal0 = await VantaChain.getSolBalance(session.publicKey.toBase58());
  console.log('funded balance:', bal0, 'SOL');
  assert.ok(bal0 >= 0.2, 'session wallet funded (>= 0.2 SOL)');

  // Self-check BEFORE the chain layer: is the signature even valid for this pubkey?
  const selfTestWire = new w3.Transaction().add(
    w3.SystemProgram.transfer({
      fromPubkey: session.publicKey,
      toPubkey: recipient.publicKey,
      lamports: 1,
    }),
  );
  selfTestWire.feePayer = session.publicKey;
  selfTestWire.recentBlockhash = '11111111111111111111111111111111'; // dummy, never sent
  const probe = await sessionSigner(selfTestWire.serializeMessage());
  const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
  const pubKey = crypto.createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, session.publicKey.toBuffer()]),
    format: 'der',
    type: 'spki',
  });
  const probeOk = crypto.verify(null, selfTestWire.serializeMessage(), pubKey, probe);
  assert.ok(probeOk, 'LOCAL self-check: signature must verify against session pubkey');
  console.log('signature self-check OK (sig verifies against session pubkey)');

  // 6. SHIELDED SEND — the core product move: recipient receives from the
  //    session key; the tx shows fee-payer = signer = session pubkey ONLY.
  // Send HALF the funded balance (capped at 0.25) so both the 1-SOL localnet
  // run and the 0.5-SOL externally-funded devnet run stay solvent.
  const sendAmt = Math.min(bal0 / 2, 0.25);
  let sig;
  try {
    sig = await VantaChain.sendSol({
      sessionSigner,
      sessionPubkey: session.publicKey.toBase58(),
      to: recipient.publicKey.toBase58(),
      amountSol: sendAmt,
      memo: 'vanta e2e',
    });
  } catch (e) {
    console.error('sendSol FAILED:', e.message);
    throw e;
  }
  console.log('sendSol signature:', sig);

  const balAfterSend = await VantaChain.getSolBalance(session.publicKey.toBase58());
  const recipBal = await VantaChain.getSolBalance(recipient.publicKey.toBase58());
  console.log('post-send session balance:', balAfterSend, '| recipient:', recipBal);
  assert.ok(Math.abs(recipBal - sendAmt) < 1e-9, 'recipient received exactly the amount');
  assert.ok(balAfterSend < bal0 - sendAmt, 'session wallet paid amount + fee');
  // Solvency is RELATIVE to the starting balance (0.25 out + ~5k-lamport fee):
  // works for 1 SOL localnet funding and 0.5 SOL externally-funded runs alike.
  assert.ok(balAfterSend > bal0 - 0.25001, 'session wallet still solvent');

  // 7. SWEEP-BACK — kill-switch companion: everything minus fee returns to main.
  const sweepSig = await VantaChain.sweepBack({
    sessionSigner,
    sessionPubkey: session.publicKey.toBase58(),
    mainPubkey: mainWallet.publicKey.toBase58(),
  });
  assert.ok(sweepSig, 'sweep must move when funds remain');
  console.log('sweepBack signature:', sweepSig);

  const swept = await VantaChain.getSolBalance(mainWallet.publicKey.toBase58());
  const sessionLeft = await VantaChain.getSolBalance(session.publicKey.toBase58());
  console.log('main wallet after sweep:', swept, '| session leftover:', sessionLeft);
  assert.ok(swept > bal0 - 0.25001, 'main wallet received the sweep');
  assert.ok(sessionLeft === 0, 'session wallet drained to zero');

  // 8. Sweep with nothing to move must be a clean no-op (null, no throw).
  const empty = await VantaChain.sweepBack({
    sessionSigner,
    sessionPubkey: session.publicKey.toBase58(),
    mainPubkey: mainWallet.publicKey.toBase58(),
  });
  assert.equal(empty, null, 'empty sweep is a null no-op');

  console.log('\nE2E PASS: airdrop → shielded send → sweep-back, all on devnet.');
}

main().catch((e) => {
  // Message-only: a full stack trace inside the minified IIFE dumps megabytes.
  console.error('E2E FAIL:', e.message);
  process.exit(1);
});
