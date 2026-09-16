'use strict';

// Dependency-free base58 (Bitcoin alphabet, same as Solana pubkeys/signatures).

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MAP = new Map();
for (let i = 0; i < ALPHABET.length; i++) MAP.set(ALPHABET[i], i);

function encode(input) {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (buf.length === 0) return '';

  // Count leading zero bytes -> leading '1' chars
  let zeroes = 0;
  while (zeroes < buf.length && buf[zeroes] === 0) zeroes++;

  // digits are little-endian base58
  const digits = [];
  for (let i = zeroes; i < buf.length; i++) {
    let carry = buf[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let out = '1'.repeat(zeroes);
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}

function decode(str) {
  if (typeof str !== 'string') throw new TypeError('base58.decode expects a string');
  if (str.length === 0) return new Uint8Array(0);

  // bytes are little-endian
  const bytes = [];
  for (const ch of str) {
    const val = MAP.get(ch);
    if (val === undefined) throw new Error(`Invalid base58 character: ${JSON.stringify(ch)}`);
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  let zeroes = 0;
  for (const ch of str) {
    if (ch !== '1') break;
    zeroes++;
  }

  const out = new Uint8Array(zeroes + bytes.length);
  for (let i = 0; i < bytes.length; i++) out[zeroes + i] = bytes[bytes.length - 1 - i];
  return out;
}

module.exports = { encode, decode };
