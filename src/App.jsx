import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

// ── Helius Privacy Rings (zolana) config ─────────────────────────────
// PASTE YOUR HELIUS DEVNET KEY HERE (free at dashboard.helius.dev)
const HELIUS_API_KEY = 'REDACTED_HELIUS_KEY'
const RPC_URL = `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
const RPC_WSS = `wss://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
const INDEXER_URL = 'https://d2xah7tnhdhcom.cloudfront.net'
const PROVER_URL = 'https://d21ni15goiip6l.cloudfront.net'
// Legacy public devnet RPC for plain SOL send + airdrop fallback
const PUBLIC_RPC = 'https://api.devnet.solana.com'
// Privacy relayer — hides user wallet as fee payer on all Zolana txs
const RELAYER_URL = 'http://localhost:3001'

// ── Token constants ──────────────────────────────────────────────────
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const DUSDC_MINT = '4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7'
const TOKENS = {
  SOL: { mint: SOL_MINT, symbol: 'SOL', decimals: 9, color: 'text-purple-400' },
  dUSDC: { mint: DUSDC_MINT, symbol: 'dUSDC', decimals: 6, color: 'text-emerald-400' },
}

export default function App() {
  const [wallet, setWallet] = useState(null)
  const [balance, setBalance] = useState(0)
  const [privateBalances, setPrivateBalances] = useState([])
  const [isPrivacyOn, setIsPrivacyOn] = useState(false)
  const [isPrivateMode, setIsPrivateMode] = useState(true) // default ON: shadow send
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [transactions, setTransactions] = useState([])
  const [zolanaReady, setZolanaReady] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [selectedToken, setSelectedToken] = useState('SOL') // SOL or dUSDC

  const clientRef = useRef(null)
  const keysRef = useRef(null)
  const walletRef = useRef(null) // zolana Wallet (UTXO state)
  const signerRef = useRef(null)
  const shieldedKeypairRef = useRef(null)
  const relayerAddressRef = useRef(null) // relayer fee payer address

  // ============================================================
  // ZOLANA CORE — client, keys, wallet persistence
  // ============================================================
  const lzStore = {
    load: async () => localStorage.getItem('vanta-zwallet') || undefined,
    save: async (snapshot) => localStorage.setItem('vanta-zwallet', snapshot),
  }

  // ── Relay: ordered slots + sig-or-null, relayer fills ONLY its own slots ──
  // v1 wire layout (kit v8): [messageBytes][sig slot0][sig slot1]...
  // Slot order = required-signer order from the compiled tx (fee payer first).
  // Zolana ZK txs authorize via ZK proof — only the fee payer must sign.
  const relayTx = useCallback(async (kit, client, compiledTx, userSigners = []) => {
    try {
      // Zolana's build*Transaction returns an ALREADY-COMPILED tx:
      // { messageBytes: Uint8Array, signatures: { [addr]: sig|null } }
      // userSigners: [{ address, seed: Uint8Array(32) }, ...] — raw seeds the USER owns
      // ZK proof authorizes the transfer; only fee payer (relayer) + user owner slots sign.
      const { ed25519 } = await import('@noble/curves/ed25519.js')
      const messageBytes = new Uint8Array(compiledTx.messageBytes)

      const slots = Object.entries(compiledTx.signatures).map(([addr, sig]) => ({
        addr,
        sig: null,
      }))

      // User signs their own slots directly (client-side ed25519)
      const seedByAddr = new Map(userSigners.map(s => [s.address, s.seed]))
      for (const slot of slots) {
        const seed = seedByAddr.get(slot.addr)
        if (seed) {
          slot.sig = btoa(String.fromCharCode(...ed25519.sign(messageBytes, seed)))
        }
      }

      const res = await fetch(`${RELAYER_URL}/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: btoa(String.fromCharCode(...messageBytes)),
          slots,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Relay failed')
      return data.signature
    } catch (err) {
      console.error('Relay failed:', err.message)
      throw err
    }
  }, [])

  // ── Keep X's fee float topped up (relayer-funded, NEVER the user wallet) ──
  const ensureXFloat = useCallback(async () => {
    const { Connection, PublicKey } = await import('@solana/web3.js')
    const conn = new Connection(PUBLIC_RPC, 'confirmed')
    const bal = await conn.getBalance(new PublicKey(signerRef.current.address))
    if (bal >= 2_000_000) return // >= 0.002 SOL
    setStatus('Topping up privacy fees (relayer)...')
    const res = await fetch(`${RELAYER_URL}/fund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: signerRef.current.address, amount: 0.01 }),
    }).then(r => r.json())
    if (!res.ok) throw new Error('Relayer could not fund session fees: ' + res.error)
    console.log('session float funded:', res.signature)
  }, [])

  // ── X signs & submits its own spends (owner == fee payer, SDK-native) ──
  const xSubmit = useCallback(async (kit, client, tx) => {
    const sendAndConfirm = kit.sendAndConfirmTransactionFactory({
      rpc: client.solanaRpc,
      rpcSubscriptions: client.solanaRpcSubscriptions,
    })
    const signed = await kit.signTransactionWithSigners([signerRef.current], tx)
    await sendAndConfirm(signed, { commitment: 'confirmed' })
    return kit.getSignatureFromTransaction(signed)
  }, [])

  const refreshPrivateBalances = useCallback(() => {
    try {
      const w = walletRef.current
      if (!w) return
      const bals = w.balances().map(b => {
        const meta = Object.values(TOKENS).find(t => t.mint === b.mint)
        return {
          mint: b.mint,
          symbol: meta?.symbol ?? (b.mint === SOL_MINT ? 'SOL' : 'token'),
          amount: Number(b.amount) / 10 ** (meta?.decimals ?? 9),
        }
      })
      setPrivateBalances(bals)
    } catch (err) {
      console.error('balance read error:', err)
    }
  }, [])

  const initZolana = useCallback(async (walletData) => {
    try {
      setStatus('Initializing privacy engine...')
      const zk = await import('@heliuslabs/zolana')
      const kit = await import('@solana/kit')

      const client = await zk.createZolanaClient({
        solanaRpcUrl: RPC_URL,
        solanaRpcSubscriptionsUrl: RPC_WSS,
        indexerUrl: INDEXER_URL,
        proverUrl: PROVER_URL,
      })
      clientRef.current = client
      setZolanaReady(true)

      // ── Ephemeral privacy identity X ──
      // SDK invariant: UTXO owner == fee payer (relayer path unsupported).
      // So X owns the private balance AND pays fees. X is funded by the relayer,
      // never by the user wallet → the user appears ONLY at the deposit on-ramp.
      let xData = JSON.parse(localStorage.getItem('vanta-ephemeral') || 'null')
      if (!xData) {
        const { Keypair } = await import('@solana/web3.js')
        const kp = Keypair.generate()
        xData = { publicKey: kp.publicKey.toBase58(), secretKey: Array.from(kp.secretKey) }
        localStorage.setItem('vanta-ephemeral', JSON.stringify(xData))
        console.log('created ephemeral privacy identity X:', xData.publicKey)
      }

      // Preserve the legacy user-keyed snapshot once (0.1 shielded SOL recoverable there)
      if (localStorage.getItem('vanta-zwallet') && !localStorage.getItem('vanta-ephemeral-migrated')) {
        localStorage.setItem('vanta-zwallet-legacy', localStorage.getItem('vanta-zwallet'))
        localStorage.removeItem('vanta-zwallet') // clear old snapshot so new cipher doesn't try to decrypt stale data
        localStorage.setItem('vanta-ephemeral-migrated', '1')
        console.log('legacy user-keyed snapshot preserved (vanta-zwallet-legacy); old store cleared')
      }

      const xSeed = new Uint8Array(xData.secretKey.slice(0, 32))
      const xSigningKey = zk.SigningKey.fromEd25519Bytes(xSeed)
      const keypair = zk.ShieldedKeypair.fromKeypair(xSigningKey)
      shieldedKeypairRef.current = keypair

      const signer = await kit.createKeyPairSignerFromPrivateKeyBytes(
        new Uint8Array(xData.secretKey.slice(0, 32)),
      )
      signerRef.current = signer

      // Relayer still pays deposit on-ramp gas
      try {
        const relayerData = await fetch(`${RELAYER_URL}/address`).then(r => r.json())
        if (relayerData.address) {
          relayerAddressRef.current = relayerData.address
          console.log('Relayer (deposit gas):', relayerData.address)
        }
      } catch (e) {
        console.warn('Relayer unavailable:', e.message)
      }

      const keys = zk.LocalKeys.fromKeypair(keypair, client.proofService)
      keysRef.current = keys

      // Restore X's persisted private state (encrypted snapshot) or create new
      const cipher = zk.walletSnapshotCipher(keypair)
      let restored = null
      try {
        restored = await zk.loadPersistedWallet({ store: lzStore, cipher })
      } catch (e) {
        console.warn('Could not restore wallet snapshot, starting fresh:', e.message)
      }
      walletRef.current = restored ?? new zk.Wallet({ identity: keypair.shieldedAddress() })

      // ── Fund X's fee float via relayer, then X registers itself ──
      await ensureXFloat()

      const reg = await zk.buildRegistrationTransaction({
        client,
        owner: signer.address,
        address: keypair.shieldedAddress(),
        feePayer: signer.address, // X pays its own registration fee
      })
      if (reg !== undefined) {
        setStatus('Registering privacy identity...')
        const regSig = await xSubmit(kit, client, reg)
        console.log('registered X:', regSig)
        setRegistered(true)
      } else {
        setRegistered(true)
      }

      refreshPrivateBalances()
      setStatus('Privacy engine ready 🛡️')
      setTimeout(() => setStatus(''), 2500)
    } catch (err) {
      console.error('zolana init error:', err)
      setStatus('Privacy init failed: ' + (err?.message || err))
      throw err
    }
  }, [refreshPrivateBalances])

  // ============================================================
  // WALLET CORE (localStorage)
  // ============================================================
  const createWallet = useCallback(async () => {
    setLoading(true)
    setStatus('Generating wallet...')
    try {
      const { Keypair } = await import('@solana/web3.js')
      const keypair = Keypair.generate()
      const data = { publicKey: keypair.publicKey.toBase58(), secretKey: Array.from(keypair.secretKey) }
      localStorage.setItem('vanta-wallet', JSON.stringify(data))
      setWallet(data)
      setStatus('Wallet created!')
      await fetchBalance(data.publicKey)
      await initZolana(data)
    } catch (err) {
      setStatus('Error: ' + err.message)
    }
    setLoading(false)
  }, [initZolana])

  const fetchBalance = useCallback(async (pubKey) => {
    try {
      const { Connection, PublicKey } = await import('@solana/web3.js')
      const conn = new Connection(PUBLIC_RPC, 'confirmed')
      const bal = await conn.getBalance(new PublicKey(pubKey))
      setBalance(bal / 1e9)
    } catch (err) {
      console.error('Balance error:', err)
    }
  }, [])

  const requestAirdrop = useCallback(async () => {
    if (!wallet) return
    setLoading(true)
    setStatus('Requesting airdrop...')
    try {
      const { Connection, PublicKey } = await import('@solana/web3.js')
      const conn = new Connection(PUBLIC_RPC, 'confirmed')
      const sig = await conn.requestAirdrop(new PublicKey(wallet.publicKey), 1e9)
      await conn.confirmTransaction(sig, 'confirmed')
      await fetchBalance(wallet.publicKey)
      setStatus('Airdropped 1 SOL!')
    } catch (err) {
      setStatus('Airdrop failed: ' + err.message)
    }
    setLoading(false)
  }, [wallet, fetchBalance])

  // ============================================================
  // SHIELD — public → private balance (the front door)
  // Supports SOL and dUSDC (full-shield mode)
  // ============================================================
  const shield = useCallback(async (amount, token = 'SOL') => {
    const zk = await import('@heliuslabs/zolana')
    const kit = await import('@solana/kit')
    const client = clientRef.current
    const tokenInfo = TOKENS[token]
    const decimals = tokenInfo.decimals
    const rawAmount = BigInt(Math.round(amount * 10 ** decimals))
    setStatus(`🛡️ Shielding ${amount} ${tokenInfo.symbol}...`)

    const depositParams = {
      client,
      feePayer: relayerAddressRef.current,
      depositor: wallet.publicKey,
      recipient: shieldedKeypairRef.current.shieldedAddress(),
      amount: rawAmount,
    }

    // SPL token: pass mint + source ATA
    if (token !== 'SOL') {
      depositParams.asset = tokenInfo.mint
      const { Connection, PublicKey } = await import('@solana/web3.js')
      const { getAssociatedTokenAddress } = await import('@solana/spl-token')
      const conn = new Connection(PUBLIC_RPC, 'confirmed')
      const ata = await getAssociatedTokenAddress(
        new PublicKey(tokenInfo.mint),
        new PublicKey(wallet.publicKey),
      )
      depositParams.splTokenAccount = ata.toBase58()
    }

    const deposit = await zk.buildDepositTransaction(depositParams)
    const sig = await relayTx(kit, client, deposit, [
      { address: wallet.publicKey, seed: new Uint8Array(wallet.secretKey.slice(0, 32)) },
    ])
    const slot = await client.confirmTransaction(sig)
    await zk.syncWallet({
      client, wallet: walletRef.current, keys: keysRef.current, config: { requireSlot: slot },
    })
    await zk.syncPersistedWallet({
      client, wallet: walletRef.current, keys: keysRef.current, store: lzStore,
      cipher: zk.walletSnapshotCipher(shieldedKeypairRef.current),
    })
    refreshPrivateBalances()
    await fetchBalance(wallet.publicKey)
    return sig
  }, [wallet, fetchBalance, refreshPrivateBalances])

  // ============================================================
  // SHADOW SEND — private → private (Vanta to Vanta)
  // Recipient must be registered (any Vanta user is, automatically)
  // ============================================================
  const shadowSend = useCallback(async (recipient, amount, token = 'SOL') => {
    const zk = await import('@heliuslabs/zolana')
    const kit = await import('@solana/kit')
    const client = clientRef.current
    const tokenInfo = TOKENS[token]
    const decimals = tokenInfo.decimals
    setStatus('🕳️ Building shadow transfer (ZK proof)...')
    await ensureXFloat()
    const transferParams = {
      client,
      wallet: walletRef.current,
      keys: keysRef.current,
      feePayer: signerRef.current.address, // X owns the UTXOs and pays — SDK invariant
      recipient, // plain Solana address; SDK resolves via on-chain registry
      amount: BigInt(Math.round(amount * 10 ** decimals)),
    }
    if (token !== 'SOL') transferParams.asset = tokenInfo.mint
    const transfer = await zk.buildTransferTransaction(transferParams)
    const sig = await xSubmit(kit, client, transfer)
    const slot = await client.confirmTransaction(sig)
    await zk.syncWallet({
      client, wallet: walletRef.current, keys: keysRef.current, config: { requireSlot: slot },
    })
    await zk.syncPersistedWallet({
      client, wallet: walletRef.current, keys: keysRef.current, store: lzStore,
      cipher: zk.walletSnapshotCipher(shieldedKeypairRef.current),
    })
    refreshPrivateBalances()
    return sig
  }, [refreshPrivateBalances])

  // ============================================================
  // GHOST SEND — private → any public wallet (Vanta to anyone)
  // Recipient does NOTHING. Funds arrive FROM THE POOL.
  // ============================================================
  const ghostSend = useCallback(async (recipient, amount, token = 'SOL') => {
    const zk = await import('@heliuslabs/zolana')
    const kit = await import('@solana/kit')
    const client = clientRef.current
    const tokenInfo = TOKENS[token]
    const decimals = tokenInfo.decimals
    setStatus('👻 Building ghost withdrawal (ZK proof)...')
    await ensureXFloat()
    const withdrawalParams = {
      client,
      wallet: walletRef.current,
      keys: keysRef.current,
      feePayer: signerRef.current.address, // X owns the UTXOs and pays — SDK invariant
      recipient,
      amount: BigInt(Math.round(amount * 10 ** decimals)),
    }
    if (token !== 'SOL') withdrawalParams.asset = tokenInfo.mint
    const withdrawal = await zk.buildWithdrawalTransaction(withdrawalParams)
    const sig = await xSubmit(kit, client, withdrawal)
    const slot = await client.confirmTransaction(sig)
    await zk.syncWallet({
      client, wallet: walletRef.current, keys: keysRef.current, config: { requireSlot: slot },
    })
    await zk.syncPersistedWallet({
      client, wallet: walletRef.current, keys: keysRef.current, store: lzStore,
      cipher: zk.walletSnapshotCipher(shieldedKeypairRef.current),
    })
    refreshPrivateBalances()
    return sig
  }, [refreshPrivateBalances])

  // ============================================================
  // PLAIN SEND — public SOL transfer
  // ============================================================
  const sendSol = useCallback(async (recipient, amount) => {
    const { Keypair, Connection, Transaction, SystemProgram, PublicKey } = await import('@solana/web3.js')
    const kp = Keypair.fromSecretKey(new Uint8Array(wallet.secretKey))
    const conn = new Connection(PUBLIC_RPC, 'confirmed')
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey: new PublicKey(recipient),
        lamports: Math.round(amount * 1e9),
      }),
    )
    const sig = await conn.sendTransaction(tx, [kp])
    await conn.confirmTransaction(sig, 'confirmed')
    await fetchBalance(kp.publicKey.toBase58())
    return sig
  }, [wallet, fetchBalance])

  // ============================================================
  // INIT
  // ============================================================
  useEffect(() => {
    const saved = localStorage.getItem('vanta-wallet')
    if (saved) {
      const data = JSON.parse(saved)
      setWallet(data)
      fetchBalance(data.publicKey)
      initZolana(data).catch(() => {})
    }
  }, [fetchBalance, initZolana])

  // ============================================================
  // HELPERS
  // ============================================================
  const addTxn = (title, amount, type, isPrivate) => {
    setTransactions(prev => [{ title, amount, type, isPrivate, time: new Date().toLocaleTimeString() }, ...prev])
  }
  const formatAddr = (addr) => addr ? addr.slice(0, 4) + '...' + addr.slice(-4) : ''
  const tokenBalance = (token) => {
    const info = TOKENS[token]
    return privateBalances.find(b => b.mint === info.mint)?.amount ?? 0
  }
  const solBalance = tokenBalance('SOL')

  // ============================================================
  // ONBOARDING
  // ============================================================
  if (!wallet) {
    return (
      <div className="w-full max-w-[440px] min-h-screen bg-black flex flex-col items-center justify-center px-6 mx-auto">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#5B41F4] to-[#7c5cff] flex items-center justify-center shadow-2xl shadow-purple-500/30">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Vanta</h1>
            <p className="text-sm text-gray-400 mt-2 max-w-[280px]">Privacy-first Solana wallet powered by ZK shielded pools. Shadow-send Vanta to Vanta. Ghost-send to anyone.</p>
          </div>
          <button onClick={createWallet} disabled={loading} className="w-full max-w-[300px] py-4 rounded-2xl bg-[#5B41F4] hover:bg-[#4d33e6] font-bold text-white shadow-lg shadow-purple-500/30 active:scale-[0.98] transition-all text-base disabled:opacity-50">
            {loading ? 'Creating...' : 'Create New Wallet'}
          </button>
          {status && <p className="text-xs text-gray-500">{status}</p>}
        </div>
      </div>
    )
  }

  // ============================================================
  // MAIN UI
  // ============================================================
  return (
    <div className="w-full max-w-[440px] min-h-screen bg-black flex flex-col justify-between relative px-4 pt-5 pb-8 overflow-x-hidden mx-auto">

      {/* TOAST */}
      {status && (
        <div className="fixed top-5 z-[100] max-w-[380px] w-[90%] bg-[#1c1f2e] border border-white/20 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 toast-anim">
          <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm shrink-0">
            {isPrivateMode ? '🕳️' : '✓'}
          </div>
          <span className="text-xs font-medium text-gray-200">{status}</span>
        </div>
      )}

      {/* HEADER */}
      <header className="w-full flex items-center justify-between py-1 px-1 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#5B41F4] to-[#7c5cff] flex items-center justify-center text-white font-bold text-lg border border-white/15 shadow-md">V</div>
            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-black rounded-full shadow-sm"></span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-gray-400 tracking-tight leading-tight uppercase">Privacy Wallet</span>
            <span className="text-[16px] font-bold text-white tracking-tight leading-tight">Vanta</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={requestAirdrop} disabled={loading} className="w-10 h-10 rounded-full bg-[#13151f] border border-white/10 flex items-center justify-center text-gray-300 hover:text-white hover:bg-[#1a1d2c] active:scale-90 transition-all shadow-sm" title="Airdrop 1 SOL">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          </button>
        </div>
      </header>

      <main className="w-full flex-1 flex flex-col gap-4">

        {/* BALANCE CARD */}
        <div className="w-full rounded-[28px] overflow-hidden bg-[#0d0f17] border border-white/10 shadow-2xl flex flex-col transition-all duration-300 hover:border-purple-500/40 card-glow">
          <div className="relative w-full p-6 pb-7 min-h-[165px] flex flex-col justify-between overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-[#0d0f17] to-purple-800/30 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60 pointer-events-none" />

            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-purple-200/90 tracking-wide uppercase">Private Balance</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/30 border border-purple-400/30 text-purple-200">ZK</span>
              </div>
              <button onClick={() => setIsPrivacyOn(!isPrivacyOn)} className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md border border-white/15 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 active:scale-90 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              </button>
            </div>

            <div className="relative z-10 mt-3">
              <div className={`blur-rollup text-[38px] font-extrabold text-white tracking-tight leading-none drop-shadow-lg ${isPrivacyOn ? 'balance-masked' : ''}`}>
                {tokenBalance(selectedToken).toFixed(selectedToken === 'SOL' ? 4 : 2)} {TOKENS[selectedToken].symbol}
              </div>
              <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-2">
                <button onClick={() => setSelectedToken('SOL')} className={selectedToken === 'SOL' ? 'text-white font-semibold' : 'hover:text-gray-300'}>SOL</button>
                <span className="text-gray-600">/</span>
                <button onClick={() => setSelectedToken('dUSDC')} className={selectedToken === 'dUSDC' ? 'text-white font-semibold' : 'hover:text-gray-300'}>dUSDC</button>
                <span className="text-gray-600">|</span>
                <span>Public: {balance.toFixed(4)} SOL</span>
              </div>
            </div>
          </div>

          <div className="w-full bg-[#0a0b10] px-6 py-3.5 flex items-center justify-between border-t border-white/10">
            <div className="flex items-center gap-1.5">
              <span className="text-[20px] font-black italic tracking-widest text-white select-none">{TOKENS[selectedToken].symbol}</span>
              <span className="text-[9px] font-semibold tracking-wider text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">DEVNET</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-medium text-gray-300 tracking-wider">{formatAddr(wallet.publicKey)}</span>
              <button onClick={() => navigator.clipboard.writeText(wallet.publicKey)} className="text-gray-400 hover:text-white p-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </button>
            </div>
          </div>
        </div>

        {/* SHIELD ROW */}
        <div onClick={async () => {
          if (loading || balance < 0.05) { setStatus('Need public SOL to shield'); setTimeout(() => setStatus(''), 2000); return }
          setLoading(true)
          try {
            const amt = selectedToken === 'SOL' ? 0.1 : 10
            await shield(amt, selectedToken)
            addTxn(`Shielded ${amt} ${TOKENS[selectedToken].symbol}`, `-${amt} ${TOKENS[selectedToken].symbol}`, 'expense', true)
            setStatus('Shielded! Now private.')
          }
          catch (err) { setStatus('Shield failed: ' + err.message); console.error(err) }
          setLoading(false)
        }} className="w-full rounded-[16px] p-3 flex items-center justify-between bg-[#11131a] border border-white/10 cursor-pointer hover:bg-[#191c28] active:scale-[0.99] transition-all">
          <div className="flex items-center gap-2">
            <span className="text-purple-400">🛡️</span>
            <div className="flex flex-col">
              <span className="text-[11px] text-gray-400 font-medium">Shield {selectedToken === 'SOL' ? '0.1 SOL' : '10 dUSDC'} → private balance{selectedToken !== 'SOL' ? ' • encrypted amounts' : ''}</span>
              <span className="text-[10px] text-gray-500">{zolanaReady ? (registered ? 'Registered • engine ready' : 'Registering...') : 'Engine not ready'}</span>
            </div>
          </div>
          <span className="text-[12px] font-bold text-purple-400">SHIELD →</span>
        </div>

        {/* SEND & RECEIVE */}
        <div className="w-full grid grid-cols-2 gap-3 my-0.5">
          <button onClick={() => document.getElementById('sendDrawer').classList.remove('hidden')} className="w-full py-3.5 px-4 rounded-[22px] bg-[#12141c] border border-white/10 flex items-center gap-3.5 hover:bg-[#191c28] active:scale-[0.97] transition-all shadow-lg group">
            <div className="w-10 h-10 rounded-full bg-[#5B41F4] flex items-center justify-center text-white shadow-md shadow-purple-500/30 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 17L17 7M17 7H9M17 7V15" /></svg>
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[15px] font-bold text-white tracking-tight">Send</span>
              <span className="text-[11px] text-gray-400 font-medium">{isPrivateMode ? '🕳️ Shadow' : 'Ghost'}</span>
            </div>
          </button>
          <button onClick={() => document.getElementById('requestDrawer').classList.remove('hidden')} className="w-full py-3.5 px-4 rounded-[22px] bg-[#12141c] border border-white/10 flex items-center gap-3.5 hover:bg-[#191c28] active:scale-[0.97] transition-all shadow-lg group">
            <div className="w-10 h-10 rounded-full bg-[#5B41F4] flex items-center justify-center text-white shadow-md shadow-purple-500/30 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 7L7 17M7 17H15M7 17V9" /></svg>
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[15px] font-bold text-white tracking-tight">Receive</span>
              <span className="text-[11px] text-gray-400 font-medium">QR code</span>
            </div>
          </button>
        </div>

        {/* MODE TOGGLE */}
        <div onClick={() => setIsPrivateMode(!isPrivateMode)} className={`w-full rounded-[20px] p-4 flex items-center justify-between border transition-all cursor-pointer ${isPrivateMode ? 'bg-purple-500/10 border-purple-500/30' : 'bg-[#11131a] border-white/10'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isPrivateMode ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5 text-gray-400'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-semibold text-white">{isPrivateMode ? '🕳️ Shadow Send' : '👻 Ghost Send'}</span>
              <span className="text-[11px] text-gray-400">{isPrivateMode ? 'Vanta→Vanta: everything encrypted, zero trace' : 'Vanta→anyone: arrives from the pool, not you'}</span>
            </div>
          </div>
          <div className={`w-12 h-7 rounded-full transition-all flex items-center px-0.5 ${isPrivateMode ? 'bg-[#5B41F4]' : 'bg-white/10'}`}>
            <div className={`w-6 h-6 rounded-full bg-white shadow-md transition-transform ${isPrivateMode ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
        </div>

        {/* TRANSACTIONS */}
        <div className="w-full rounded-[28px] bg-[#11131a] border border-white/10 p-5 shadow-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[17px] font-bold text-white tracking-tight">Transaction History</h2>
          </div>
          <div className="flex flex-col divide-y divide-white/5">
            {transactions.length === 0 ? (
              <div className="py-8 text-center text-gray-500 text-sm">
                No transactions yet.<br />Shield some SOL to go private.
              </div>
            ) : (
              transactions.map((tx, i) => (
                <div key={i} className="flex items-center justify-between py-3 px-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3.5">
                    <div className={`w-10 h-10 rounded-2xl bg-[#1c1f2e] border border-white/10 flex items-center justify-center ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {tx.isPrivate ? '🕳️' : tx.type === 'income' ? '↓' : '↑'}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[14px] font-semibold text-white tracking-tight">{tx.title}</span>
                      <span className="text-[11px] font-medium text-gray-400">{tx.time}{tx.isPrivate ? ' • 🔒 Private' : ''}</span>
                    </div>
                  </div>
                  <span className={`text-[15px] font-bold tracking-tight ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-500'}`}>{tx.amount}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* SEND DRAWER */}
      <SendDrawer
        wallet={wallet}
        selectedToken={selectedToken}
        setSelectedToken={setSelectedToken}
        tokenBalance={tokenBalance}
        isPrivateMode={isPrivateMode}
        loading={loading}
        setStatus={setStatus}
        setLoading={setLoading}
        addTxn={addTxn}
        shadowSend={shadowSend}
        ghostSend={ghostSend}
        sendSol={sendSol}
      />

      {/* RECEIVE DRAWER */}
      <div id="requestDrawer" className="hidden fixed inset-0 z-50 flex flex-col justify-end">
        <div onClick={() => document.getElementById('requestDrawer').classList.add('hidden')} className="drawer-overlay absolute inset-0 bg-black/75 opacity-0 backdrop-blur-md" style={{opacity: 1}}></div>
        <div className="drawer-sheet relative z-10 w-full max-w-[440px] mx-auto bg-[#13151f] border-t border-white/15 rounded-t-[36px] p-6 pb-10 flex flex-col items-center gap-5 shadow-2xl translate-y-0">
          <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto cursor-pointer" onClick={() => document.getElementById('requestDrawer').classList.add('hidden')}></div>
          <div className="w-full flex items-center justify-between">
            <h3 className="text-[20px] font-bold text-white">Receive</h3>
            <button onClick={() => document.getElementById('requestDrawer').classList.add('hidden')} className="w-8 h-8 rounded-full bg-white/10 text-gray-300 flex items-center justify-center hover:text-white">✕</button>
          </div>
          <div className="p-4 bg-white rounded-3xl shadow-2xl border-4 border-purple-500/20 my-1">
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=solana:${wallet.publicKey}`} alt="QR" className="w-44 h-44 rounded-xl" />
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-xs font-mono text-gray-300">{formatAddr(wallet.publicKey)}</span>
            <span className="text-xs text-gray-400">Share to receive. Vanta senders reach you privately.</span>
          </div>
          <button onClick={() => { navigator.clipboard.writeText(wallet.publicKey); alert('Address copied!'); }} className="w-full py-3.5 rounded-2xl bg-white/10 border border-white/10 font-bold text-white hover:bg-white/20 active:scale-95 transition-all">Copy Wallet Address</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// SEND DRAWER COMPONENT
// ============================================================
function SendDrawer({ wallet, selectedToken, setSelectedToken, tokenBalance, isPrivateMode, loading, setStatus, setLoading, addTxn, shadowSend, ghostSend, sendSol }) {
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!recipient || !amount) { alert('Enter recipient and amount'); return }
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { alert('Enter valid amount'); return }

    setSending(true)
    try {
      const sym = TOKENS[selectedToken].symbol
      if (isPrivateMode) {
        try {
          const sig = await shadowSend(recipient, amt, selectedToken)
          addTxn(`Shadow → ${formatAddr(recipient)}`, `-${amt} ${sym}`, 'expense', true)
          setStatus('🕳️ Shadow send complete — invisible on-chain.')
        } catch (err) {
          // Recipient not in the privacy registry → fall back to ghost send
          const msg = String(err?.message || err)
          if (!msg.includes('RECIPIENT_NOT_REGISTERED')) throw err
          console.log('Recipient not registered → falling back to ghost send')
          const sig = await ghostSend(recipient, amt, selectedToken)
          addTxn(`Ghost → ${formatAddr(recipient)}`, `-${amt} ${sym}`, 'expense', true)
          setStatus('👻 Recipient not registered — ghost sent. Pool, not you.')
        }
      } else {
        const sig = await ghostSend(recipient, amt, selectedToken)
        addTxn(`Ghost → ${formatAddr(recipient)}`, `-${amt} ${sym}`, 'expense', true)
        setStatus('👻 Ghost send complete — recipient sees the pool, not you.')
      }
      setRecipient('')
      setAmount('')
      document.getElementById('sendDrawer').classList.add('hidden')
    } catch (err) {
      setStatus('Failed: ' + (err?.message || err))
      console.error(err)
    }
    setSending(false)
  }

  const handlePublicSend = async () => {
    if (!recipient || !amount) { alert('Enter recipient and amount'); return }
    setSending(true)
    try {
      await sendSol(recipient, parseFloat(amount))
      addTxn(`Sent → ${formatAddr(recipient)}`, `-${parseFloat(amount).toFixed(4)} SOL`, 'expense', false)
      setStatus('SOL sent!')
      setRecipient(''); setAmount('')
      document.getElementById('sendDrawer').classList.add('hidden')
    } catch (err) {
      setStatus('Failed: ' + err.message)
    }
    setSending(false)
  }

  return (
    <div id="sendDrawer" className="hidden fixed inset-0 z-50 flex flex-col justify-end">
      <div onClick={() => document.getElementById('sendDrawer').classList.add('hidden')} className="drawer-overlay absolute inset-0 bg-black/75 opacity-100 backdrop-blur-md"></div>
      <div className="drawer-sheet relative z-10 w-full max-w-[440px] mx-auto bg-[#13151f] border-t border-white/15 rounded-t-[36px] p-6 pb-10 flex flex-col gap-4 shadow-2xl translate-y-0">
        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto cursor-pointer" onClick={() => document.getElementById('sendDrawer').classList.add('hidden')}></div>
        <div className="flex items-center justify-between">
          <h3 className="text-[20px] font-bold text-white">{isPrivateMode ? '🕳️ Shadow Send' : '👻 Ghost Send'} · {TOKENS[selectedToken].symbol}</h3>
          <button onClick={() => document.getElementById('sendDrawer').classList.add('hidden')} className="w-8 h-8 rounded-full bg-white/10 text-gray-300 flex items-center justify-center hover:text-white">✕</button>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <span className="text-purple-400">{isPrivateMode ? '🕳️' : '👻'}</span>
          <span className="text-xs text-purple-300 font-medium">
            {isPrivateMode
              ? `Encrypted ZK transfer of ${TOKENS[selectedToken].symbol}. Recipient must be a Vanta (registered) wallet.`
              : `${TOKENS[selectedToken].symbol} arrives from the shielded pool. Any Solana wallet works — no trace to you.`}
          </span>
        </div>

        <div>
          <label className="text-[12px] font-semibold uppercase text-gray-400 tracking-wider">Recipient Address</label>
          <input value={recipient} onChange={e => setRecipient(e.target.value)} type="text" placeholder="Paste Solana address..." className="w-full mt-1 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm font-mono placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50" />
        </div>

        <div className="text-center py-3 bg-black/40 rounded-2xl border border-white/5">
          <span className="text-[12px] font-semibold uppercase text-purple-400 tracking-wider">Amount ({TOKENS[selectedToken].symbol})</span>
          <input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01" min="0" placeholder="0.00" className="w-full bg-transparent text-[36px] font-extrabold text-white mt-0.5 tracking-tight text-center focus:outline-none placeholder:text-gray-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
          <span className="text-xs text-gray-500">Private balance: {tokenBalance(selectedToken).toFixed(selectedToken === 'SOL' ? 4 : 2)} {TOKENS[selectedToken].symbol}</span>
        </div>

        <button onClick={handleSend} disabled={sending || loading} className="w-full py-4 rounded-2xl bg-[#5B41F4] hover:bg-[#4d33e6] font-bold text-white shadow-lg shadow-purple-500/30 active:scale-[0.98] transition-all text-base disabled:opacity-50">
          {sending ? 'Proving...' : isPrivateMode ? '🕳️ Send Shadow' : '👻 Send Ghost'}
        </button>

        {!isPrivateMode && (
          <button onClick={handlePublicSend} disabled={sending || loading} className="w-full py-3 rounded-2xl bg-white/10 border border-white/10 font-semibold text-gray-300 hover:bg-white/20 active:scale-[0.98] transition-all text-sm disabled:opacity-50">
            or send plain public SOL →
          </button>
        )}
      </div>
    </div>
  )
}

function formatAddr(addr) { return addr ? addr.slice(0, 4) + '...' + addr.slice(-4) : '' }
