'use strict';

// VANTA session engine — no wallet dependency.
// Session keys derived from a stored seed + rotation salt.

(function attach(root) {
  const RELAYER_URL = (root.VANTA_RELAYER_URL || 'http://localhost:8787').replace(/\/+$/, '');

  const STATE = Object.freeze({
    OFF: 'OFF',
    PROVISIONING: 'PROVISIONING',
    ACTIVE: 'ACTIVE',
    REVOKING: 'REVOKING',
  });

  const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  function b58encode(bytes) {
    let num = 0n;
    for (const b of bytes) num = num * 256n + BigInt(b);
    let out = '';
    while (num > 0n) {
      out = B58_ALPHABET[Number(num % 58n)] + out;
      num /= 58n;
    }
    for (const b of bytes) {
      if (b !== 0) break;
      out = '1' + out;
    }
    return out || '1';
  }

  function b58decode(str) {
    let num = 0n;
    for (const c of str) {
      const idx = B58_ALPHABET.indexOf(c);
      if (idx < 0) throw new Error('invalid base58 character: ' + c);
      num = num * 58n + BigInt(idx);
    }
    const out = [];
    while (num > 0n) {
      out.unshift(Number(num % 256n));
      num /= 256n;
    }
    for (const c of str) {
      if (c !== '1') break;
      out.unshift(0);
    }
    return new Uint8Array(out);
  }

  function concatBytes(parts) {
    let len = 0;
    for (const p of parts) len += p.length;
    const out = new Uint8Array(len);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  }

  const enc = new TextEncoder();

  class VantaError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'VantaError';
      this.code = code;
    }
  }

  function nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }

  function getOrCreateSeed() {
    try {
      let hex = localStorage.getItem('vanta_seed');
      if (hex && hex.length === 64) {
        return new Uint8Array(hex.match(/.{2}/g).map((h) => parseInt(h, 16)));
      }
    } catch {}
    const seed = new Uint8Array(32);
    crypto.getRandomValues(seed);
    try {
      localStorage.setItem('vanta_seed', [...seed].map((b) => b.toString(16).padStart(2, '0')).join(''));
    } catch {}
    return seed;
  }

  function getSalt() {
    try { return Number(localStorage.getItem('vanta_salt') || 0); } catch { return 0; }
  }

  function rotateSalt() {
    try { localStorage.setItem('vanta_salt', String(getSalt() + 1)); } catch {}
  }

  class VantaSessionEngine {
    constructor({ relayerUrl, fetchImpl } = {}) {
      this.relayerUrl = (relayerUrl || RELAYER_URL).replace(/\/+$/, '');
      this.fetchImpl = fetchImpl || root.fetch.bind(root);
      this.state = STATE.OFF;
      this.session = null;
      this._naclKp = null;
      this._internalSessionSigner = null;
    }

    async shieldOn() {
      if (this.state !== STATE.OFF) {
        throw new VantaError('Cannot shieldOn from state ' + this.state, 'invalid_state');
      }
      this.state = STATE.PROVISIONING;
      try {
        if (!root.nacl || !root.nacl.sign) {
          throw new VantaError('tweetnacl not loaded', 'dependency');
        }

        const seed = getOrCreateSeed();
        const saltN = getSalt();
        const rootMaterial = concatBytes([
          seed,
          enc.encode('vanta-session-v1\0'),
          enc.encode(String(saltN)),
        ]);
        const derivedSeed = new Uint8Array(
          await root.crypto.subtle.digest('SHA-256', rootMaterial),
        );
        const kp = root.nacl.sign.keyPair.fromSeed(derivedSeed);
        this._naclKp = kp;
        const clientPubkey = b58encode(kp.publicKey);

        this._internalSessionSigner = async (wireBytes) =>
          root.nacl.sign.detached(wireBytes, kp.secretKey);

        const issuedAt = nowSeconds();
        const message = VantaSessionEngine.buildCreateMessage({
          clientPubkey,
          mainPubkey: clientPubkey,
          issuedAt,
        });
        const createSignature = b58encode(root.nacl.sign.detached(message, kp.secretKey));

        let sessionId = 'local-' + clientPubkey.slice(0, 8);
        let expiresAt = issuedAt + 3600;
        let spendCapLamports = 1000000000;
        let txCapLamports = 500000000;

        try {
          const res = await this._post('/v1/session', {
            clientPubkey,
            mainPubkey: clientPubkey,
            issuedAt,
            createSignature,
          });
          if (res.ok) {
            sessionId = res.session.id;
            expiresAt = res.session.expiresAt;
            spendCapLamports = res.session.spendCapLamports;
            txCapLamports = res.session.txCapLamports;
          }
        } catch {}

        this.session = {
          id: sessionId,
          clientPubkey,
          expiresAt,
          spendCapLamports,
          txCapLamports,
          spentLamports: 0,
          startedAt: Date.now(),
        };
        this.state = STATE.ACTIVE;

        return {
          sessionPubkey: clientPubkey,
          sessionId,
          expiresAt,
          spendCapLamports,
          txCapLamports,
        };
      } catch (err) {
        this._wipeLocalState();
        this.state = STATE.OFF;
        throw err;
      }
    }

    async signSessionBytes(wireBytes) {
      if (this.state !== STATE.ACTIVE || !this._internalSessionSigner) {
        throw new VantaError('No active session key to sign with', 'invalid_state');
      }
      return this._internalSessionSigner(wireBytes);
    }

    async shieldOff() {
      if (this.state === STATE.OFF) return { revoked: false };
      if (this.state === STATE.PROVISIONING) {
        this._wipeLocalState();
        this.state = STATE.OFF;
        return { revoked: false };
      }
      if (this.state === STATE.REVOKING) {
        throw new VantaError('shieldOff already in progress', 'invalid_state');
      }
      this.state = STATE.REVOKING;
      const sessionId = this.session ? this.session.id : null;
      let revoked = false;
      try {
        if (sessionId && !sessionId.startsWith('local-')) {
          try {
            const res = await this._post('/v1/session/' + encodeURIComponent(sessionId) + '/revoke', {});
            if (res.ok) revoked = true;
          } catch {}
        }
      } finally {
        this._wipeLocalState();
        this.state = STATE.OFF;
        rotateSalt();
      }
      return { revoked };
    }

    static buildNameClaimMessage({ name, ownerPubkey, issuedAt }) {
      return concatBytes([
        enc.encode('vanta-name-claim-v1\0'),
        enc.encode(name),
        enc.encode('\0'),
        b58decode(ownerPubkey),
        enc.encode(String(issuedAt)),
      ]);
    }

    static buildReceiveUpdateMessage({ name, receivePubkey, issuedAt }) {
      return concatBytes([
        enc.encode('vanta-name-receive-v1\0'),
        enc.encode(name),
        enc.encode('\0'),
        b58decode(receivePubkey),
        enc.encode(String(issuedAt)),
      ]);
    }

    async claimName(name) {
      if (!name || typeof name !== 'string') throw new VantaError('name is required', 'config');
      if (!this.session || !this._internalSessionSigner) {
        throw new VantaError('No active session', 'invalid_state');
      }
      const issuedAt = nowSeconds();
      const message = VantaSessionEngine.buildNameClaimMessage({
        name,
        ownerPubkey: this.session.clientPubkey,
        issuedAt,
      });
      const sigBytes = await this._internalSessionSigner(message);
      const res = await this._post('/v1/names/claim', {
        name,
        ownerPubkey: this.session.clientPubkey,
        issuedAt,
        signature: b58encode(sigBytes),
      });
      if (!res.ok) throw new VantaError(res.error || 'Name claim refused', res.code || 'claim_failed');
      return res;
    }

    async setReceiveAddress(name, receivePubkey) {
      if (!this.session || !this._internalSessionSigner) {
        throw new VantaError('No active session', 'invalid_state');
      }
      const clean = String(name || '').replace(/\.vanta$/, '');
      const issuedAt = nowSeconds();
      const message = VantaSessionEngine.buildReceiveUpdateMessage({ name: clean, receivePubkey, issuedAt });
      const sigBytes = await this._internalSessionSigner(message);
      const res = await this._post('/v1/names/' + encodeURIComponent(clean) + '/receive', {
        receivePubkey,
        issuedAt,
        signature: b58encode(sigBytes),
        clientPubkey: this.session.clientPubkey,
      });
      if (!res.ok) throw new VantaError(res.error || 'Receive-address update refused', res.code || 'receive_failed');
      return res;
    }

    async resolveName(name) {
      const clean = String(name || '').replace(/\.vanta$/, '');
      return this._get('/v1/names/' + encodeURIComponent(clean));
    }

    static buildCreateMessage({ clientPubkey, mainPubkey, issuedAt }) {
      return concatBytes([
        enc.encode('vanta-session-create-v1\0'),
        b58decode(clientPubkey),
        b58decode(mainPubkey),
        enc.encode(String(issuedAt)),
      ]);
    }

    _wipeLocalState() {
      this._naclKp = null;
      this._internalSessionSigner = null;
      this.session = null;
    }

    async _post(path, body) {
      const res = await this.fetchImpl(this.relayerUrl + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.json();
    }

    async _get(path) {
      const res = await this.fetchImpl(this.relayerUrl + path);
      return res.json();
    }
  }

  root.VantaEngine = { VantaSessionEngine, VantaError, STATE, b58encode, b58decode };
  root.VantaSessionEngine = VantaSessionEngine;
  root.VantaError = VantaError;
})(typeof window !== 'undefined' ? window : globalThis);
