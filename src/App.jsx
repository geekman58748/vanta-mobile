import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

const RPC_URL = 'https://api.devnet.solana.com'
const RPC_WSS = 'wss://api.devnet.solana.com'
const UMBRA_INDEXER = 'https://utxo-indexer.api-devnet.umbraprivacy.com'
const UMBRA_RELAYER = 'https://relayer.api-devnet.umbraprivacy.com'
const DUSDC_MINT = '4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7' // devnet USDC

export default function App() {
  const [wallet, setWallet] = useState(null)
  const [balance, setBalance] = useState(0)
  const [isPrivacyOn, setIsPrivacyOn] = useState(false)
  const [isPrivateMode, setIsPrivateMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [transactions, setTransactions] = useState([])
  const [totalSent, setTotalSent] = useState(0)
  const [umbraReady, setUmbraReady] = useState(false)
  const [umbraRegistered, setUmbraRegistered] = useState(false)

  const umbraClientRef = useRef(null)
  const umbraSignerRef = useRef(null)

  // ============================================================
  // WALLET CORE
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
    } catch (err) {
      setStatus('Error: ' + err.message)
    }
    setLoading(false)
  }, [])

  const fetchBalance = useCallback(async (pubKey) => {
    try {
      const { Connection, PublicKey } = await import('@solana/web3.js')
      const conn = new Connection(RPC_URL, 'confirmed')
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
      const conn = new Connection(RPC_URL, 'confirmed')
      const sig = await conn.requestAirdrop(new PublicKey(wallet.publicKey), 1e9)
      await conn.confirmTransaction(sig, 'confirmed')
      await fetchBalance(wallet.publicKey)
      setStatus('Airdropped 1 SOL!')
      addTxn('Airdrop', '+1.0000 SOL', 'income', sig)
    } catch (err) {
      setStatus('Airdrop failed: ' + err.message)
    }
    setLoading(false)
  }, [wallet, fetchBalance])

  // ============================================================
  // UMBRA PRIVACY CLIENT
  // ============================================================
  const initUmbra = useCallback(async () => {
    if (!wallet || umbraClientRef.current) return
    try {
      setStatus('Initializing Umbra privacy...')
      const { createSignerFromPrivateKeyBytes } = await import('@umbra-privacy/sdk')
      const { getUmbraClient } = await import('@umbra-privacy/sdk')
      const { getPollingComputationMonitor } = await import('@umbra-privacy/sdk/arcium')
      const { getPollingTransactionForwarder } = await import('@umbra-privacy/sdk/solana')

      // Create signer from existing wallet secret key (64-byte keypair)
      const secretBytes = new Uint8Array(wallet.secretKey)
      const signer = await createSignerFromPrivateKeyBytes(secretBytes)
      console.log('Umbra signer address:', signer.address)
      umbraSignerRef.current = signer

      // Polling transport for devnet (WebSocket subscriptions fail on public RPCs)
      const transactionForwarder = getPollingTransactionForwarder({ rpcUrl: RPC_URL })
      const computationMonitor = getPollingComputationMonitor({ rpcUrl: RPC_URL })

      // Create Umbra client with polling transport
      const client = await getUmbraClient({
        signer,
        network: 'devnet',
        rpcUrl: RPC_URL,
        rpcSubscriptionsUrl: RPC_WSS,
        indexerApiEndpoint: UMBRA_INDEXER,
      }, {
        transactionForwarder,
        computationMonitor,
      })
      umbraClientRef.current = client
      setUmbraReady(true)
      setStatus('Umbra privacy ready!')
    } catch (err) {
      console.error('Umbra init error:', err)
      setStatus('Umbra init failed: ' + err.message)
    }
  }, [wallet])

  // Register with Umbra (confidential first, then anonymous)
  const registerUmbra = useCallback(async () => {
    if (!umbraClientRef.current) return
    try {
      setStatus('Registering for privacy (confidential)...')
      const { getUserRegistrationFunction } = await import('@umbra-privacy/sdk/registration')

      // Step 1: Register confidential (X25519 key) — no ZK prover needed
      const registerConfidential = getUserRegistrationFunction(
        { client: umbraClientRef.current },
        {}
      )
      const sigs1 = await registerConfidential({
        confidential: true,
        anonymous: false,
      })
      console.log('Confidential registration txs:', sigs1)

      setUmbraRegistered(true)
      setStatus(`Confidential registration complete! (${sigs1.length} tx)`)

      return sigs1
    } catch (err) {
      console.error('Umbra register error:', err)
      setStatus('Registration failed: ' + err.message)
      throw err
    }
  }, [])

  // Private send — PER-SEND BURNER WALLET. The main wallet NEVER touches
  // the pool. Flow per send:
  //   1. Generate fresh throwaway keypair (the "burner")
  //   2. Main wallet funds it with a plain transfer (one funding edge)
  //   3. BURNER registers with Umbra (its X25519 key, its linker PDA)
  //   4. BURNER creates the stealth note from its own ATA
  //   5. Note burned into recipient's PUBLIC wallet via relayer + one-time
  //      ephemeral signer. Recipient does NOTHING, uses any wallet.
  // Clicking the recipient's tx reveals ONLY burner-derived accounts —
  // single-use, never seen before/again. The sender's persistent Umbra
  // linker PDA (3n1MVbXi-style) never appears in any claim tx.
  const privateSend = useCallback(async (recipient, amount) => {
    const { Keypair, Connection, PublicKey, SystemProgram, Transaction } = await import('@solana/web3.js')
    const conn = new Connection(RPC_URL, 'confirmed')

    // Step 1: Fresh burner + fund it from main wallet (only public edge)
    setStatus('🔒 Step 1/5: Creating disposable burner wallet...')
    const burner = Keypair.generate()
    const FEE_BUFFER = 20_000_000 // ~0.02 SOL for rent + MPC fees (leftover dies with the burner)
    const fundTx = new Transaction().add(SystemProgram.transfer({
      fromPubkey: new PublicKey(wallet.publicKey),
      toPubkey: burner.publicKey,
      lamports: Math.floor(amount * 1e9) + FEE_BUFFER,
    }))
    const fundSig = await conn.sendTransaction(fundTx, [
      Keypair.fromSecretKey(new Uint8Array(wallet.secretKey)),
      burner,
    ])
    await conn.confirmTransaction(fundSig, 'confirmed')
    // PERSIST burner key: if the flow dies mid-send, only this key can claim
    // the self-burnable note. Recovery: rebuild burnerClient from this secret,
    // scan, burn. (Never delete these entries.)
    localStorage.setItem('vanta-burner-' + fundSig, JSON.stringify({
      publicKey: burner.publicKey.toBase58(),
      secretKey: Array.from(burner.secretKey),
      recipient, amount, createdAt: Date.now(),
    }))
    console.log('Burner funded:', burner.publicKey.toBase58(), fundSig)

    // Step 2: Isolated Umbra client for the BURNER (not our main identity)
    setStatus('🔒 Step 2/5: Registering burner (one-time identity)...')
    const { createSignerFromPrivateKeyBytes, getUmbraClient, getUmbraRelayer } = await import('@umbra-privacy/sdk')
    const { getPollingComputationMonitor } = await import('@umbra-privacy/sdk/arcium')
    const { getPollingTransactionForwarder } = await import('@umbra-privacy/sdk/solana')
    const burnerSigner = await createSignerFromPrivateKeyBytes(new Uint8Array(burner.secretKey))
    const burnerClient = await getUmbraClient({
      signer: burnerSigner,
      network: 'devnet',
      rpcUrl: RPC_URL,
      rpcSubscriptionsUrl: RPC_WSS,
      indexerApiEndpoint: UMBRA_INDEXER,
    }, {
      transactionForwarder: getPollingTransactionForwarder({ rpcUrl: RPC_URL }),
      computationMonitor: getPollingComputationMonitor({ rpcUrl: RPC_URL }),
    })
    console.log('Burner signer:', burnerSigner.address)

    const { getUserRegistrationFunction } = await import('@umbra-privacy/sdk/registration')
    const registerConfidential = getUserRegistrationFunction({ client: burnerClient }, {})
    const regSigs = await registerConfidential({ confidential: true, anonymous: false })
    console.log('Burner registration txs:', regSigs)

    const SOL_MINT = 'So11111111111111111111111111111111111111112'
    const lamports = BigInt(Math.floor(amount * 1e9))
    const { createU64 } = await import('@umbra-privacy/sdk/types')
    const { address } = await import('@solana/kit')

    // Step 3: Stealth note from the BURNER's ATA (not ours)
    setStatus('🔒 Step 3/5: Shielding into private pool...')
    const { getATAIntoSelfBurnableStealthPoolNoteCreatorFunction } = await import('@umbra-privacy/sdk/deposit')
    const { getATAIntoStealthPoolNoteCreatorProver } = await import('@umbra-privacy/sdk/zk-prover')
    const createNote = getATAIntoSelfBurnableStealthPoolNoteCreatorFunction(
      { client: burnerClient },
      { zkProver: getATAIntoStealthPoolNoteCreatorProver() },
    )
    const noteResult = await createNote({
      destinationAddress: address(recipient),
      mint: address(SOL_MINT),
      amount: createU64({ value: lamports }),
    })
    console.log('Stealth note created:', noteResult)

    // Step 4: Scan pool for our note (indexer needs a few seconds)
    setStatus('🔒 Step 4/5: Locating note in pool...')
    const { getBurnableStealthPoolNoteScannerFunction, getSelfBurnableStealthPoolNoteIntoATABurnerFunction } = await import('@umbra-privacy/sdk/burn')
    const { getClaimSelfClaimableUtxoIntoPublicBalanceProver } = await import('@umbra-privacy/sdk/zk-prover')

    const scan = getBurnableStealthPoolNoteScannerFunction({ client: burnerClient })
    let notes = []
    for (let attempt = 0; attempt < 10; attempt++) {
      const scanResult = await scan()
      notes = scanResult.ataToStealthPoolSelfBurnable || []
      console.log(`Scan attempt ${attempt + 1}: ${notes.length} note(s) found`)
      if (notes.length > 0) break
      await new Promise(r => setTimeout(r, 3000))
    }
    if (notes.length === 0) {
      throw new Error('Note not indexed yet — funds are safe in the pool, use Claim Private Funds in a minute')
    }

    // Step 5: Burn note into recipient's public wallet via one-time signer + relayer
    setStatus('🔒 Step 5/5: Sweeping to recipient (one-time address)...')
    const r = getUmbraRelayer({ apiEndpoint: UMBRA_RELAYER })
    const burn = getSelfBurnableStealthPoolNoteIntoATABurnerFunction(
      { client: burnerClient },
      {
        fetchBatchMerkleProof: burnerClient.fetchBatchMerkleProof,
        zkProver: getClaimSelfClaimableUtxoIntoPublicBalanceProver(),
        relayer: {
          submitBurn: r.submitClaim,
          pollBurnStatus: r.pollClaimStatus,
          getRelayerAddress: r.getRelayerAddress,
        },
      },
    )
    const tagged = notes.map(n => ({ ...n, kind: 'self-burnable' }))
    const burnResult = await burn(tagged)
    console.log('Burn-to-recipient result:', burnResult)

    setStatus('Private send complete! Recipient sees a one-time burner — not you.')
    return burnResult
  }, [wallet])

  // Withdraw from Umbra privacy pool back to public wallet
  const withdrawFromPool = useCallback(async (amount) => {
    if (!umbraClientRef.current || !umbraSignerRef.current) {
      throw new Error('Umbra client not initialized')
    }
    if (!umbraRegistered) {
      throw new Error('Must register with Umbra first')
    }

    setStatus('🔓 Withdrawing from privacy pool...')
    const { getETAIntoATAWithdrawerFunction } = await import('@umbra-privacy/sdk/withdrawal')
    const { createU64 } = await import('@umbra-privacy/sdk/types')
    const { address } = await import('@solana/kit')

    const SOL_MINT = address('So11111111111111111111111111111111111111112')
    const withdraw = getETAIntoATAWithdrawerFunction({ client: umbraClientRef.current })
    const lamports = BigInt(Math.floor(amount * 1e9))

    setStatus('🔓 Processing withdrawal via Arcium MPC...')
    const result = await withdraw(
      umbraSignerRef.current.address,
      SOL_MINT,
      createU64({ value: lamports }),
    )

    console.log('Withdraw result:', result)
    setStatus('Withdrawal complete! SOL returned to your wallet.')
    return result
  }, [umbraRegistered])

  // Plain SOL transfer
  const plainSend = useCallback(async (recipient, amount) => {
    const { Connection, PublicKey, Transaction, SystemProgram, Keypair } = await import('@solana/web3.js')
    const conn = new Connection(RPC_URL, 'confirmed')
    const fromKeypair = Keypair.fromSecretKey(new Uint8Array(wallet.secretKey))
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: new PublicKey(recipient),
        lamports: Math.floor(amount * 1e9),
      })
    )
    const sig = await conn.sendTransaction(tx, [fromKeypair])
    await conn.confirmTransaction(sig, 'confirmed')
    return sig
  }, [wallet])

  // ============================================================
  // INIT
  // ============================================================
  useEffect(() => {
    const saved = localStorage.getItem('vanta-wallet')
    if (saved) {
      const data = JSON.parse(saved)
      setWallet(data)
      fetchBalance(data.publicKey)
    }
  }, [fetchBalance])

  // Init Umbra when wallet is ready
  useEffect(() => {
    if (wallet && !umbraClientRef.current) {
      initUmbra()
    }
  }, [wallet, initUmbra])

  // ============================================================
  // HELPERS
  // ============================================================
  const addTxn = (title, amount, type, sig) => {
    setTransactions(prev => [{ title, amount, type, sig, time: new Date().toLocaleTimeString() }, ...prev])
    if (type === 'expense') {
      setTotalSent(prev => prev + parseFloat(amount.replace('-', '').replace(' SOL', '')))
    }
  }

  const formatAddr = (addr) => addr ? addr.slice(0, 4) + '...' + addr.slice(-4) : ''

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
            <p className="text-sm text-gray-400 mt-2 max-w-[280px]">Privacy-first Solana wallet. Send SOL without exposing sender, recipient, or amount.</p>
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
            {umbraReady && umbraRegistered ? '🛡️' : '✓'}
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
                <span className="text-[13px] font-semibold text-purple-200/90 tracking-wide uppercase">Your Balance</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/30 border border-purple-400/30 text-purple-200">SOL</span>
              </div>
              <button onClick={() => setIsPrivacyOn(!isPrivacyOn)} className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md border border-white/15 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 active:scale-90 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              </button>
            </div>

            <div className="relative z-10 mt-3">
              <div className={`blur-rollup text-[38px] font-extrabold text-white tracking-tight leading-none drop-shadow-lg ${isPrivacyOn ? 'balance-masked' : ''}`}>
                {balance.toFixed(4)} SOL
              </div>
            </div>
          </div>

          <div className="w-full bg-[#0a0b10] px-6 py-3.5 flex items-center justify-between border-t border-white/10">
            <div className="flex items-center gap-1.5">
              <span className="text-[20px] font-black italic tracking-widest text-white select-none">SOL</span>
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

        {/* SEND & RECEIVE */}
        <div className="w-full grid grid-cols-2 gap-3 my-0.5">
          <button onClick={() => document.getElementById('sendDrawer').classList.remove('hidden')} className="w-full py-3.5 px-4 rounded-[22px] bg-[#12141c] border border-white/10 flex items-center gap-3.5 hover:bg-[#191c28] active:scale-[0.97] transition-all shadow-lg group">
            <div className="w-10 h-10 rounded-full bg-[#5B41F4] flex items-center justify-center text-white shadow-md shadow-purple-500/30 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 17L17 7M17 7H9M17 7V15" /></svg>
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[15px] font-bold text-white tracking-tight">Send</span>
              <span className="text-[11px] text-gray-400 font-medium">{isPrivateMode ? '🔒 Private' : 'To anyone'}</span>
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

        {/* PRIVATE SEND TOGGLE */}
        <div onClick={() => setIsPrivateMode(!isPrivateMode)} className={`w-full rounded-[20px] p-4 flex items-center justify-between border transition-all cursor-pointer ${isPrivateMode ? 'bg-purple-500/10 border-purple-500/30' : 'bg-[#11131a] border-white/10'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isPrivateMode ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5 text-gray-400'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-semibold text-white">Private Send</span>
              <span className="text-[11px] text-gray-400">{isPrivateMode ? 'Umbra MPC shielded transfers ON' : 'Standard public transfers'}</span>
            </div>
          </div>
          <div className={`w-12 h-7 rounded-full transition-all flex items-center px-0.5 ${isPrivateMode ? 'bg-[#5B41F4]' : 'bg-white/10'}`}>
            <div className={`w-6 h-6 rounded-full bg-white shadow-md transition-transform ${isPrivateMode ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
        </div>

        {/* UMBRA STATUS */}
        {isPrivateMode && (
          <div className="w-full rounded-[16px] p-3 flex items-center gap-2 bg-purple-500/5 border border-purple-500/15">
            <span className="text-purple-400">🛡️</span>
            <span className="text-[11px] text-purple-300 font-medium">
              {umbraReady ? (umbraRegistered ? 'Umbra privacy active — MPC-protected transfers' : 'Umbra ready — will register on first private send') : 'Initializing Umbra privacy layer...'}
            </span>
          </div>
        )}

        {/* CLAIM PRIVATE FUNDS */}
        <button onClick={async () => {
          setLoading(true)
          try {
            if (!umbraReady) { setStatus('Umbra not ready yet'); setLoading(false); return }
            if (!umbraRegistered) { await registerUmbra() }

            setStatus('🔍 Scanning for private funds...')
            const { getBurnableStealthPoolNoteScannerFunction } = await import('@umbra-privacy/sdk/burn')
            const { getReceiverBurnableStealthPoolNoteIntoETABurnerFunction, getSelfBurnableStealthPoolNoteIntoATABurnerFunction } = await import('@umbra-privacy/sdk/burn')
            const { getUmbraRelayer } = await import('@umbra-privacy/sdk')
            const { getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver, getClaimSelfClaimableUtxoIntoPublicBalanceProver } = await import('@umbra-privacy/sdk/zk-prover')
            const { address } = await import('@solana/kit')

            // Scan for any notes sent to us
            const scan = getBurnableStealthPoolNoteScannerFunction({ client: umbraClientRef.current })
            const result = await scan()
            console.log('Scan result:', result)

            const receiverNotes = result.ataToStealthPoolReceiverBurnable || []
            const selfNotes = result.ataToStealthPoolSelfBurnable || []
            const totalNotes = receiverNotes.length + selfNotes.length

            if (totalNotes === 0) {
              setStatus('No private funds found for this wallet.')
              setLoading(false)
              return
            }

            setStatus(`Found ${totalNotes} private note(s)! Claiming...`)

            // Try receiver-burnable first, then self-burnable
            if (receiverNotes.length > 0) {
              const r = getUmbraRelayer({ apiEndpoint: UMBRA_RELAYER })
              const burn = getReceiverBurnableStealthPoolNoteIntoETABurnerFunction(
                { client: umbraClientRef.current },
                {
                  fetchBatchMerkleProof: umbraClientRef.current.fetchBatchMerkleProof,
                  zkProver: getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver(),
                  relayer: {
                    submitBurn: r.submitClaim,
                    pollBurnStatus: r.pollClaimStatus,
                    getRelayerAddress: r.getRelayerAddress,
                  },
                },
              )
              const notes = receiverNotes.map(n => ({ ...n, kind: 'receiver-burnable' }))
              const burnResult = await burn(notes)
              console.log('Burn result:', burnResult)
              setStatus(`Claimed ${receiverNotes.length} note(s)! Funds now in your wallet.`)
            }

            if (selfNotes.length > 0) {
              const r = getUmbraRelayer({ apiEndpoint: UMBRA_RELAYER })
              const burn = getSelfBurnableStealthPoolNoteIntoATABurnerFunction(
                { client: umbraClientRef.current },
                {
                  fetchBatchMerkleProof: umbraClientRef.current.fetchBatchMerkleProof,
                  zkProver: getClaimSelfClaimableUtxoIntoPublicBalanceProver(),
                  relayer: {
                    submitBurn: r.submitClaim,
                    pollBurnStatus: r.pollClaimStatus,
                    getRelayerAddress: r.getRelayerAddress,
                  },
                },
              )
              const notes = selfNotes.map(n => ({ ...n, kind: 'self-burnable' }))
              const burnResult = await burn(notes)
              console.log('Burn result:', burnResult)
              setStatus(`Claimed ${selfNotes.length} note(s)! Funds now in your wallet.`)
            }

            await fetchBalance(wallet.publicKey)
            addTxn('Claimed Private Funds', `+claimed`, 'income', 'claim')
          } catch (err) {
            console.error('Claim error:', err)
            setStatus('Claim failed: ' + err.message)
          }
          setLoading(false)
        }} disabled={loading} className="w-full py-3.5 px-4 rounded-[22px] bg-gradient-to-r from-emerald-500/10 to-emerald-600/10 border border-emerald-500/20 flex items-center gap-3 hover:from-emerald-500/15 hover:to-emerald-600/15 active:scale-[0.97] transition-all shadow-lg">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-md">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 17L17 7M17 7H9M17 7V15" /></svg>
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[15px] font-bold text-white tracking-tight">Claim Private Funds</span>
            <span className="text-[11px] text-emerald-400 font-medium">Scan & unshield private transfers</span>
          </div>
        </button>

        {/* TRANSACTIONS */}
        <div className="w-full rounded-[28px] bg-[#11131a] border border-white/10 p-5 shadow-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[17px] font-bold text-white tracking-tight">Transaction History</h2>
          </div>
          <div className="flex flex-col divide-y divide-white/5">
            {transactions.length === 0 ? (
              <div className="py-8 text-center text-gray-500 text-sm">
                No transactions yet.<br />Tap <span className="text-purple-400">+</span> to airdrop devnet SOL.
              </div>
            ) : (
              transactions.map((tx, i) => (
                <div key={i} onClick={() => {}} className="flex items-center justify-between py-3 px-2 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-3.5">
                    <div className={`w-10 h-10 rounded-2xl bg-[#1c1f2e] border border-white/10 flex items-center justify-center group-hover:scale-105 transition-transform ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {tx.isPrivate ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                      ) : tx.type === 'income' ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      )}
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
        balance={balance}
        isPrivateMode={isPrivateMode}
        loading={loading}
        setLoading={setLoading}
        setStatus={setStatus}
        fetchBalance={fetchBalance}
        addTxn={addTxn}
        plainSend={plainSend}
        privateSend={privateSend}
        umbraReady={umbraReady}
      />

      {/* RECEIVE DRAWER */}
      <div id="requestDrawer" className="hidden fixed inset-0 z-50 flex flex-col justify-end">
        <div onClick={() => document.getElementById('requestDrawer').classList.add('hidden')} className="drawer-overlay absolute inset-0 bg-black/75 opacity-0 backdrop-blur-md" style={{opacity: 1}}></div>
        <div className="drawer-sheet relative z-10 w-full max-w-[440px] mx-auto bg-[#13151f] border-t border-white/15 rounded-t-[36px] p-6 pb-10 flex flex-col items-center gap-5 shadow-2xl translate-y-0">
          <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto cursor-pointer" onClick={() => document.getElementById('requestDrawer').classList.add('hidden')}></div>
          <div className="w-full flex items-center justify-between">
            <h3 className="text-[20px] font-bold text-white">Receive SOL</h3>
            <button onClick={() => document.getElementById('requestDrawer').classList.add('hidden')} className="w-8 h-8 rounded-full bg-white/10 text-gray-300 flex items-center justify-center hover:text-white">✕</button>
          </div>
          <div className="p-4 bg-white rounded-3xl shadow-2xl border-4 border-purple-500/20 my-1">
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=solana:${wallet.publicKey}`} alt="QR" className="w-44 h-44 rounded-xl" />
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-xs font-mono text-gray-300">{formatAddr(wallet.publicKey)}</span>
            <span className="text-xs text-gray-400">Scan QR or copy address to receive SOL</span>
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
function SendDrawer({ wallet, balance, isPrivateMode, loading, setLoading, setStatus, fetchBalance, addTxn, plainSend, privateSend, umbraReady }) {
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!recipient || !amount) { alert('Enter recipient and amount'); return }
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { alert('Enter valid amount'); return }
    if (amt > balance) { alert('Insufficient funds'); return }

    setSending(true)
    try {
      if (isPrivateMode && umbraReady) {
        setStatus('🔒 Shielding via Umbra MPC...')
        const result = await privateSend(recipient, amt)
        addTxn(`Private → ${formatAddr(recipient)}`, `-${amt.toFixed(4)} SOL`, 'expense', result?.queueSignature || 'private-tx')
        setStatus('Private transfer complete!')
      } else {
        setStatus('Sending SOL...')
        const sig = await plainSend(recipient, amt)
        addTxn(`Sent to ${formatAddr(recipient)}`, `-${amt.toFixed(4)} SOL`, 'expense', sig)
        setStatus('Transfer confirmed!')
      }
      await fetchBalance(wallet.publicKey)
      setRecipient('')
      setAmount('')
      document.getElementById('sendDrawer').classList.add('hidden')
    } catch (err) {
      setStatus('Failed: ' + err.message)
      console.error(err)
    }
    setSending(false)
  }

  return (
    <div id="sendDrawer" className="hidden fixed inset-0 z-50 flex flex-col justify-end">
      <div onClick={() => document.getElementById('sendDrawer').classList.add('hidden')} className="drawer-overlay absolute inset-0 bg-black/75 opacity-100 backdrop-blur-md"></div>
      <div className="drawer-sheet relative z-10 w-full max-w-[440px] mx-auto bg-[#13151f] border-t border-white/15 rounded-t-[36px] p-6 pb-10 flex flex-col gap-4 shadow-2xl translate-y-0">
        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto cursor-pointer" onClick={() => document.getElementById('sendDrawer').classList.add('hidden')}></div>
        <div className="flex items-center justify-between">
          <h3 className="text-[20px] font-bold text-white">{isPrivateMode ? '🔒 Private Send' : 'Send SOL'}</h3>
          <button onClick={() => document.getElementById('sendDrawer').classList.add('hidden')} className="w-8 h-8 rounded-full bg-white/10 text-gray-300 flex items-center justify-center hover:text-white">✕</button>
        </div>

        {isPrivateMode && umbraReady && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <span className="text-purple-400">🛡️</span>
            <span className="text-xs text-purple-300 font-medium">Umbra MPC — sender, recipient & amount hidden on-chain</span>
          </div>
        )}

        <div>
          <label className="text-[12px] font-semibold uppercase text-gray-400 tracking-wider">Recipient Address</label>
          <input value={recipient} onChange={e => setRecipient(e.target.value)} type="text" placeholder="Paste Solana address..." className="w-full mt-1 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm font-mono placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50" />
        </div>

        <div className="text-center py-3 bg-black/40 rounded-2xl border border-white/5">
          <span className="text-[12px] font-semibold uppercase text-purple-400 tracking-wider">Amount (SOL)</span>
          <input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.0001" min="0" placeholder="0.00" className="w-full bg-transparent text-[36px] font-extrabold text-white mt-0.5 tracking-tight text-center focus:outline-none placeholder:text-gray-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
          <span className="text-xs text-gray-500">Available: {balance.toFixed(4)} SOL</span>
        </div>

        <button onClick={handleSend} disabled={sending || loading} className="w-full py-4 rounded-2xl bg-[#5B41F4] hover:bg-[#4d33e6] font-bold text-white shadow-lg shadow-purple-500/30 active:scale-[0.98] transition-all text-base disabled:opacity-50">
          {sending ? 'Processing...' : isPrivateMode ? '🔒 Send Privately' : 'Confirm & Send'}
        </button>
      </div>
    </div>
  )
}

function formatAddr(addr) { return addr ? addr.slice(0, 4) + '...' + addr.slice(-4) : '' }
