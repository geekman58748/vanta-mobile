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

  // Consent message signed by the MAIN wallet. Human-readable ON PURPOSE:
  // wallet UIs display these bytes as text — this IS the approval prompt the
  // user sees. Must stay byte-identical to consentMessageBytes in
  // relayer/src/server.js and to buildConsentMessage in web/vanta-engine.js.
  static buildConsentMessage({ clientPubkey, mainPubkey, issuedAt }) {
    return Buffer.from(
      'VANTA session consent v1\n' +
      `Shield wallet (disposable): ${clientPubkey}\n` +
      `Main wallet: ${mainPubkey}\n` +
      `Issued at: ${issuedAt}\n` +
      'By signing, the main wallet approves VANTA shielding transactions for this session key only.',
      'utf8',
    );
  }

  // Canonical .vanta name-layer messages. Must stay byte-identical to the
  // relayer's builders in relayer/src/names.js.
  static buildNameClaimMessage({ name, ownerPubkey, issuedAt }) {
    return Buffer.concat([
      Buffer.from('vanta-name-claim-v1\0', 'utf8'),
      Buffer.from(name, 'utf8'),
      Buffer.from('\0', 'utf8'),
      Buffer.from(b58decode(ownerPubkey)),
      Buffer.from(issuedAt.toString(10), 'ascii'),
    ]);
  }

  static buildReceiveUpdateMessage({ name, receivePubkey, issuedAt }) {
    return Buffer.concat([
      Buffer.from('vanta-name-receive-v1\0', 'utf8'),
      Buffer.from(name, 'utf8'),
      Buffer.from('\0', 'utf8'),
      Buffer.from(b58decode(receivePubkey)),
      Buffer.from(issuedAt.toString(10), 'ascii'),
    ]);
  }

  static buildKycMessage({ name, kycHash, issuedAt }) {
    return Buffer.concat([
      Buffer.from('vanta-name-kyc-v1\0', 'utf8'),
      Buffer.from(name, 'utf8'),
      Buffer.from('\0', 'utf8'),
      Buffer.from(kycHash, 'ascii'),
      Buffer.from(issuedAt.toString(10), 'ascii'),
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

  // ── Name layer (.vanta) ─────────────────────────────────────────────
  // Off-chain social identity: claim a name with the MAIN wallet, rotate the
  // ephemeral receive address with the CURRENT SESSION key. All signing is
  // delegated to the injected callbacks — the engine never holds main keys.

  /**
   * Claim a .vanta name with the main wallet. Options:
   *   signWithMainWallet(bytes, issuedAt) → base58 signature (required)
   *   kyc: { provider, level, hash }      → optional claim-day attestation
   * @returns {Promise<{record}>}
   */
  async claimName(name, { signWithMainWallet, ownerPubkey, kyc } = {}) {
    if (!name || typeof name !== 'string') throw new VantaError('name is required', 'config');
    if (!signWithMainWallet) throw new VantaError('signWithMainWallet is required to claim a name', 'config');
    const owner = ownerPubkey || (this.session && this.session.mainPubkey);
    const resolvedOwner = this._requireOwner(owner);
    const issuedAt = nowSeconds();
    const message = VantaSessionEngine.buildNameClaimMessage({ name, ownerPubkey: resolvedOwner, issuedAt });
    const signature = await signWithMainWallet(message, issuedAt);
    if (!signature) throw new VantaError('Main wallet declined the name claim', 'consent_denied');
    const res = await this._post('/v1/names/claim', { name, ownerPubkey: resolvedOwner, issuedAt, signature, kyc: kyc || undefined });
    if (!res.ok) throw new VantaError(res.error || 'Name claim refused', res.code || 'claim_failed');
    return res;
  }


  /**
   * Rotate the ephemeral receive address for a name. Uses the CURRENT session
   * key — proof the rotation came through Vanta. Caller supplies a fresh
   * address (per-receive-click); nothing is reused.
   */
  async setReceiveAddress(name, receivePubkey) {
    if (!this.session || !this._keypair) throw new VantaError('Shield is OFF — no session key', 'invalid_state');
    const issuedAt = nowSeconds();
    const message = VantaSessionEngine.buildReceiveUpdateMessage({ name, receivePubkey, issuedAt });
    const signature = await this._signBytes(message);
    const res = await this._post(`/v1/names/${encodeURIComponent(name.replace(/\.vanta$/, ''))}/receive`, {
      receivePubkey,
      issuedAt,
      signature,
      clientPubkey: this.session.clientPubkey, // relayer proves this session is live
    });
    if (!res.ok) throw new VantaError(res.error || 'Receive-address update refused', res.code || 'receive_failed');
    return res;
  }

  /** Attach (or refresh) a signed KYC attestation for a name. Documents never
   *  touch the relayer — only the sha256 digest of the attestation does. */
  async setKycAttestation(name, kyc, { signWithMainWallet, ownerPubkey } = {}) {
    const signer = signWithMainWallet || this.signWithMainWallet;
    if (!signer) throw new VantaError('signWithMainWallet is required for KYC updates', 'config');
    const owner = ownerPubkey || (this.session && this.session.mainPubkey);
    const resolvedOwner = this._requireOwner(owner);
    const kycHash = kyc && typeof kyc.hash === 'string' ? kyc.hash.toLowerCase() : null;
    if (!/^[0-9a-f]{64}$/.test(kycHash || '')) throw new VantaError('kyc.hash must be a 64-char sha256 hex digest', 'config');
    const issuedAt = nowSeconds();
    const message = VantaSessionEngine.buildKycMessage({ name, kycHash, issuedAt });
    const signature = await signer(message, issuedAt);
    if (!signature) throw new VantaError('Main wallet declined the KYC attestation', 'consent_denied');
    const res = await this._post(`/v1/names/${encodeURIComponent(name.replace(/\.vanta$/, ''))}/kyc`, {
      ownerPubkey: resolvedOwner,
      issuedAt,
      signature,
      kyc: { provider: kyc.provider, level: kyc.level, hash: kycHash },
    });
    if (!res.ok) throw new VantaError(res.error || 'KYC attestation refused', res.code || 'kyc_failed');
    return res;
  }

  async resolveName(name) {
    const clean = String(name || '').replace(/\.vanta$/, '');
    const res = await this.fetchImpl(`${this.relayerUrl}/v1/names/${encodeURIComponent(clean)}`);
    return res.json(); // { ok, record? } — caller decides how to handle 404s
  }

  _requireOwner(mainPubkey) {
    if (!mainPubkey) throw new VantaError('Main wallet pubkey unavailable — connect the wallet first', 'config');
    return mainPubkey;
  }

  /** Sign raw bytes with the CURRENT disposable session key (raw ed25519,
   *  base58-encoded — the same shape the relayer's verifyEd25519 expects). */
  _signBytes(message) {
    if (!this._keypair) throw new VantaError('Shield is OFF — no session key', 'invalid_state');
    const sig = crypto.sign(null, message, this._keypair.privateKey);
    return b58encode(new Uint8Array(sig));
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
