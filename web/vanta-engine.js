'use strict';

// VANTA engine — Specter SDK stealth address integration.
// Uses @protocol-01/specter-sdk for real on-chain privacy.
// Stealth addresses: each receive generates a unique one-time address.
// Private transfers: amounts hidden via ZK proofs.

(function attach(root) {
  const RELAYER_URL = (root.VANTA_RELAYER_URL || 'http://localhost:8787').replace(/\/+$/, '');

  class VantaError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'VantaError';
      this.code = code;
    }
  }

  // Wait for Specter SDK to be available
  function getSpecter() {
    if (root.SpecterSDK) return root.SpecterSDK;
    throw new VantaError('Specter SDK not loaded', 'dependency');
  }

  function getWeb3() {
    if (root.solanaWeb3) return root.solanaWeb3;
    throw new VantaError('Solana web3.js not loaded', 'dependency');
  }

  // Store wallet state in localStorage
  function saveWalletState(state) {
    try {
      // Don't store the full wallet — store the mnemonic for recovery
      if (state.mnemonic) localStorage.setItem('vanta_mnemonic', state.mnemonic);
      if (state.metaAddress) localStorage.setItem('vanta_meta_address', state.metaAddress);
    } catch {}
  }

  function loadWalletState() {
    try {
      return {
        mnemonic: localStorage.getItem('vanta_mnemonic') || null,
        metaAddress: localStorage.getItem('vanta_meta_address') || null,
      };
    } catch { return { mnemonic: null, metaAddress: null }; }
  }

  class VantaSessionEngine {
    constructor({ relayerUrl, fetchImpl } = {}) {
      this.relayerUrl = (relayerUrl || RELAYER_URL).replace(/\/+$/, '');
      this.fetchImpl = fetchImpl || root.fetch.bind(root);
      this.state = 'OFF';
      this.session = null;
      this._client = null;
      this._wallet = null;
    }

    // Provision: create or restore a Specter stealth wallet.
    async shieldOn() {
      if (this.state !== 'OFF') {
        throw new VantaError('Cannot shieldOn from state ' + this.state, 'invalid_state');
      }
      this.state = 'PROVISIONING';
      try {
        const Specter = getSpecter();
        const saved = loadWalletState();

        // Create or restore wallet
        let wallet;
        if (saved.mnemonic) {
          wallet = await Specter.importFromSeedPhrase(saved.mnemonic);
        } else {
          wallet = await Specter.createWallet();
          saveWalletState({ mnemonic: wallet.mnemonic || wallet.mnemonicPhrase });
        }

        // Create client and connect
        const client = new Specter.P01Client({ cluster: 'devnet' });
        await client.connect(wallet);

        this._client = client;
        this._wallet = wallet;

        // Get stealth meta-address (the "receive address" to share)
        const metaAddr = wallet.stealthMetaAddress?.encoded || '';

        // Save meta-address
        saveWalletState({ metaAddress: metaAddr });

        this.session = {
          id: 'specter-' + (wallet.publicKey?.toBase58() || 'unknown').slice(0, 8),
          stealthMetaAddress: metaAddr,
          pubkey: wallet.publicKey?.toBase58() || '',
          wallet: wallet,
          client: client,
          startedAt: Date.now(),
        };
        this.state = 'ACTIVE';

        return {
          stealthMetaAddress: metaAddr,
          pubkey: this.session.pubkey,
          sessionId: this.session.id,
          expiresAt: Math.floor(Date.now() / 1000) + 86400,
        };
      } catch (err) {
        this._wipeLocalState();
        this.state = 'OFF';
        throw err;
      }
    }

    // Scan for incoming stealth payments.
    async scanPayments() {
      if (!this._client || !this._wallet) throw new VantaError('No active session', 'invalid_state');
      const Specter = getSpecter();
      try {
        const payments = await Specter.scanForPayments({
          connection: this._client.connection,
          viewingPrivateKey: this._wallet.viewingPrivateKey,
          spendingPubKey: this._wallet.publicKey,
        });
        return payments || [];
      } catch { return []; }
    }

    // Claim a stealth payment — moves funds to your main wallet.
    async claimPayment(payment) {
      if (!this._client || !this._wallet) throw new VantaError('No active session', 'invalid_state');
      const Specter = getSpecter();
      const sig = await Specter.claimStealth({
        connection: this._client.connection,
        payment,
        spendingPubKey: this._wallet.publicKey,
        viewingPrivateKey: this._wallet.viewingPrivateKey,
        destination: this._wallet.publicKey,
      });
      return sig;
    }

    // Send a private transfer via stealth address.
    async sendPrivate(recipientMetaAddress, amountSol) {
      if (!this._client || !this._wallet) throw new VantaError('No active session', 'invalid_state');
      const Specter = getSpecter();
      const sig = await Specter.sendPrivate({
        sender: this._wallet.keypair || this._wallet,
        connection: this._client.connection,
        recipient: recipientMetaAddress,
        amount: amountSol,
        privacyOptions: { level: 'enhanced' },
      });
      return sig;
    }

    // Get stealth balance (funds in stealth accounts).
    async getStealthBalance() {
      if (!this._client || !this._wallet) return 0;
      const Specter = getSpecter();
      try {
        const bal = await Specter.getStealthBalance(this._client.connection, this._wallet.publicKey);
        return Number(bal || 0n) / 1e9;
      } catch { return 0; }
    }

    // Sign bytes (for backward compat with chain layer).
    async signSessionBytes(wireBytes) {
      if (!this._wallet) throw new VantaError('No active session', 'invalid_state');
      const web3 = getWeb3();
      const kp = this._wallet.keypair;
      if (!kp) throw new VantaError('No signing keypair', 'invalid_state');
      return root.nacl.sign.detached(wireBytes, kp.secretKey);
    }

    async shieldOff() {
      this._wipeLocalState();
      this.state = 'OFF';
      return { revoked: false };
    }

    _wipeLocalState() {
      this._client = null;
      this._wallet = null;
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
  }

  root.VantaEngine = { VantaSessionEngine, VantaError, b58encode: root.SpecterSDK?.toBase58 || ((b) => ''), b58decode: root.SpecterSDK?.fromBase58 || ((s) => new Uint8Array(0)) };
  root.VantaSessionEngine = VantaSessionEngine;
  root.VantaError = VantaError;
})(typeof window !== 'undefined' ? window : globalThis);
