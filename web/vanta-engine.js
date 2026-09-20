'use strict';

// VANTA session engine — vault + relay two-keypair model.
// Vault = persistent (derived from seed, never visible in outgoing txns).
// Relay = disposable (derived from seed + salt, rotates, visible to public).

(function attach(root) {
  const RELAYER_URL = (root.VANTA_RELAYER_URL || 'http://localhost:8787').replace(/\/+$/, '');

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

  async function deriveKeypair(labelParts) {
    const seed = getOrCreateSeed();
    const material = concatBytes([
      seed,
      ...labelParts,
    ]);
    const derivedSeed = new Uint8Array(
      await root.crypto.subtle.digest('SHA-256', material),
    );
    return root.nacl.sign.keyPair.fromSeed(derivedSeed);
  }

  class VantaSessionEngine {
    constructor({ relayerUrl, fetchImpl } = {}) {
      this.relayerUrl = (relayerUrl || RELAYER_URL).replace(/\/+$/, '');
      this.fetchImpl = fetchImpl || root.fetch.bind(root);
      this.state = 'OFF';
      this.session = null;
      this._vaultKp = null;
      this._relayKp = null;
    }

    // Derive the persistent vault keypair (salt=0, never rotates).
    async _getVaultKp() {
      if (this._vaultKp) return this._vaultKp;
      if (!root.nacl || !root.nacl.sign) throw new VantaError('tweetnacl not loaded', 'dependency');
      this._vaultKp = await deriveKeypair([enc.encode('\x00vanta-vault-v1\x00')]);
      return this._vaultKp;
    }

    // Derive the rotating relay keypair (salt changes on rotate).
    async _getRelayKp() {
      if (this._relayKp) return this._relayKp;
      if (!root.nacl || !root.nacl.sign) throw new VantaError('tweetnacl not loaded', 'dependency');
      const saltN = getSalt();
      this._relayKp = await deriveKeypair([
        enc.encode('\x00vanta-relay-v1\x00'),
        enc.encode(String(saltN)),
      ]);
      return this._relayKp;
    }

    get vaultPubkey() { return this._vaultKp ? b58encode(this._vaultKp.publicKey) : null; }
    get relayPubkey() { return this._relayKp ? b58encode(this._relayKp.publicKey) : null; }

    // Provision both vault and relay. Returns relay address (what to show for Receive).
    async shieldOn() {
      if (this.state !== 'OFF') {
        throw new VantaError('Cannot shieldOn from state ' + this.state, 'invalid_state');
      }
      this.state = 'PROVISIONING';
      try {
        if (!root.nacl || !root.nacl.sign) {
          throw new VantaError('tweetnacl not loaded', 'dependency');
        }

        const vaultKp = await this._getVaultKp();
        const relayKp = await this._getRelayKp();
        const relayPub = b58encode(relayKp.publicKey);
        const vaultPub = b58encode(vaultKp.publicKey);

        const issuedAt = nowSeconds();
        const message = VantaSessionEngine.buildCreateMessage({
          clientPubkey: relayPub,
          mainPubkey: vaultPub,
          issuedAt,
        });
        const createSignature = b58encode(root.nacl.sign.detached(message, relayKp.secretKey));

        let sessionId = 'local-' + relayPub.slice(0, 8);
        let expiresAt = issuedAt + 3600;
        let spendCapLamports = 1000000000;
        let txCapLamports = 500000000;

        try {
          const res = await this._post('/v1/session', {
            clientPubkey: relayPub,
            mainPubkey: vaultPub,
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
          clientPubkey: relayPub,
          vaultPubkey: vaultPub,
          expiresAt,
          spendCapLamports,
          txCapLamports,
          spentLamports: 0,
          startedAt: Date.now(),
        };
        this.state = 'ACTIVE';

        return {
          relayPubkey: relayPub,
          vaultPubkey: vaultPub,
          sessionId,
          expiresAt,
          spendCapLamports,
          txCapLamports,
        };
      } catch (err) {
        this._wipeLocalState();
        this.state = 'OFF';
        throw err;
      }
    }

    // Sign as relay (for relay→recipient sends).
    async signRelayBytes(wireBytes) {
      if (!this._relayKp) throw new VantaError('No relay key', 'invalid_state');
      return root.nacl.sign.detached(wireBytes, this._relayKp.secretKey);
    }

    // Sign as vault (for vault→relay internal transfers).
    async signVaultBytes(wireBytes) {
      if (!this._vaultKp) throw new VantaError('No vault key', 'invalid_state');
      return root.nacl.sign.detached(wireBytes, this._vaultKp.secretKey);
    }

    async shieldOff() {
      if (this.state === 'OFF') return { revoked: false };
      this._wipeLocalState();
      this.state = 'OFF';
      rotateSalt();
      return { revoked: false };
    }

    static buildNameClaimMessage({ name, ownerPubkey, issuedAt }) {
      return concatBytes([
        enc.encode('\x00vanta-name-claim-v1\x00'),
        enc.encode(name),
        enc.encode('\x00'),
        b58decode(ownerPubkey),
        enc.encode(String(issuedAt)),
      ]);
    }

    static buildReceiveUpdateMessage({ name, receivePubkey, issuedAt }) {
      return concatBytes([
        enc.encode('\x00vanta-name-receive-v1\x00'),
        enc.encode(name),
        enc.encode('\x00'),
        b58decode(receivePubkey),
        enc.encode(String(issuedAt)),
      ]);
    }

    async claimName(name) {
      if (!name || typeof name !== 'string') throw new VantaError('name is required', 'config');
      if (!this.session) throw new VantaError('No active session', 'invalid_state');
      const issuedAt = nowSeconds();
      const message = VantaSessionEngine.buildNameClaimMessage({
        name,
        ownerPubkey: this.session.relayPubkey || this.session.clientPubkey,
        issuedAt,
      });
      const sigBytes = await this.signRelayBytes(message);
      const res = await this._post('/v1/names/claim', {
        name,
        ownerPubkey: this.session.relayPubkey || this.session.clientPubkey,
        issuedAt,
        signature: b58encode(sigBytes),
      });
      if (!res.ok) throw new VantaError(res.error || 'Name claim refused', res.code || 'claim_failed');
      return res;
    }

    async setReceiveAddress(name, receivePubkey) {
      if (!this.session) throw new VantaError('No active session', 'invalid_state');
      const clean = String(name || '').replace(/\.vanta$/, '');
      const issuedAt = nowSeconds();
      const message = VantaSessionEngine.buildReceiveUpdateMessage({ name: clean, receivePubkey, issuedAt });
      const sigBytes = await this.signRelayBytes(message);
      const res = await this._post('/v1/names/' + encodeURIComponent(clean) + '/receive', {
        receivePubkey,
        issuedAt,
        signature: b58encode(sigBytes),
        clientPubkey: this.session.relayPubkey || this.session.clientPubkey,
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
        enc.encode('\x00vanta-session-create-v1\x00'),
        b58decode(clientPubkey),
        b58decode(mainPubkey),
        enc.encode(String(issuedAt)),
      ]);
    }

    _wipeLocalState() {
      this._relayKp = null;
      this.session = null;
      // Vault key persists — it's the user's permanent identity.
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

  root.VantaEngine = { VantaSessionEngine, VantaError, STATE: { OFF: 'OFF', PROVISIONING: 'PROVISIONING', ACTIVE: 'ACTIVE', REVOKING: 'REVOKING' }, b58encode, b58decode };
  root.VantaSessionEngine = VantaSessionEngine;
  root.VantaError = VantaError;
})(typeof window !== 'undefined' ? window : globalThis);
