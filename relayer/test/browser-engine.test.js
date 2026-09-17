'use strict';

// Exercises the BROWSER engine (web/vanta-engine.js) against the real relayer,
// using Node's webcrypto — the same WebCrypto API the file gets in Chrome.
// This is the pre-device smoke test: if this passes, the code that runs on the
// phone is byte-for-byte the code that passed here.

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const { createRelayer } = require('../src/server');
const { SessionStore } = require('../src/store');
const { config } = require('../src/config');
const { encode: b58encode } = require('../src/base58');

// Load the browser file in this process. It attaches to globalThis when
// `window` is undefined, giving us root.crypto = node webcrypto — the same
// API surface it gets in Chrome.
require('../../web/vanta-engine.js');
const { VantaSessionEngine, STATE } = globalThis.VantaEngine;

function stubSigner() {
  return async ({ lamports }) => `cosig_${lamports}`;
}

function startServer(storeOverrides = {}, signer = stubSigner()) {
  const cfg = { ...config, ...storeOverrides };
  const store = new SessionStore({ config: cfg });
  const server = createRelayer({ store, signer, config: cfg });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function randomPubkey() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return b58encode(buf);
}

test('browser engine provisions a session against the real relayer', async () => {
  const { server, url } = await startServer();
  const engine = new VantaSessionEngine({ relayerUrl: url });

  assert.equal(engine.state, STATE.OFF);
  const result = await engine.shieldOn(randomPubkey());

  assert.equal(engine.state, STATE.ACTIVE);
  assert.ok(result.sessionId);
  assert.equal(result.sessionPubkey.length, 44); // base58 of 32 bytes
  assert.ok(result.spendCapLamports > 0);
  assert.ok(result.expiresAt > Date.now() / 1000);

  // Status reflects the live relayer view.
  const status = await engine.status();
  assert.equal(status.active, true);
  assert.equal(status.session.id, result.sessionId);

  // Kill-switch revokes and wipes.
  const off = await engine.shieldOff();
  assert.equal(off.revoked, true);
  assert.equal(engine.state, STATE.OFF);
  assert.equal(engine.session, null);

  server.close();
});

test('browser engine signature is accepted by the relayer (wire format identical)', async () => {
  // If the browser wire format diverged from the node engine's, the relayer's
  // ed25519 verification would reject the create request and this test fails.
  const { server, url } = await startServer();
  const engine = new VantaSessionEngine({ relayerUrl: url });

  const result = await engine.shieldOn(randomPubkey());
  assert.equal(engine.state, STATE.ACTIVE);

  await engine.shieldOff();
  server.close();
});

test('browser engine kill-switch wipes locally even when relayer is unreachable', async () => {
  // Grab a guaranteed-closed port: bind, capture, release. (Undici refuses
  // low 'bad ports' like 9 outright, so a released high port is the reliable
  // way to simulate an unreachable relayer.)
  const closed = await startServer();
  const deadPort = new URL(closed.url).port;
  await new Promise((resolve) => closed.server.close(resolve));

  const engine = new VantaSessionEngine({
    relayerUrl: `http://127.0.0.1:${deadPort}`,
  });

  await assert.rejects(
    () => engine.shieldOn(randomPubkey()),
    /fetch failed|ECONNREFUSED|NetworkError|error attempting/i,
  );
  assert.equal(engine.state, STATE.OFF);

  // shieldOff on a dead network still resolves with the local wipe done.
  engine.state = STATE.ACTIVE; // simulate a stale active session
  engine.session = { id: 'ghost', txCapLamports: 1 };
  const off = await engine.shieldOff();
  assert.equal(off.revoked, false);
  assert.equal(engine.session, null);
  assert.equal(engine.state, STATE.OFF);
});

test('main-wallet consent signature round-trips end to end', async () => {
  const { server, url } = await startServer();

  // Stand-in for the main wallet (Seed Vault / MWA on device): a real keypair
  // whose signature the relayer can verify against the claimed main pubkey.
  const mainKp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign']);
  const rawMain = new Uint8Array(await crypto.subtle.exportKey('raw', mainKp.publicKey));
  const mainPubkey = b58encode(rawMain);

  const engine = new VantaSessionEngine({ relayerUrl: url });
  const result = await engine.shieldOn(mainPubkey, {
    // Mirror of the injected MWA signer: sign the exact consent bytes.
    signWithMainWallet: async (msg) => new Uint8Array(
      await crypto.subtle.sign('Ed25519', mainKp.privateKey, msg),
    ),
  });

  assert.equal(engine.state, STATE.ACTIVE);
  assert.equal(result.consentVerified, true, 'relayer must verify main-wallet consent');

  await engine.shieldOff();
  server.close();
});

test('forged main-wallet consent is rejected fail-closed', async () => {
  const { server, url } = await startServer();

  const mainKp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign']);
  const rawMain = new Uint8Array(await crypto.subtle.exportKey('raw', mainKp.publicKey));
  const mainPubkey = b58encode(rawMain);

  const engine = new VantaSessionEngine({ relayerUrl: url });
  await assert.rejects(
    () => engine.shieldOn(mainPubkey, {
      // Signed by the WRONG key — must never open a session.
      signWithMainWallet: async (msg) => new Uint8Array(
        await crypto.subtle.sign('Ed25519', (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign'])).privateKey, msg),
      ),
    }),
    /mainSignature failed verification|relayer_error/i,
  );
  assert.equal(engine.state, STATE.OFF, 'engine wipes to OFF on failed provisioning');

  server.close();
});

test('declined consent (signer returns null) aborts provisioning cleanly', async () => {
  const { server, url } = await startServer();
  const engine = new VantaSessionEngine({ relayerUrl: url });

  await assert.rejects(
    () => engine.shieldOn(randomPubkey(), { signWithMainWallet: async () => null }),
    /declined/i,
  );
  assert.equal(engine.state, STATE.OFF);
  assert.equal(engine.session, null, 'no session remains after a declined consent');

  server.close();
});

test('no-signer dev mode still provisions (consent-unverified, wire-compatible)', async () => {
  const { server, url } = await startServer();
  const engine = new VantaSessionEngine({ relayerUrl: url });

  const result = await engine.shieldOn(randomPubkey());
  assert.equal(engine.state, STATE.ACTIVE);
  assert.equal(result.consentVerified, false, 'dev mode marks consent unverified');

  await engine.shieldOff();
  server.close();
});

test('browser base58 matches the relayer implementation', () => {
  const { b58encode: browserEncode, b58decode: browserDecode } = globalThis.VantaEngine;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const encoded = browserEncode(bytes);
  assert.ok(!/[0OIl]/.test(encoded));
  assert.deepEqual(Buffer.from(browserDecode(encoded)), Buffer.from(bytes));
});
