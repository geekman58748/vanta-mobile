'use strict';

// VANTA name registry — the social layer.
//
// Names (max.vanta) are OFF-CHAIN by design: nothing name-related ever
// touches the blockchain, so explorers cannot correlate identities through
// the registry. Ownership is proven cryptographically — a claim is only
// accepted when signed by the owner's main wallet key, and every update is
// signed too. Anyone can run a relayer; the signatures are the trust root.
//
// A record binds a name to:
//   owner    – main wallet pubkey (signer of claims and updates)
//   receive  – the CURRENT ephemeral receive address (rotates per reveal;
//              set by the session key that is currently shielding the name)
//   kyc      – optional attestation { provider, level, hash, issuedAt }.
//              hash is a sha256 digest of the attestation document — the
//              relayer NEVER stores documents or personal data.
//
// Replay protection: every operation carries issuedAt and is rejected
// outside a ±TTL window (clock-skew tolerant).
//
// v1 scope: no transfers, no deletion. A name maps to one owner at a time.

const { encode: b58encode, decode: b58decode } = require('./base58');

const NAME_RE = /^[a-z0-9]{1,32}$/;
const SIGN_TTL_SECONDS = 300;
const MAX_CLAIMS_PER_IP_PER_MIN = 20;
const KYC_LEVELS = new Set(['none', 'basic', 'standard', 'plus']);

// ── canonical message builders (domain-separated) ─────────────────────────
// Byte-identical counterparts live in the client engine; keep in sync.

function nameClaimMessageBytes({ name, ownerPubkey, issuedAt }) {
  return Buffer.concat([
    Buffer.from('vanta-name-claim-v1\0', 'utf8'),
    Buffer.from(name, 'utf8'),
    Buffer.from('\0', 'utf8'),
    Buffer.from(b58decode(ownerPubkey)),
    Buffer.from(issuedAt.toString(10), 'ascii'),
  ]);
}

function receiveUpdateMessageBytes({ name, receivePubkey, issuedAt }) {
  return Buffer.concat([
    Buffer.from('vanta-name-receive-v1\0', 'utf8'),
    Buffer.from(name, 'utf8'),
    Buffer.from('\0', 'utf8'),
    Buffer.from(b58decode(receivePubkey)),
    Buffer.from(issuedAt.toString(10), 'ascii'),
  ]);
}

function kycMessageBytes({ name, kycHash, issuedAt }) {
  return Buffer.concat([
    Buffer.from('vanta-name-kyc-v1\0', 'utf8'),
    Buffer.from(name, 'utf8'),
    Buffer.from('\0', 'utf8'),
    Buffer.from(kycHash, 'ascii'),
    Buffer.from(issuedAt.toString(10), 'ascii'),
  ]);
}

class NameRegistry {
  // verifyEd25519 is injected (same implementation the server uses) so this
  // module stays decoupled and unit-testable.
  constructor({ verifyEd25519, logger = console, now = () => Math.floor(Date.now() / 1000) } = {}) {
    if (typeof verifyEd25519 !== 'function') throw new Error('NameRegistry requires verifyEd25519');
    this.verify = verifyEd25519;
    this.logger = logger;
    this.now = now;
    this.byName = new Map();
    this.claimsByIp = new Map(); // ip -> [ts, ...]
  }

  _fresh(issuedAt) {
    if (!Number.isInteger(issuedAt)) return false;
    const t = this.now();
    return Math.abs(t - issuedAt) <= SIGN_TTL_SECONDS;
  }

  _rateLimited(ip) {
    const t = this.now();
    const arr = (this.claimsByIp.get(ip) || []).filter((x) => t - x < 60);
    if (arr.length >= MAX_CLAIMS_PER_IP_PER_MIN) {
      this.claimsByIp.set(ip, arr);
      return true;
    }
    arr.push(t);
    this.claimsByIp.set(ip, arr);
    return false;
  }

  _validPubkey(s) {
    try {
      return b58decode(s).length === 32;
    } catch {
      return false;
    }
  }

  // POST /v1/names/claim — signed by the OWNER's main wallet.
  claim({ name, ownerPubkey, issuedAt, signature, kyc, ip = 'unknown' }) {
    if (typeof name !== 'string' || !NAME_RE.test(name)) {
      return { ok: false, status: 400, code: 'bad_name', error: 'Name must match [a-z0-9]{1,32}' };
    }
    if (!this._validPubkey(ownerPubkey)) {
      return { ok: false, status: 400, code: 'bad_owner', error: 'ownerPubkey must be a base58 ed25519 pubkey' };
    }
    if (!this._fresh(issuedAt)) {
      return { ok: false, status: 400, code: 'stale_timestamp', error: 'issuedAt outside allowed window' };
    }
    if (this._rateLimited(ip)) {
      return { ok: false, status: 429, code: 'rate_limited', error: 'Too many claims from this IP' };
    }
    if (this.byName.has(name)) {
      return { ok: false, status: 409, code: 'name_taken', error: `Name already registered: ${name}.vanta` };
    }
    if (!this.verify(ownerPubkey, signature, nameClaimMessageBytes({ name, ownerPubkey, issuedAt }))) {
      return { ok: false, status: 401, code: 'bad_signature', error: 'Claim signature failed verification' };
    }

    let kycRecord = null;
    if (kyc !== undefined && kyc !== null) {
      const v = this._validateKyc(kyc);
      if (v.error) return { ok: false, status: 400, code: 'bad_kyc', error: v.error };
      // A claim-day attestation is stored as UNVERIFIED until the owner
      // posts the signed /kyc update — keeps the trust model one-way.
      kycRecord = { ...v, verified: false };
    }

    const rec = {
      name,
      owner: ownerPubkey,
      receive: null,
      kyc: kycRecord,
      createdAt: this.now(),
    };
    this.byName.set(name, rec);
    this.logger.info?.(`[names] claimed ${name}.vanta by ${ownerPubkey.slice(0, 6)}…`);
    return { ok: true, record: this._public(rec) };
  }

  resolve(name) {
    const rec = this.byName.get(name);
    return rec ? this._public(rec) : null;
  }

  // POST /v1/names/:name/receive — signed by the CURRENT SESSION key that is
  // shielding this name. The relayer independently verifies that session is
  // LIVE (unrevoked, unexpired) via liveSessionPubkey — fail-closed. Rotating
  // the receive address breaks linkability between counterparties: no two
  // senders ever see the same address.
  setReceive({ name, receivePubkey, issuedAt, signature, liveSessionPubkey }) {
    const rec = this.byName.get(name);
    if (!rec) return { ok: false, status: 404, code: 'not_found', error: 'Unknown name' };
    if (!liveSessionPubkey) {
      return { ok: false, status: 403, code: 'no_live_session', error: 'Shield must be ON (live session required) to rotate a receive address' };
    }
    if (!this._validPubkey(receivePubkey)) {
      return { ok: false, status: 400, code: 'bad_pubkey', error: 'receivePubkey must be a base58 ed25519 pubkey' };
    }
    if (!this._fresh(issuedAt)) {
      return { ok: false, status: 400, code: 'stale_timestamp', error: 'issuedAt outside allowed window' };
    }
    if (rec.receive === receivePubkey) {
      return { ok: true, record: this._public(rec) }; // idempotent
    }
    // Signature must come from the LIVE session key — not the owner, not any
    // stale key. This proves the rotation flowed through a currently-shielded
    // Vanta session rather than a random third party.
    if (!this.verify(liveSessionPubkey, signature, receiveUpdateMessageBytes({ name, receivePubkey, issuedAt }))) {
      return { ok: false, status: 401, code: 'bad_signature', error: 'Receive-update signature failed verification' };
    }
    rec.receive = receivePubkey;
    rec.receiveUpdatedAt = this.now();
    rec.receiveSignedBy = liveSessionPubkey;
    return { ok: true, record: this._public(rec) };
  }

  // POST /v1/names/:name/kyc — signed by the OWNER. Stores only the
  // attestation digest; documents never touch this server.
  setKyc({ name, ownerPubkey, issuedAt, signature, kyc }) {
    const rec = this.byName.get(name);
    if (!rec) return { ok: false, status: 404, code: 'not_found', error: 'Unknown name' };
    if (rec.owner !== ownerPubkey) {
      return { ok: false, status: 403, code: 'not_owner', error: 'Only the name owner can attach an attestation' };
    }
    if (!this._fresh(issuedAt)) {
      return { ok: false, status: 400, code: 'stale_timestamp', error: 'issuedAt outside allowed window' };
    }
    const v = this._validateKyc(kyc);
    if (v.error) return { ok: false, status: 400, code: 'bad_kyc', error: v.error };
    if (!this.verify(ownerPubkey, signature, kycMessageBytes({ name, kycHash: v.hash, issuedAt }))) {
      return { ok: false, status: 401, code: 'bad_signature', error: 'KYC-update signature failed verification' };
    }
    rec.kyc = { ...v, verified: true };
    rec.kycVerifiedAt = this.now();
    return { ok: true, record: this._public(rec) };
  }

  _validateKyc(kyc) {
    if (!kyc || typeof kyc !== 'object') return { error: 'kyc must be an object' };
    const provider = typeof kyc.provider === 'string' ? kyc.provider.slice(0, 32) : null;
    const level = typeof kyc.level === 'string' ? kyc.level : null;
    const hash = typeof kyc.hash === 'string' ? kyc.hash.toLowerCase() : null;
    if (!provider) return { error: 'kyc.provider required' };
    if (!level || !KYC_LEVELS.has(level)) return { error: `kyc.level must be one of ${[...KYC_LEVELS].join('|')}` };
    if (!/^[0-9a-f]{64}$/.test(hash || '')) return { error: 'kyc.hash must be a 64-char sha256 hex digest' };
    return { provider, level, hash };
  }

  _public(rec) {
    return {
      name: `${rec.name}.vanta`,
      owner: rec.owner,
      receive: rec.receive,
      kyc: rec.kyc
        ? { provider: rec.kyc.provider, level: rec.kyc.level, verified: rec.kyc.verified, issuedAt: rec.kyc.issuedAt || null }
        : null, // digest deliberately NOT exposed publicly
      createdAt: rec.createdAt,
      receiveUpdatedAt: rec.receiveUpdatedAt || null,
      receiveSignedBy: rec.receiveSignedBy || null,
    };
  }

  stats() {
    let withReceive = 0;
    let kycVerified = 0;
    for (const rec of this.byName.values()) {
      if (rec.receive) withReceive += 1;
      if (rec.kyc && rec.kyc.verified) kycVerified += 1;
    }
    return { names: this.byName.size, withReceive, kycVerified };
  }
}

module.exports = {
  NameRegistry,
  NAME_RE,
  SIGN_TTL_SECONDS,
  nameClaimMessageBytes,
  receiveUpdateMessageBytes,
  kycMessageBytes,
};
