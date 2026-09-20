'use strict';

// VANTA chain ops — vault + relay model.
//
// vault → relay → recipient  (send: recipient sees relay, not vault)
// external → relay → vault   (receive: auto-sweep relay to vault)

(function attach(root) {
  const SOLANA_RPC = root.VANTA_SOLANA_RPC || 'https://api.devnet.solana.com';
  const TX_FEE_LAMPORTS = 5000n;

  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58encode(bytes) {
    let num = 0n;
    for (const b of new Uint8Array(bytes)) num = num * 256n + BigInt(b);
    let out = '';
    while (num > 0n) {
      out = B58[Number(num % 58n)] + out;
      num /= 58n;
    }
    for (const b of new Uint8Array(bytes)) {
      if (b !== 0) break;
      out = '1' + out;
    }
    return out || '1';
  }
  function b58decodeExact(str, len) {
    let num = 0n;
    for (const c of str) {
      const idx = B58.indexOf(c);
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
    while (out.length < len) out.unshift(0);
    if (out.length !== len) throw new Error('base58 value does not fit ' + len + ' bytes');
    return new Uint8Array(out);
  }

  function utf8(str) { return new TextEncoder().encode(str); }

  // ————— web3.js loader (CDN IIFE, no build step) —————
  let web3Promise = null;
  function loadWeb3() {
    if (root.solanaWeb3) return Promise.resolve(root.solanaWeb3);
    if (web3Promise) return web3Promise;
    web3Promise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@solana/web3.js@1.95.8/lib/index.iife.min.js';
      s.onload = () => (root.solanaWeb3 ? resolve(root.solanaWeb3) : reject(new Error('web3.js loaded but global missing')));
      s.onerror = () => reject(new Error('Failed to load @solana/web3.js from CDN'));
      document.head.appendChild(s);
    });
    return web3Promise;
  }

  async function conn() {
    const w3 = await loadWeb3();
    return new w3.Connection(SOLANA_RPC, 'confirmed');
  }

  const TOKEN_PROGRAM_ID_STR = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  const ATA_PROGRAM_ID_STR = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
  const MEMO_PROGRAM_ID_STR = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

  async function getAta(mintKey, ownerKey) {
    const w3 = await loadWeb3();
    const TOKEN_PROGRAM = new w3.PublicKey(TOKEN_PROGRAM_ID_STR);
    const ATA_PROGRAM = new w3.PublicKey(ATA_PROGRAM_ID_STR);
    return (
      await w3.PublicKey.findProgramAddress(
        [ownerKey.toBuffer(), TOKEN_PROGRAM.toBuffer(), mintKey.toBuffer()],
        ATA_PROGRAM,
      )
    )[0];
  }

  // Build and sign a single transfer, return signature.
  async function transferSol({ signer, fromPubkey, toPubkey, lamports }) {
    const w3 = await loadWeb3();
    const c = await conn();
    const from = new w3.PublicKey(fromPubkey);
    const to = new w3.PublicKey(toPubkey);
    const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash();
    const tx = new w3.Transaction().add(
      w3.SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports }),
    );
    tx.feePayer = from;
    tx.recentBlockhash = blockhash;
    const wire = tx.serializeMessage();
    const sigBytes = await signer(wire);
    tx.addSignature(from, sigBytes);
    const raw = tx.serialize();
    const signature = await c.sendRawTransaction(raw);
    await c.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    return signature;
  }

  const VantaChain = {
    USDC: {
      mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
      decimals: 6,
    },

    async getSolBalance(pubkeyStr) {
      const c = await conn();
      const w3 = await loadWeb3();
      const lamports = await c.getBalance(new w3.PublicKey(pubkeyStr));
      return Number(lamports) / 1e9;
    },

    async getUsdcBalance(pubkeyStr) {
      const w3 = await loadWeb3();
      const ata = await getAta(new w3.PublicKey(this.USDC.mint), new w3.PublicKey(pubkeyStr));
      const c = await conn();
      try {
        const info = await c.getTokenAccountBalance(ata);
        return info.value.uiAmount || 0;
      } catch {
        return 0;
      }
    },

    // Two-hop send: vault → relay → recipient.
    // Recipient sees relay as sender. Vault is hidden.
    async sendViaRelay({ vaultSigner, vaultPubkey, relaySigner, relayPubkey, to, amountSol }) {
      const w3 = await loadWeb3();
      const c = await conn();
      const totalLamports = BigInt(Math.round(amountSol * 1e9));
      const feeLamports = 5000n;

      // Step 1: vault → relay (fund relay with amount + fee for the relay tx)
      const rentBuffer = 890880n;
      const vaultToRelay = totalLamports + feeLamports + rentBuffer;
      await transferSol({
        signer: vaultSigner,
        fromPubkey: vaultPubkey,
        toPubkey: relayPubkey,
        lamports: vaultToRelay,
      });

      // Step 2: relay → recipient
      const sig = await transferSol({
        signer: relaySigner,
        fromPubkey: relayPubkey,
        toPubkey: to,
        lamports: totalLamports,
      });

      return sig;
    },

    // Simple single-hop send (from any key to any address).
    async sendSol({ sessionSigner, sessionPubkey, to, amountSol, memo }) {
      const w3 = await loadWeb3();
      const c = await conn();
      const from = new w3.PublicKey(sessionPubkey);
      const toKey = new w3.PublicKey(to);
      const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash();
      const lamports = BigInt(Math.round(amountSol * 1e9));
      const tx = new w3.Transaction();
      if (memo) {
        tx.add(new w3.TransactionInstruction({
          programId: new w3.PublicKey(MEMO_PROGRAM_ID_STR),
          keys: [],
          data: utf8(memo),
        }));
      }
      tx.add(w3.SystemProgram.transfer({ fromPubkey: from, toPubkey: toKey, lamports }));
      tx.feePayer = from;
      tx.recentBlockhash = blockhash;
      const wire = tx.serializeMessage();
      const sigBytes = await sessionSigner(wire);
      tx.addSignature(from, sigBytes);
      const raw = tx.serialize();
      const signature = await c.sendRawTransaction(raw);
      await c.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      return signature;
    },

    // Sweep: relay → vault (all remaining funds minus fee).
    async sweepRelayToVault({ relaySigner, relayPubkey, vaultPubkey }) {
      const c = await conn();
      const w3 = await loadWeb3();
      const bal = BigInt(await c.getBalance(new w3.PublicKey(relayPubkey)));
      if (bal <= TX_FEE_LAMPORTS) return null;
      const lamports = bal - TX_FEE_LAMPORTS;
      const sig = await transferSol({
        signer: relaySigner,
        fromPubkey: relayPubkey,
        toPubkey: vaultPubkey,
        lamports,
      });
      return sig;
    },

    async requestAirdrop(pubkeyStr, sol = 1) {
      const c = await conn();
      const w3 = await loadWeb3();
      const sig = await c.requestAirdrop(new w3.PublicKey(pubkeyStr), Math.round(sol * 1e9));
      return sig;
    },
  };

  VantaChain.b58encode = b58encode;
  VantaChain.b58decodeExact = b58decodeExact;

  root.VantaChain = VantaChain;
})(typeof window !== 'undefined' ? window : globalThis);
