'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { encode, decode } = require('../src/base58');

test('base58 round-trips random buffers', () => {
  for (let i = 0; i < 50; i++) {
    const len = 1 + Math.floor(Math.random() * 128);
    const buf = new Uint8Array(len);
    require('node:crypto').getRandomValues(buf);
    const str = encode(buf);
    const out = decode(str);
    assert.deepStrictEqual(Buffer.from(out), Buffer.from(buf));
  }
});

test('base58 handles leading zeros (like Solana system program)', () => {
  const buf = new Uint8Array([0, 0, 0, 1, 2, 3]);
  const str = encode(buf);
  assert.ok(str.startsWith('111'));
  assert.deepStrictEqual(Buffer.from(decode(str)), Buffer.from(buf));
});

test('base58 empty string <-> empty bytes', () => {
  assert.strictEqual(encode(new Uint8Array(0)), '');
  assert.deepStrictEqual(Buffer.from(decode('')), Buffer.from(new Uint8Array(0)));
});

test('base58 rejects invalid characters', () => {
  assert.throws(() => decode('0OIl'), /Invalid base58/);
});

test('base58 matches known Solana system program id', () => {
  // "11111111111111111111111111111111" is 32 zero bytes in base58.
  const sys = decode('11111111111111111111111111111111');
  assert.strictEqual(sys.length, 32);
  assert.ok(sys.every((b) => b === 0));
  assert.strictEqual(encode(sys), '11111111111111111111111111111111');
});
