const { sha512 } = require('@noble/hashes/sha2.js');
const ed = require('@noble/ed25519');

// Configure noble/ed25519 to use @noble/hashes for sha512
ed.hashes.sha512 = sha512;

const N = BigInt('0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed');

function sha512Hash(msg) {
  return Buffer.from(sha512(msg));
}

function clamp(hash) {
  const s = Buffer.from(hash);
  s[0] &= 248;
  s[31] &= 127;
  s[31] |= 64;
  return s;
}

// Little-endian byte array -> BigInt
function leBytesToBigInt(bytes) {
  let r = BigInt(0);
  for (let i = bytes.length - 1; i >= 0; i--) r = (r << BigInt(8)) | BigInt(bytes[i]);
  return r;
}

function privToScalar(privKey) {
  return clamp(sha512Hash(privKey));
}

function scalarToBigInt(scalar) {
  return leBytesToBigInt(scalar) % N;
}

function pointMul(pointHex, scalar) {
  return ed.Point.fromHex(pointHex).multiply(scalarToBigInt(scalar)).toBytes();
}

function pointAdd(p1Hex, p2Hex) {
  return ed.Point.fromHex(p1Hex).add(ed.Point.fromHex(p2Hex)).toBytes();
}

function hex(bytes) { return ed.etc.bytesToHex(bytes); }

class StealthAddress {
  static generateRecipient() {
    const spendingKey = ed.utils.randomSecretKey();
    const viewingKey = ed.utils.randomSecretKey();
    const spendingPub = ed.getPublicKey(spendingKey);
    const viewingPub = ed.getPublicKey(viewingKey);
    return { spendingKey, viewingKey, metaAddress: { viewingPub, spendingPub } };
  }

  static generateStealthAddress(metaAddress) {
    const { viewingPub, spendingPub } = metaAddress;
    const ephemeralSecret = ed.utils.randomSecretKey();
    const ephemeralPub = ed.getPublicKey(ephemeralSecret);

    // ECDH: shared secret = ephemeral_scalar * viewing_pub
    const ephScalar = privToScalar(ephemeralSecret);
    const sharedSecret = pointMul(hex(viewingPub), ephScalar);
    const hashScalar = clamp(sha512Hash(sharedSecret));
    const hashPoint = ed.Point.BASE.multiply(scalarToBigInt(hashScalar)).toBytes();
    const stealthPub = pointAdd(hex(spendingPub), hex(hashPoint));

    return { stealthAddress: stealthPub, ephemeralPubkey: ephemeralPub, ephemeralSecret };
  }

  static scanForStealthAddresses(spendingKey, viewingKey, ephemeralPubkeys) {
    const spendingPub = ed.getPublicKey(spendingKey);
    const found = [];
    for (let i = 0; i < ephemeralPubkeys.length; i++) {
      const viewScalar = privToScalar(viewingKey);
      const sharedSecret = pointMul(hex(ephemeralPubkeys[i]), viewScalar);
      const hashScalar = clamp(sha512Hash(sharedSecret));
      const hashPoint = ed.Point.BASE.multiply(scalarToBigInt(hashScalar)).toBytes();
      const stealthPub = pointAdd(hex(spendingPub), hex(hashPoint));
      const spendScalar = privToScalar(spendingKey);
      const stealthSecretKey = (leBytesToBigInt(spendScalar) + leBytesToBigInt(hashScalar)) % N;
      found.push({ stealthAddress: stealthPub, stealthSecretKey, index: i });
    }
    return found;
  }

  static deriveStealthKey(spendingKey, viewingKey, ephemeralPubkey) {
    const spendingPub = ed.getPublicKey(spendingKey);
    const viewScalar = privToScalar(viewingKey);
    const sharedSecret = pointMul(hex(ephemeralPubkey), viewScalar);
    const hashScalar = clamp(sha512Hash(sharedSecret));
    const hashPoint = ed.Point.BASE.multiply(scalarToBigInt(hashScalar)).toBytes();
    const stealthPub = pointAdd(hex(spendingPub), hex(hashPoint));
    const spendScalar = privToScalar(spendingKey);
    const stealthSecretKey = (leBytesToBigInt(spendScalar) + leBytesToBigInt(hashScalar)) % N;
    return { stealthPub, stealthSecretKey };
  }
}

module.exports = { StealthAddress };
