'use strict';

// Exercises the BROWSER engine (web/vanta-engine.js) against the real relayer
// — the file the actual page loads. Uses node's webcrypto + tweetnacl to
// mirror the browser env (window.crypto.subtle, window.nacl). Regression test
// for the WebCrypto raw-import bug: importKey('raw', <32-byte seed>) imports
// a PUBLIC key, so every session signature failed verification (401 loop).
// The browser engine now derives keys via tweetnacl fromSeed — this test
// fails if that path ever regresses, because the relayer verifies for real.

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { webcrypto } = require('node:crypto');

const { createRelayer } = require('../../relayer/src/server');

// ————— browser-ish globals —————
const nacl = require('tweetnacl');
globalThis.window = globalThis;
globalThis.window.nacl = nacl;
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, writable: true, configurable: true });
globalThis.window.crypto = webcrypto;
globalThis.localStorage = {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, String(v)); },
  removeItem(k) { this._m.delete(k); },
};

// Load the actual browser file.
require('../vanta-engine.js');
const { VantaSessionEngine } = globalThis.window.VantaEngine;

function ed25519Wallet() {
  const seed = crypto.randomBytes(32);
  const kp = nacl.sign.keyPair.fromSeed(seed);
  return {
    secretKey: kp.secretKey,
    pubkey: (function b58(u8) {
      const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      let num = 0n;
      for (const b of u8) num = num * 256n + BigInt(b);
      let out = '';
      while (num > 0n) { out = A[Number(num % 58n)] + out; num /= 58n; }
      for (const b of u8) { if (b !== 0) break; out = '1' + out; }
      return out || '1';
    })(kp.publicKey),
    sign(msg) {
      return nacl.sign.detached(Buffer.from(msg), kp.secretKey);
    },
  };
}

test('web engine: deterministic key round-trips with the real relayer', async () => {
  const server = createRelayer({});
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const wallet = ed25519Wallet();
  const engine = new VantaSessionEngine({ relayerUrl: base });

  const res = await engine.shieldOn(wallet.pubkey, {
    signWithMainWallet: async (msg) => wallet.sign(msg),
  });
  assert.equal(res.consentVerified, true, 'consent must verify — signatures come from the real derived key');
  assert.ok(res.sessionPubkey && res.sessionPubkey.length > 30);

  // Deterministic restore: same wallet + salt → same session pubkey.
  const engine2 = new VantaSessionEngine({ relayerUrl: base });
  const res2 = await engine2.shieldOn(wallet.pubkey, {
    signWithMainWallet: async (msg) => wallet.sign(msg),
  });
  assert.equal(res2.sessionPubkey, res.sessionPubkey, 'same wallet+salt must re-derive the identical pubkey');

  server.close();
  // undici fetch uses keep-alive sockets — without this the test process
  // never exits (the exact hang that cost three debugging rounds).
  if (server.closeAllConnections) server.closeAllConnections();
  process.exit(0); // guarantee exit under both `node --test` and direct runs
});
