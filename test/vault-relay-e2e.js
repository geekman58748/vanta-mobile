'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { Keypair, PublicKey, Connection, SystemProgram, Transaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const nacl = require('tweetnacl');

const SOLANA_RPC = process.env.SOLANA_RPC || 'http://127.0.0.1:8899';
const RENT_EXEMPT = 890880;

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58encode(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let num = 0n;
  for (const b of buf) num = num * 256n + BigInt(b);
  let out = '';
  while (num > 0n) { out = B58[Number(num % 58n)] + out; num /= 58n; }
  for (const b of buf) { if (b !== 0) break; out = '1' + out; }
  return out || '1';
}
function concatBytes(parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
function utf8(str) { return new TextEncoder().encode(str); }

async function deriveVaultKeypair(seed) {
  const material = concatBytes([seed, utf8('\x00vanta-vault-v1\x00')]);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', material));
  return nacl.sign.keyPair.fromSeed(hash);
}

async function deriveRelayKeypair(seed, salt) {
  const material = concatBytes([seed, utf8('\x00vanta-relay-v1\x00'), utf8(String(salt))]);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', material));
  return nacl.sign.keyPair.fromSeed(hash);
}

function naclToWeb3(kp) { return Keypair.fromSecretKey(kp.secretKey); }

async function airdrop(conn, pubkey, lamports) {
  const sig = await conn.requestAirdrop(pubkey, lamports);
  await conn.confirmTransaction(sig, 'confirmed');
}

async function sendTransfer(conn, { from, fromKeypair, to, lamports }) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports })
  );
  tx.feePayer = from;
  tx.recentBlockhash = blockhash;
  tx.sign(fromKeypair);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

function getTxAccounts(txResult) {
  // json encoding: accountKeys are base58 strings
  const keys = txResult.transaction.message.accountKeys;
  return keys.map(k => typeof k === 'string' ? k : (k.pubkey || String(k)));
  // Handle both string and object accountKeys
  return txResult.transaction.message.accountKeys.map(k =>
    typeof k === 'string' ? k : (k.pubkey || String(k))
  );
}

async function main() {
  console.log('=== VANTA Vault + Relay E2E Test ===\n');
  const conn = new Connection(SOLANA_RPC, 'confirmed');

  // ---- Test 1: Vault ≠ Relay derivation ----
  console.log('Test 1: Vault ≠ Relay derivation');
  const seed = crypto.randomBytes(32);
  const vaultNacl = await deriveVaultKeypair(seed);
  const vaultPub = b58encode(vaultNacl.publicKey);
  const vaultKp = naclToWeb3(vaultNacl);
  const relay0Nacl = await deriveRelayKeypair(seed, 0);
  const relay0Pub = b58encode(relay0Nacl.publicKey);
  const relay0Kp = naclToWeb3(relay0Nacl);
  const relay1Nacl = await deriveRelayKeypair(seed, 1);
  const relay1Pub = b58encode(relay1Nacl.publicKey);

  assert.notStrictEqual(vaultPub, relay0Pub);
  assert.notStrictEqual(relay0Pub, relay1Pub);
  assert.notStrictEqual(vaultPub, relay1Pub);
  console.log(`  Vault:  ${vaultPub}`);
  console.log(`  Relay0: ${relay0Pub}`);
  console.log(`  Relay1: ${relay1Pub}`);
  console.log('  PASS\n');

  // ---- Test 2: External wallet funds relay ----
  console.log('Test 2: External wallet funds relay');
  const extKp = Keypair.generate();
  await airdrop(conn, extKp.publicKey, 2 * LAMPORTS_PER_SOL);
  const relay0Pk = new PublicKey(relay0Pub);
  await sendTransfer(conn, { from: extKp.publicKey, fromKeypair: extKp, to: relay0Pk, lamports: 0.5 * LAMPORTS_PER_SOL });
  const relayBal = await conn.getBalance(relay0Pk);
  assert.ok(relayBal >= 0.5 * LAMPORTS_PER_SOL);
  console.log(`  Relay funded: ${relayBal / LAMPORTS_PER_SOL} SOL`);
  console.log('  PASS\n');

  // ---- Test 3: Sweep relay → vault ----
  console.log('Test 3: Sweep relay → vault');
  const vaultPk = new PublicKey(vaultPub);
  const vaultBalBefore = await conn.getBalance(vaultPk);
  await sendTransfer(conn, { from: relay0Pk, fromKeypair: relay0Kp, to: vaultPk, lamports: relayBal - 5000 });
  const vaultBalAfter = await conn.getBalance(vaultPk);
  const relayBalAfter = await conn.getBalance(relay0Pk);
  assert.ok(vaultBalAfter > vaultBalBefore);
  assert.ok(relayBalAfter < RENT_EXEMPT);
  console.log(`  Vault: ${(vaultBalAfter / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`  Relay: ${(relayBalAfter / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log('  PASS\n');

  // ---- Test 4: Send via relay (vault→relay→recipient) ----
  console.log('Test 4: Send via relay (vault → relay → recipient)');
  const recipient = Keypair.generate();
  const recipientPk = recipient.publicKey;
  const sendAmount = 0.1 * LAMPORTS_PER_SOL;

  const relayNeeded = sendAmount + 10000 + RENT_EXEMPT;
  await sendTransfer(conn, { from: vaultPk, fromKeypair: vaultKp, to: relay0Pk, lamports: relayNeeded });
  console.log('  vault → relay ✓');
  await sendTransfer(conn, { from: relay0Pk, fromKeypair: relay0Kp, to: recipientPk, lamports: sendAmount });
  console.log('  relay → recipient ✓');
  const recipientBal = await conn.getBalance(recipientPk);
  assert.ok(recipientBal >= sendAmount);
  console.log(`  Recipient: ${(recipientBal / LAMPORTS_PER_SOL)} SOL`);
  console.log('  PASS\n');

  // ---- Test 5: Verify privacy — recipient sees relay, not vault ----
  console.log('Test 5: Verify recipient sees relay, NOT vault');
  const txs = await conn.getSignaturesForAddress(recipientPk, undefined, 'confirmed');
  const r2aTx = await conn.getTransaction(txs[0].signature, { encoding: 'json', maxSupportedTransactionVersion: 0 });
  const accts = getTxAccounts(r2aTx);

  console.log(`  relay → recipient tx accounts: ${accts.join(', ')}`);
  assert.ok(accts.includes(relay0Pub), 'relay IS in the tx');
  assert.ok(!accts.includes(vaultPub), 'vault is NOT in the tx');
  console.log('  PASS: vault invisible to recipient\n');

  // ---- Test 6: No vault→recipient link ----
  console.log('Test 6: No vault→recipient link on-chain');
  const vaultTxs = await conn.getSignaturesForAddress(vaultPk, undefined, 'confirmed');
  let linkFound = false;
  for (const vtx of vaultTxs) {
    const t = await conn.getTransaction(vtx.signature, { encoding: 'json', maxSupportedTransactionVersion: 0 });
    if (!t) continue;
    const a = getTxAccounts(t);
    if (a.includes(recipientPk.toBase58())) { linkFound = true; break; }
  }
  assert.ok(!linkFound, 'no vault→recipient link');
  console.log('  PASS: no vault→recipient link on-chain\n');

  console.log('=== ALL 6 TESTS PASSED ===');
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e); process.exit(1); });
