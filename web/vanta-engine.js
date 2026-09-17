'use strict';

// VANTA session engine — BROWSER build.
//
// This is the web twin of src/session/engine.js: identical lifecycle, identical
// wire format (domain-separated create message, base58 fields), but the keypair
// comes from WebCrypto Ed25519 instead of node:crypto. Node's webcrypto is the
// same API surface, so this exact file is exercised headlessly by
// relayer/test/browser-engine.test.js before it ever touches a phone.
//
//   OFF  → no session key exists. Nothing in memory, nothing persisted.
//   ON   → generate Ed25519 keypair, register with the relayer (signed by the
//          session key itself), expose ONLY the session pubkey.
//   KILL → revoke with relayer, then wipe key material — even if the network
//          call fails (the relayer's TTL is the backstop).
//
// The main wallet's secret never passes through here. On device, anything that
// must be signed by the main wallet goes through the Mobile Wallet Adapter /
// Seed Vault handshake, which is injected from outside this file.

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
  const dec = new TextDecoder();

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

  class VantaSessionEngine {
    constructor({ relayerUrl, signWithMainWallet, fetchImpl } = {}) {
      this.relayerUrl = (relayerUrl || RELAYER_URL).replace(/\/+$/, '');
      // Injected main-wallet signer (MWA / Seed Vault / wallet-standard).
      // When absent, the engine runs in dev mode: no consent signature is
      // requested or sent, and the relayer marks the session consent-unverified.
      this.signWithMainWallet = signWithMainWallet || null;
      this.fetchImpl = fetchImpl || root.fetch.bind(root);

      this.state = STATE.OFF;
      this.session = null;

      // Session key material lives ONLY here, in memory. No localStorage, no
      // persistence: page reload == key gone == session worthless. That is the
      // safe failure mode for a privacy utility.
      this._keypair = null;

      // Optional internal hook — set by the page (index.html) once the session
      // is ACTIVE so the chain layer can sign txs with the session key without
      // ever exporting the private CryptoKey. Pages should NOT rely on this;
      // it is the documented seam for vanta-chain.js.
      this._internalSessionSigner = null;
    }

    /**
     * Toggle entry point. Turns the shield ON (provisioning a session key).
     * @param {string} mainWalletPubkey base58 main wallet pubkey (Seed Vault /
     *        MWA-connected wallet)
     * @param {object} [opts]
     * @param {(message: Uint8Array, issuedAt: number) => Promise<Uint8Array|null>} [opts.signWithMainWallet]
     *        Per-call main-wallet signer (MWA / Seed Vault / wallet-standard).
     *        When present, the consent signature is requested through it; when
     *        it returns null the user declined and provisioning aborts.
     */
    async shieldOn(mainWalletPubkey, opts = {}) {
      if (this.state !== STATE.OFF) {
        throw new VantaError(`Cannot shieldOn from state ${this.state}`, 'invalid_state');
      }
      if (!mainWalletPubkey) throw new VantaError('mainWalletPubkey is required', 'config');
      if (b58decode(mainWalletPubkey).length !== 32) {
        throw new VantaError('mainWalletPubkey must be a 32-byte base58 pubkey', 'config');
      }

      this.state = STATE.PROVISIONING;
      try {
        // 1. Disposable keypair, generated on device, never leaves except pubkey.
        this._keypair = await root.crypto.subtle.generateKey(
          { name: 'Ed25519' },
          true,
          ['sign'],
        );
        const rawPub = new Uint8Array(
          await root.crypto.subtle.exportKey('raw', this._keypair.publicKey),
        );
        const clientPubkey = b58encode(rawPub);

        // Internal signer for the chain layer (tx signing by the session key).
        this._internalSessionSigner = async (wireBytes) => new Uint8Array(
          await root.crypto.subtle.sign('Ed25519', this._keypair.privateKey, wireBytes),
        );

        // 2. MAIN-WALLET CONSENT (real wallets only): the injected signer signs
        //    the consent message WITH the main wallet key — user approval in the
        //    wallet UI, and server-side proof the main address opted in.
        const issuedAt = nowSeconds();
        const consentSigner = opts.signWithMainWallet || this.signWithMainWallet;
        let mainSignature = null;
        if (consentSigner) {
          const consentMsg = VantaSessionEngine.buildConsentMessage({
            clientPubkey,
            mainPubkey: mainWalletPubkey,
            issuedAt,
          });
          const consentSig = await consentSigner(consentMsg, issuedAt);
          if (!consentSig) {
            throw new VantaError('Wallet declined the shielding consent request', 'consent_denied');
          }
          mainSignature = b58encode(new Uint8Array(consentSig));
        }

        // 3. Sign the create request with the SESSION key (not the main wallet).
        const message = VantaSessionEngine.buildCreateMessage({
          clientPubkey,
          mainPubkey: mainWalletPubkey,
          issuedAt,
        });
        const sigBytes = await root.crypto.subtle.sign('Ed25519', this._keypair.privateKey, message);
        const createSignature = b58encode(new Uint8Array(sigBytes));

        // 4. Register with the relayer.
        const res = await this._post('/v1/session', {
          clientPubkey,
          mainPubkey: mainWalletPubkey,
          issuedAt,
          createSignature,
          mainSignature: mainSignature || undefined,
        });
        if (!res.ok) {
          throw new VantaError(res.error || 'Relayer refused session', res.code || 'relayer_error');
        }

        this.session = {
          id: res.session.id,
          clientPubkey,
          mainPubkey: mainWalletPubkey,
          expiresAt: res.session.expiresAt,
          spendCapLamports: res.session.spendCapLamports,
          txCapLamports: res.session.txCapLamports,
          spentLamports: 0,
          startedAt: Date.now(),
        };
        this.state = STATE.ACTIVE;
        return {
          sessionPubkey: clientPubkey,
          sessionId: res.session.id,
          expiresAt: res.session.expiresAt,
          spendCapLamports: res.session.spendCapLamports,
          txCapLamports: res.session.txCapLamports,
          consentVerified: !!res.session.consentVerified,
        };
      } catch (err) {
        // Provisioning failed: leave nothing behind.
        this._wipeLocalState();
        this.state = STATE.OFF;
        throw err;
      }
    }

    /**
     * Sign arbitrary bytes with the CURRENT session key. Only valid while a
     * session is ACTIVE — the key exists in memory exactly for the session's
     * lifetime. This is how the chain layer (vanta-chain.js) has the session
     * key sign real transactions without the key ever leaving the engine.
     * @param {Uint8Array} wireBytes the tx message bytes to sign
     * @returns {Promise<Uint8Array>} 64-byte Ed25519 signature
     */
    async signSessionBytes(wireBytes) {
      if (this.state !== STATE.ACTIVE || !this._internalSessionSigner) {
        throw new VantaError('No active session key to sign with', 'invalid_state');
      }
      return this._internalSessionSigner(wireBytes);
    }

    /**
     * Kill-switch. Revokes with the relayer (idempotent server-side) and then
     * wipes local state no matter what the network says.
     */
    async shieldOff() {
      if (this.state === STATE.OFF) return { revoked: false, unspentLamports: null };
      if (this.state === STATE.PROVISIONING) {
        this._wipeLocalState();
        this.state = STATE.OFF;
        return { revoked: false, unspentLamports: null };
      }
      if (this.state === STATE.REVOKING) {
        throw new VantaError('shieldOff already in progress', 'invalid_state');
      }

      this.state = STATE.REVOKING;
      const sessionId = this.session ? this.session.id : null;
      let revoked = false;
      let unspentLamports = null;

      try {
        if (sessionId) {
          try {
            const res = await this._post(`/v1/session/${encodeURIComponent(sessionId)}/revoke`, {});
            if (res.ok) {
              revoked = true;
              unspentLamports = typeof res.unspentLamports === 'number' ? res.unspentLamports : null;
            }
          } catch {
            // Relayer unreachable: NOT an error. The local wipe below is what
            // matters; the relayer's TTL reclaims the server-side session.
          }
        }
      } finally {
        // Kill-switch semantics: local wipe ALWAYS happens, even if the
        // relayer was unreachable. The relayer's TTL is the backstop.
        this._wipeLocalState();
        this.state = STATE.OFF;
      }
      return { revoked, unspentLamports };
    }

    /** Ask the relayer to co-sign a spend from the session key. */
    async requestCosign(lamports, tx) {
      if (this.state !== STATE.ACTIVE) throw new VantaError('Session is not active', 'invalid_state');
      if (!Number.isInteger(lamports) || lamports <= 0) {
        throw new VantaError('lamports must be a positive integer', 'bad_amount');
      }
      if (lamports > this.session.txCapLamports) {
        throw new VantaError('Amount exceeds per-tx cap', 'tx_cap');
      }

      const res = await this._post(
        `/v1/session/${encodeURIComponent(this.session.id)}/cosign`,
        { lamports, tx },
      );
      if (!res.ok) throw new VantaError(res.error || 'Co-sign refused', res.code || 'cosign_failed');
      this.session.spentLamports = res.spentLamports;
      return res;
    }

    /** Fresh status from the relayer; falls back to local view when offline. */
    async status() {
      if (this.state !== STATE.ACTIVE || !this.session) {
        return { state: this.state, active: false };
      }
      try {
        const res = await this._get(`/v1/session/${encodeURIComponent(this.session.id)}`);
        if (res.ok) return { state: this.state, active: res.session.live, session: res.session };
        return { state: this.state, active: true, session: this._localView() };
      } catch (err) {
        return { state: this.state, active: true, offline: true, session: this._localView() };
      }
    }

    static buildCreateMessage({ clientPubkey, mainPubkey, issuedAt }) {
      return concatBytes([
        enc.encode('vanta-session-create-v1\0'),
        b58decode(clientPubkey),
        b58decode(mainPubkey),
        enc.encode(String(issuedAt)),
      ]);
    }

    // Consent message signed by the MAIN wallet. Human-readable ON PURPOSE:
    // wallet UIs display these bytes as text — this IS the approval prompt
    // the user sees ("let Vanta shield your txns"). Must stay byte-identical
    // to consentMessageBytes in relayer/src/server.js.
    static buildConsentMessage({ clientPubkey, mainPubkey, issuedAt }) {
      return enc.encode(
        'VANTA session consent v1\n' +
        `Shield wallet (disposable): ${clientPubkey}\n` +
        `Main wallet: ${mainPubkey}\n` +
        `Issued at: ${issuedAt}\n` +
        'By signing, the main wallet approves VANTA shielding transactions for this session key only.',
      );
    }

    _localView() {
      return {
        id: this.session.id,
        clientPubkey: this.session.clientPubkey,
        expiresAt: this.session.expiresAt,
        spentLamports: this.session.spentLamports || 0,
        spendCapLamports: this.session.spendCapLamports,
      };
    }

    _wipeLocalState() {
      this._keypair = null;
      this._internalSessionSigner = null; // the tx-signing capability dies with the key
      this.session = null;
    }

    async _post(path, body) {
      const res = await this.fetchImpl(`${this.relayerUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.json();
    }

    async _get(path) {
      const res = await this.fetchImpl(`${this.relayerUrl}${path}`);
      return res.json();
    }
  }

  root.VantaEngine = { VantaSessionEngine, VantaError, STATE, b58encode, b58decode };
  // Bare globals too, so the page's inline script can use them directly
  // (window.VantaEngine.VantaSessionEngine is the namespaced path).
  root.VantaSessionEngine = VantaSessionEngine;
  root.VantaError = VantaError;
})(typeof window !== 'undefined' ? window : globalThis);
