'use strict';

// Name registry (.vanta) tests — the social layer trust chain, end to end:
//   claim (MAIN-wallet-signed) → KYC attestation (owner-signed, digest only)
//   → receive-address rotation (LIVE session-key-signed, fail-closed)
// Uses real ed25519 keypairs and the real client engine — no stubs on the
// crypto paths.

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const { createRelayer } = require('../src/server');
const { SessionStore } = require('../src/store');
const { config } = require('../src/config');
const { encode: b58encode } = require('../src/base58');
const { nameClaimMessageBytes, kycMessageBytes, receiveUpdateMessageBytes } = require('../src/names');
const { VantaSessionEngine } = require('../../src/session/engine');

// ── helpers ────────────────────────────────────────────────────────────────

function makeKeypair() {
  return crypto.generateKeyPairSync('ed25519');
}

function pubkeyOf(kp) {
  const der = kp.publicKey.export({ type: 'spki', format: 'der' });
  return b58encode(new Uint8Array(der.subarray(-32))); // last 32 bytes of SPKI
}

function signB58(kp, message) {
  return b58encode(new Uint8Array(crypto.sign(null, message, kp.privateKey)));
}

function randomPubkey() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return b58encode(buf);
}

function startServer() {
  const store = new SessionStore({ config });
  const server = createRelayer({ store, signer: async () => { throw Object.assign(new Error('dry'), { statusCode: 503, code: 'dry_run' }); }, config });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}`, store });
    });
  });
}

async function post(url, path, body) {
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, ...(await res.json()) };
}

async function get(url, path) {
  const res = await fetch(`${url}${path}`);
  return { status: res.status, ...(await res.json()) };
}

// ── claim / resolve / conflicts ─────────────────────────────────────────────

test('claim with valid main-wallet signature creates a record', async () => {
  const { server, url } = await startServer();
  try {
    const owner = makeKeypair();
    const issuedAt = Math.floor(Date.now() / 1000);
    const out = await post(url, '/v1/names/claim', {
      name: 'max',
      ownerPubkey: pubkeyOf(owner),
      issuedAt,
      signature: signB58(owner, nameClaimMessageBytes({ name: 'max', ownerPubkey: pubkeyOf(owner), issuedAt })),
    });
    assert.strictEqual(out.status, 201);
    assert.strictEqual(out.record.name, 'max.vanta');
    assert.strictEqual(out.record.owner, pubkeyOf(owner));
    assert.strictEqual(out.record.receive, null);
    assert.strictEqual(out.record.kyc, null);
  } finally { server.close(); }
});

test('duplicate claim conflicts; bad signature and stale ts are rejected', async () => {
  const { server, url } = await startServer();
  try {
    const owner = makeKeypair();
    const ownerPubkey = pubkeyOf(owner);
    const issuedAt = Math.floor(Date.now() / 1000);
    const claim = (name, sig, ts = issuedAt) => post(url, '/v1/names/claim', {
      name, ownerPubkey, issuedAt: ts, signature: sig,
    });

    const good = signB58(owner, nameClaimMessageBytes({ name: 'claude', ownerPubkey, issuedAt }));
    assert.strictEqual((await claim('claude', good)).status, 201);
    assert.strictEqual((await claim('claude', good)).status, 409); // taken

    const now = Math.floor(Date.now() / 1000);
    assert.strictEqual(
      (await claim('ai', signB58(owner, nameClaimMessageBytes({ name: 'ai', ownerPubkey, issuedAt: now })), now - 9999)).status,
      400, // stale
    );
    assert.strictEqual(
      (await claim('ai', signB58(owner, nameClaimMessageBytes({ name: ' OTHER', ownerPubkey, issuedAt: now })))).status,
      401, // signed for a different name
    );
  } finally { server.close(); }
});

test('invalid names are rejected', async () => {
  const { server, url } = await startServer();
  try {
    const owner = makeKeypair();
    const ownerPubkey = pubkeyOf(owner);
    const issuedAt = Math.floor(Date.now() / 1000);
    for (const bad of ['Max', 'ha ha', 'x'.repeat(33), '']) {
      const out = await post(url, '/v1/names/claim', {
        name: bad, ownerPubkey, issuedAt,
        signature: signB58(owner, nameClaimMessageBytes({ name: bad || 'x', ownerPubkey, issuedAt })),
      });
      assert.strictEqual(out.status, 400, `expected 400 for ${JSON.stringify(bad)}`);
    }
  } finally { server.close(); }
});

// ── KYC attestation ─────────────────────────────────────────────────────────

test('kyc attestation: owner-signed digest becomes verified; wrong owner cannot attach', async () => {
  const { server, url } = await startServer();
  try {
    const owner = makeKeypair();
    const ownerPubkey = pubkeyOf(owner);
    const engine = new VantaSessionEngine({ relayerUrl: url });
    await engine.claimName('satoshi', {
      signWithMainWallet: (bytes) => signB58(owner, bytes),
      ownerPubkey,
    });

    const kyc = { provider: 'persona-sandbox', level: 'basic', hash: 'a'.repeat(64) };
    const ok = await engine.setKycAttestation('satoshi', kyc, {
      signWithMainWallet: (bytes) => signB58(owner, bytes),
      ownerPubkey,
    });
    assert.strictEqual(ok.record.kyc.verified, true);
    assert.strictEqual(ok.record.kyc.provider, 'persona-sandbox');
    assert.strictEqual(ok.record.kyc.hash, undefined, 'digest must never be exposed publicly');

    // someone else's key cannot attach to the name
    const impostor = makeKeypair();
    await assert.rejects(
      () => engine.setKycAttestation('satoshi', kyc, {
        signWithMainWallet: (bytes) => signB58(impostor, bytes),
        ownerPubkey: pubkeyOf(impostor),
      }),
      (err) => err.code === 'not_owner' || err.code === 'bad_signature',
    );

    // malformed hash rejected client-side
    await assert.rejects(
      () => engine.setKycAttestation('satoshi', { provider: 'x', level: 'basic', hash: 'nope' }, {
        signWithMainWallet: (bytes) => signB58(owner, bytes),
        ownerPubkey,
      }),
      (err) => err.code === 'config',
    );
  } finally { server.close(); }
});

// ── receive-address rotation (the privacy core) ─────────────────────────────

test('receive rotation requires a LIVE session and its signature — full chain', async () => {
  const { server, url, store } = await startServer();
  try {
    const owner = makeKeypair();
    const ownerPubkey = pubkeyOf(owner);
    const engine = new VantaSessionEngine({ relayerUrl: url });
    await engine.claimName('ai', {
      signWithMainWallet: (bytes) => signB58(owner, bytes),
      ownerPubkey,
    });

    // 1. Rotation with the shield OFF is refused — fail-closed.
    await assert.rejects(
      () => engine.setReceiveAddress('ai', randomPubkey()),
      (err) => err.code === 'invalid_state',
    );

    // 2. Shield ON → rotation signed by the live session key succeeds.
    await engine.shieldOn(ownerPubkey);
    const addr1 = randomPubkey();
    const rotated = await engine.setReceiveAddress('ai', addr1);
    assert.strictEqual(rotated.record.receive, addr1);
    assert.strictEqual(rotated.record.receiveSignedBy, engine.session.clientPubkey);

    // 3. Forged rotation (random key claiming to be the session) is refused.
    const forged = await post(url, '/v1/names/ai/receive', {
      receivePubkey: randomPubkey(),
      issuedAt: Math.floor(Date.now() / 1000),
      signature: signB58(makeKeypair(), receiveUpdateMessageBytes({ name: 'ai', receivePubkey: randomPubkey(), issuedAt: Math.floor(Date.now() / 1000) })),
      clientPubkey: engine.session.clientPubkey,
    });
    assert.strictEqual(forged.status, 401);

    // 4. Live-session requirement is real: revoke, then rotation is dead.
    await engine.shieldOff();
    const afterKill = await post(url, '/v1/names/ai/receive', {
      receivePubkey: randomPubkey(),
      issuedAt: Math.floor(Date.now() / 1000),
      signature: b58encode(new Uint8Array(64)), // syntactically valid, wrong key
      clientPubkey: engine.session ? engine.session.clientPubkey : randomPubkey(),
    });
    assert.strictEqual(afterKill.status, 403);
    assert.strictEqual(afterKill.code, 'no_live_session');
    assert.strictEqual(store.findLiveByClientPubkey(engine.session ? engine.session.clientPubkey : ''), null);
  } finally { server.close(); }
});

test('resolve returns the public record only', async () => {
  const { server, url } = await startServer();
  try {
    assert.strictEqual((await get(url, '/v1/names/ghost')).status, 404);

    const owner = makeKeypair();
    const ownerPubkey = pubkeyOf(owner);
    const engine = new VantaSessionEngine({ relayerUrl: url });
    await engine.claimName('ghost', {
      signWithMainWallet: (bytes) => signB58(owner, bytes),
      ownerPubkey,
      kyc: { provider: 'persona-sandbox', level: 'basic', hash: 'b'.repeat(64) },
    });
    const rec = (await get(url, '/v1/names/ghost.vanta')).record; // suffix tolerated
    assert.strictEqual(rec.name, 'ghost.vanta');
    assert.strictEqual(rec.kyc.verified, false, 'claim-day attestation stays unverified until /kyc');
    assert.strictEqual(rec.kyc.hash, undefined);
  } finally { server.close(); }
});
