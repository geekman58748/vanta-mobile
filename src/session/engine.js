'use strict';

// VANTA session engine — client side.
//
// The engine owns ONE thing: the lifecycle of the disposable session key.
//
//   OFF  → no session key exists. Nothing in memory, nothing on disk.
//   ON   → generate ed25519 keypair, register with relayer (signed by the
//          session key itself), report the session pubkey as the ONLY public
//          identity dApps/merchants get to see.
//   KILL → revoke with relayer, then wipe the keypair from memory.
//
// The main wallet's secret NEVER passes through here. Signing anything that
// requires the main wallet is delegated to `signWithMainWallet` (on device
// this is the Seed Vault callback; in tests it's a stub).

const crypto = require('node:crypto');
const { encode: b58encode, decode: b58decode } = require('../util/base58');

const STATE = Object.freeze({
  OFF: 'OFF',
  PROVISIONING: 'PROVISIONING',
  ACTIVE: 'ACTIVE',
  REVOKING: 'REVOKING',
});

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

class VantaError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'VantaError';
    this.code = code;
  }
}

class VantaSessionEngine {
  /**
   * @param {object} opts
   * @param {string} opts.relayerUrl        e.g. http://localhost:8787
   * @param {(message: Uint8Array) => Promise<Uint8Array>} opts.signWithMainWallet
   *        Injected signer for anything that must be signed by the main
   *        wallet (Seed Vault on device). The engine never stores that key.
   * @param {typeof fetch} [opts.fetchImpl] injectable fetch (tests)
   */
  constructor({ relayerUrl, signWithMainWallet, fetchImpl = globalThis.fetch } = {}) {
    if (!relayerUrl) throw new VantaError('relayerUrl is required', 'config');
    this.relayerUrl = relayerUrl.replace(/\/+$/, '');
    // Injected main-wallet signer (MWA / Seed Vault / wallet-standard).
    // When absent, the engine runs in dev mode: no consent signature is
    // requested or sent, and the relayer marks the session consent-unverified.
    this.signWithMainWallet = signWithMainWallet || null;
    this.fetchImpl = fetchImpl;

    this.state = STATE.OFF;
    this.session = null; // { id, clientPubkey, expiresAt, spendCapLamports, ... }

    // Session key material lives ONLY here, in memory. There is deliberately
    // no persistence: app restart == key gone == session worthless. That is
    // the safe failure mode for a privacy utility.
    this._keypair = null;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Toggle entry point. Turns the shield ON (provisioning a session key).
   * @param {string} mainWalletPubkey base58 main wallet pubkey (Seed Vault)
   * @returns {Promise<{sessionPubkey: string, sessionId: string, expiresAt: number}>}
   */
  async shieldOn(mainWalletPubkey, opts = {}) {
    if (this.state !== STATE.OFF) {
      throw new VantaError(`Cannot shieldOn from state ${this.state}`, 'invalid_state');
    }
    if (!mainWalletPubkey) throw new VantaError('mainWalletPubkey is required', 'config');

    this.state = STATE.PROVISIONING;
    try {
      // 1. Disposable keypair, generated on device, never leaves except pubkey.
      const raw = crypto.generateKeyPairSync('ed25519');
      this._keypair = raw;
      const clientPubkey = b58encode(new Uint8Array(raw.publicKey.export({
        type: 'spki',
        format: 'der',
      }).subarray(-32))); // last 32 bytes of SPKI = raw ed25519 pubkey

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
      const createSignature = b58encode(new Uint8Array(
        crypto.sign(null, message, this._keypair.privateKey)
      ));

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
        startedAt: Date.now(),
      };
      this.state = STATE.ACTIVE;
      return {
        sessionPubkey: clientPubkey,
        sessionId: res.session.id,
        expiresAt: res.session.expiresAt,
        spendCapLamports: res.session.spendCapLamports,
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
   * Kill-switch. Revokes with the relayer (idempotent server-side) and then
   * wipes local state no matter what the network says.
   * @returns {Promise<{revoked: boolean, unspentLamports: number|null}>}
   */
  async shieldOff() {
    if (this.state === STATE.OFF) return { revoked: false, unspentLamports: null };
    if (this.state === STATE.PROVISIONING) {
      // Toggle spam during provisioning: treat as kill-switch on the pending key.
      this._wipeLocalState();
      this.state = STATE.OFF;
      return { revoked: false, unspentLamports: null };
    }
    if (this.state === STATE.REVOKING) {
      throw new VantaError('shieldOff already in progress', 'invalid_state');
    }

    this.state = STATE.REVOKING;
    const sessionId = this.session?.id;
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

  /**
   * Ask the relayer to co-sign a spend from the session key.
   * The engine enforces the local view of the cap first so we fail fast.
   * @param {number} lamports
   * @param {object} [tx] opaque transaction payload for the relayer
   */
  async requestCosign(lamports, tx) {
    if (this.state !== STATE.ACTIVE) throw new VantaError('Session is not active', 'invalid_state');
    if (!Number.isInteger(lamports) || lamports <= 0) throw new VantaError('lamports must be a positive integer', 'bad_amount');
    if (lamports > this.session.txCapLamports) throw new VantaError('Amount exceeds per-tx cap', 'tx_cap');

    const res = await this._post(`/v1/session/${encodeURIComponent(this.session.id)}/cosign`, { lamports, tx });
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
      if (res.ok) {
        return { state: this.state, active: res.session.live, session: res.session };
      }
      return { state: this.state, active: true, session: this._localView() };
    } catch {
      // Offline: local view only. The relayer TTL is authoritative eventually.
      return { state: this.state, active: true, offline: true, session: this._localView() };
    }
  }

  // ── Internals ───────────────────────────────────────────────────────────

  static buildCreateMessage({ clientPubkey, mainPubkey, issuedAt }) {
    return Buffer.concat([
      Buffer.from('vanta-session-create-v1\0'),
      b58decode(clientPubkey),
      b58decode(mainPubkey),
      Buffer.from(String(issuedAt), 'ascii'),
    ]);
  }

  // Consent message signed by the MAIN wallet: prefix || main || client || ts.
  // (Order differs from buildCreateMessage deliberately — distinct roles.)
  static buildConsentMessage({ clientPubkey, mainPubkey, issuedAt }) {
    return Buffer.concat([
      Buffer.from('vanta-session-consent-v1\0'),
      b58decode(mainPubkey),
      b58decode(clientPubkey),
      Buffer.from(String(issuedAt), 'ascii'),
    ]);
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
    // Zero what we can, drop references, clear session record.
    try {
      if (this._keypair) {
        this._keypair.publicKey = null;
        this._keypair.privateKey = null;
      }
    } catch { /* KeyObject fields are setters-only in some runtimes; fine */ }
    this._keypair = null;
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

module.exports = { VantaSessionEngine, VantaError, STATE };
