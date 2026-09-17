'use strict';

// VANTA chain ops — BROWSER build.
//
// Money pipeline for a self-funded session key (the session wallet holds
// lamports and pays its own fees). Honest scope, per the build brief:
//
//   topUp()     — main wallet funds the session wallet (extension-signed tx).
//                 The relayer is NEVER a party to this transfer.
//   sendSol()   — session key signs and sends SOL. The recipient and any block
//                 explorer see only the session pubkey: fee-payer and sole
//                 signer = session key. The main wallet is absent.
//   sendSpl()   — same for SPL tokens (USDC). Destination ATA is created and
//                 paid for by the session wallet when it doesn't exist yet.
//   sweepBack() — kill-switch companion: the session key returns its remaining
//                 balance to the main wallet, then the engine wipes the key.
//                 Optional and consent-based; the plain kill-switch still
//                 wipes the key immediately (relayer TTL is the backstop).
//
// No main-wallet secret is ever held here: main-wallet ops are signed by the
// extension provider; session ops via the engine's session signer hook.

(function attach(root) {
  const SOLANA_RPC = root.VANTA_SOLANA_RPC || 'https://api.devnet.solana.com';
  const TX_FEE_LAMPORTS = 5000n;

  // ————— base58 (same alphabet/rules as web/vanta-engine.js) —————
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

  // ————— SPL / ATA helpers (no @solana/spl-token dependency) —————
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

  // ————— public API —————
  const VantaChain = {
    // Circle's official devnet USDC mint.
    USDC: {
      mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
      decimals: 6,
    },

    async getSolBalance(pubkeyStr) {
      const w3 = await loadWeb3();
      const c = await conn();
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
        return 0; // no ATA yet — balance is zero
      }
    },

    // Main wallet → session wallet. The extension signs; Vanta never touches
    // the main key. Uses signAndSendTransaction when available (Phantom,
    // Backpack, Solflare all support it), falls back to sign + manual send.
    async topUp({ mainProvider, mainPubkey, sessionPubkey, amountSol }) {
      const w3 = await loadWeb3();
      const c = await conn();
      const from = new w3.PublicKey(mainPubkey);
      const to = new w3.PublicKey(sessionPubkey);
      const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash();
      const lamports = BigInt(Math.round(amountSol * 1e9));
      const tx = new w3.Transaction().add(
        w3.SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports }),
      );
      tx.feePayer = from;
      tx.recentBlockhash = blockhash;

      if (typeof mainProvider.signAndSendTransaction === 'function') {
        const { signature } = await mainProvider.signAndSendTransaction(tx);
        await c.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
        return signature;
      }
      // Fallback: signTransaction + manual send.
      const signed = await mainProvider.signTransaction(tx);
      const raw = signed.serialize();
      const signature = await c.sendRawTransaction(raw);
      await c.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      return signature;
    },

    // Session key → anywhere. The ONLY tx shape a counterparty ever sees:
    // fee-payer and sole signer = session key. Main wallet: absent.
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

      const wire = tx.serializeMessage(); // unsigned wire message bytes
      const sigBytes = await sessionSigner(wire);
      tx.addSignature(from, sigBytes);
      const raw = tx.serialize();
      const signature = await c.sendRawTransaction(raw);
      await c.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      return signature;
    },

    // Session key → anywhere, SPL token (USDC).
    async sendSpl({ sessionSigner, sessionPubkey, to, amount, decimals, memo }) {
      const w3 = await loadWeb3();
      const c = await conn();
      const owner = new w3.PublicKey(sessionPubkey);
      const mint = new w3.PublicKey(this.USDC.mint);
      const dec = decimals === undefined ? this.USDC.decimals : decimals;
      const sourceAta = await getAta(mint, owner);
      const destOwner = new w3.PublicKey(to);
      const destinationAta = await getAta(mint, destOwner);
      const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash();

      const tx = new w3.Transaction();
      if (memo) {
        tx.add(new w3.TransactionInstruction({
          programId: new w3.PublicKey(MEMO_PROGRAM_ID_STR),
          keys: [],
          data: utf8(memo),
        }));
      }

      // Create the destination ATA if missing — funded by the SESSION wallet.
      const destInfo = await c.getAccountInfo(destinationAta);
      if (!destInfo) {
        tx.add(new w3.TransactionInstruction({
          programId: new w3.PublicKey(ATA_PROGRAM_ID_STR),
          keys: [
            { pubkey: owner, isSigner: true, isWritable: true },      // payer
            { pubkey: destinationAta, isSigner: false, isWritable: true },
            { pubkey: destOwner, isSigner: false, isWritable: false },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: w3.SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: new w3.PublicKey(TOKEN_PROGRAM_ID_STR), isSigner: false, isWritable: false },
          ],
        }));
      }

      // SPL Token transferChecked (instruction 12): amount u64 LE + decimals u8.
      const amountRaw = BigInt(Math.round(amount * 10 ** dec));
      const data = new Uint8Array(10);
      data[0] = 12;
      for (let i = 0; i < 8; i++) data[1 + i] = Number((amountRaw >> BigInt(8 * i)) & 0xffn);
      tx.add(new w3.TransactionInstruction({
        programId: new w3.PublicKey(TOKEN_PROGRAM_ID_STR),
        keys: [
          { pubkey: sourceAta, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: destinationAta, isSigner: false, isWritable: true },
          { pubkey: owner, isSigner: true, isWritable: false },
        ],
        data,
      }));

      tx.feePayer = owner;
      tx.recentBlockhash = blockhash;

      const wire = tx.serializeMessage();
      const sigBytes = await sessionSigner(wire);
      tx.addSignature(owner, sigBytes);
      const raw = tx.serialize();
      const signature = await c.sendRawTransaction(raw);
      await c.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      return signature;
    },

    // Session wallet → main wallet: the kill-switch sweep. Signed by the
    // session key; funds and fee both come out of the session balance.
    // Returns the signature, or null when there's nothing worth sweeping.
    async sweepBack({ sessionSigner, sessionPubkey, mainPubkey }) {
      const w3 = await loadWeb3();
      const c = await conn();
      const from = new w3.PublicKey(sessionPubkey);
      const to = new w3.PublicKey(mainPubkey);
      const bal = BigInt(await c.getBalance(from)); // BigInt: fee math below is BigInt
      if (bal <= TX_FEE_LAMPORTS) return null; // nothing (or not enough) to sweep
      const lamports = bal - TX_FEE_LAMPORTS;
      const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash();
      const tx = new w3.Transaction().add(
        w3.SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports }),
      );
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

    // Airdrop (devnet only) — demo funding helper.
    async requestAirdrop(pubkeyStr, sol = 1) {
      const w3 = await loadWeb3();
      const c = await conn();
      const sig = await c.requestAirdrop(new w3.PublicKey(pubkeyStr), Math.round(sol * 1e9));
      return sig;
    },
  };

  // Shared b58 for the page (pubkey display etc).
  VantaChain.b58encode = b58encode;
  VantaChain.b58decodeExact = b58decodeExact;

  root.VantaChain = VantaChain;
})(typeof window !== 'undefined' ? window : globalThis);
