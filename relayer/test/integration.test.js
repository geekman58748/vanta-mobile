'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const { createRelayer } = require('../src/server');
const { SessionStore } = require('../src/store');
const { config } = require('../src/config');
const { encode: b58encode, decode: b58decode } = require('../src/base58');
const { VantaSessionEngine, STATE } = require('../../src/session/engine');

// ── helpers ────────────────────────────────────────────────────────────────

function randomPubkey() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return b58encode(buf);
}

function stubSigner() {
  // Stand-in for the hot wallet co-signer (real one needs keypair env config).
  return async ({ lamports }) => `cosig_${lamports}`;
}

function startServer(storeOverrides = {}, signer = stubSigner()) {
  const cfg = { ...config, ...storeOverrides };
  const store = new SessionStore({ config: cfg });
  // Server routes must share the SAME overridden config as the store,
  // otherwise tx/session caps diverge between layers.
  const server = createRelayer({ store, signer, config: cfg });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}`, store });
    });
  });
}

function makeEngine(url) {
  return new VantaSessionEngine({ relayerUrl: url });
}

// ── tests ──────────────────────────────────────────────────────────────────

test('health reports dry-run mode and caps', async () => {
  const { server, url } = await startServer();
  try {
    const res = await fetch(`${url}/healthz`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.mode, 'live'); // startServer injects a stub signer
    assert.strictEqual(body.caps.maxSessionSpendLamports, config.MAX_SESSION_SPEND_LAMPORTS);
  } finally {
    server.close();
  }
});

test('full session lifecycle: create → cosign → revoke, real crypto', async () => {
  const { server, url, store } = await startServer();
  try {
    const engine = makeEngine(url);
    const mainPubkey = randomPubkey();

    // ON: provisions a real ed25519 keypair, signs, registers
    const on = await engine.shieldOn(mainPubkey);
    assert.strictEqual(engine.state, STATE.ACTIVE);
    assert.ok(on.sessionId.startsWith('s_'));
    assert.strictEqual(on.spendCapLamports, config.MAX_SESSION_SPEND_LAMPORTS);

    // The session pubkey on the relayer matches the one the client generated
    const remote = await (await fetch(`${url}/v1/session/${on.sessionId}`)).json();
    assert.strictEqual(remote.ok, true);
    assert.strictEqual(remote.session.live, true);
    assert.strictEqual(remote.session.clientPubkey, on.sessionPubkey);
    assert.strictEqual(b58decode(on.sessionPubkey).length, 32);
    assert.ok(store.get(on.sessionId).mainPubkey === mainPubkey);

    // Co-sign within cap
    const cosign = await engine.requestCosign(1000, { memo: 'test' });
    assert.strictEqual(cosign.ok, true);
    assert.strictEqual(cosign.signature, 'cosig_1000');

    // Kill-switch: revoke + wipe
    const off = await engine.shieldOff();
    assert.strictEqual(off.revoked, true);
    assert.strictEqual(typeof off.unspentLamports, 'number');
    assert.strictEqual(engine.state, STATE.OFF);
    assert.strictEqual(engine._keypair, null);
    assert.strictEqual(engine.session, null);

    // Server-side session is revoked
    const after = await (await fetch(`${url}/v1/session/${on.sessionId}`)).json();
    assert.strictEqual(after.session.revoked, true);
    assert.strictEqual(after.session.live, false);
  } finally {
    server.close();
  }
});

test('forged createSignature is rejected', async () => {
  const { server, url } = await startServer();
  try {
    const engine = makeEngine(url);
    const mainPubkey = randomPubkey();
    const issuedAt = Math.floor(Date.now() / 1000);
    const clientPubkey = randomPubkey();
    const message = VantaSessionEngine.buildCreateMessage({ clientPubkey, mainPubkey, issuedAt });
    // Sign with the WRONG key
    const wrong = crypto.generateKeyPairSync('ed25519');
    const sig = b58encode(new Uint8Array(crypto.sign(null, message, wrong.privateKey)));

    const res = await fetch(`${url}/v1/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientPubkey, mainPubkey, issuedAt, createSignature: sig }),
    });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /verification/);
  } finally {
    server.close();
  }
});

test('co-sign enforces tx cap then session cap', async () => {
  const { server, url } = await startServer({ MAX_SESSION_SPEND_LAMPORTS: 5000, MAX_TX_LAMPORTS: 3000 });
  try {
    const engine = makeEngine(url);
    await engine.shieldOn(randomPubkey());

    // Single tx over MAX_TX_LAMPORTS → 403 tx_cap
    await assert.rejects(
      () => engine.requestCosign(3001, {}),
      (err) => err.code === 'tx_cap'
    );

    // Session cap 5000: 3000 ok, 2000 ok, 1 more → session_cap
    await engine.requestCosign(3000, {});
    await engine.requestCosign(2000, {});
    await assert.rejects(
      () => engine.requestCosign(1, {}),
      (err) => err.code === 'session_cap'
    );
  } finally {
    server.close();
  }
});

test('co-sign after revoke is refused', async () => {
  const { server, url } = await startServer();
  try {
    const engine = makeEngine(url);
    await engine.shieldOn(randomPubkey());
    await engine.shieldOff();

    // Engine is OFF locally, so this throws client-side before any network call
    await assert.rejects(
      () => engine.requestCosign(1, {}),
      (err) => err.code === 'invalid_state'
    );
  } finally {
    server.close();
  }
});

test('co-sign rate limit surfaces as 429', async () => {
  const { server, url } = await startServer({ COSIGNS_PER_MINUTE_PER_SESSION: 2 });
  try {
    const engine = makeEngine(url);
    await engine.shieldOn(randomPubkey());
    await engine.requestCosign(1, {});
    await engine.requestCosign(1, {});
    await assert.rejects(
      () => engine.requestCosign(1, {}),
      (err) => err.code === 'rate_limited'
    );
  } finally {
    server.close();
  }
});

test('dry-run relayer refuses co-sign with a clear error', async () => {
  const store = new SessionStore({});
  const dryServer = createRelayer({ store }); // no signer → dry run
  await new Promise((r) => dryServer.listen(0, '127.0.0.1', r));
  const dryUrl = `http://127.0.0.1:${dryServer.address().port}`;
  try {
    // healthz says dry_run
    const health = await (await fetch(`${dryUrl}/healthz`)).json();
    assert.strictEqual(health.mode, 'dry_run');

    // Session create still works (lifecycle enforced), co-sign refused
    const engine = makeEngine(dryUrl);
    const on = await engine.shieldOn(randomPubkey());
    await assert.rejects(
      () => engine.requestCosign(1, {}),
      (err) => err.code === 'dry_run'
    );

    // Rollback: the refused spend must NOT consume the session cap
    const status = await (await fetch(`${dryUrl}/v1/session/${on.sessionId}`)).json();
    assert.strictEqual(status.session.spentLamports, 0);
  } finally {
    dryServer.close();
  }
});

test('engine refuses shieldOn while already active', async () => {
  const { server, url } = await startServer();
  try {
    const engine = makeEngine(url);
    await engine.shieldOn(randomPubkey());
    await assert.rejects(
      () => engine.shieldOn(randomPubkey()),
      (err) => err.code === 'invalid_state'
    );
    await engine.shieldOff();
  } finally {
    server.close();
  }
});

test('engine kill-switch still wipes when relayer is unreachable', async () => {
  const engine = makeEngine('http://127.0.0.1:9'); // nothing listens here
  await assert.rejects(() => engine.shieldOn(randomPubkey()), /fetch|ECONNREFUSED|Failed/);
  // Provisioning failed → engine must be back OFF with no key material
  assert.strictEqual(engine.state, STATE.OFF);
  assert.strictEqual(engine._keypair, null);

  // shieldOff on OFF is a no-op
  const off = await engine.shieldOff();
  assert.strictEqual(off.revoked, false);
});
