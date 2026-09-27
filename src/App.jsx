import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'
import Toast from './components/Toast'
import SendDrawer from './components/SendDrawer'
import ShieldDrawer from './components/ShieldDrawer'
import ProfileDrawer from './components/ProfileDrawer'
import PrivacySheet from './components/PrivacySheet'
import ReceiveDrawer from './components/ReceiveDrawer'
import ReceiptDrawer from './components/ReceiptDrawer'
import ActivityDrawer from './components/ActivityDrawer'
import SettingsDrawer from './components/SettingsDrawer'
import Onboarding from './components/Onboarding'
import SuccessOverlay from './components/SuccessOverlay'
// The Vanta mark, trimmed from the 1254px master to a 256px luminance+alpha PNG
// (the logo is pure monochrome, so LA is lossless here and ~6x smaller than RGBA).
// Vite hashes it into dist/assets and rewrites the URL relatively, which is what
// keeps it loadable from inside the APK's appassets sandbox.
import vantaLogo from './assets/vanta-logo.png'
import { playHaptic } from './lib/haptic'
import { copyText } from './lib/clipboard'
import { shortAddr, splitLeadingGlyph } from './lib/format'
import { TOKENS, SOL_MINT, SHIELD_FEE_RESERVE } from './lib/tokens'
import { relayerFetch } from './lib/config'
import { recordSend, lookupProof } from './lib/txHistory'
import {
  bytesToBase58, bytesToBase64, connectMwa, disconnectMwa, initMwa, isMwaAvailable,
  serializeCompiledTx, signatureFromSignedTx, signAndSendTransactionWithMwa,
  signTransactionWithMwa,
} from './lib/mwa'

// ── Runtime config (see .env.example) ────────────────────────────────
// Everything host-specific comes from Vite env so one source tree builds for
// localhost, a public relayer, and the submitted APK. The defaults keep `npm
// run dev` working with zero setup.
//
// ⚠ These are VITE_* values, which Vite compiles into the client bundle. That
// keeps secrets out of *git*, not out of the shipped app — anyone can read the
// built JS. Rotate anything that has ever been committed, and treat the
// relayer token as abuse-deterrence, not authentication.
const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY ?? ''
const RPC_URL =
  import.meta.env.VITE_RPC_URL ||
  (HELIUS_API_KEY
    ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
    : 'https://api.devnet.solana.com')
const RPC_WSS =
  import.meta.env.VITE_RPC_WSS || RPC_URL.replace(/^http/, 'ws')
const INDEXER_URL = import.meta.env.VITE_INDEXER_URL || 'https://d2xah7tnhdhcom.cloudfront.net'
const PROVER_URL = import.meta.env.VITE_PROVER_URL || 'https://d21ni15goiip6l.cloudfront.net'
// Legacy public devnet RPC for plain SOL send + airdrop fallback
const PUBLIC_RPC = import.meta.env.VITE_PUBLIC_RPC || 'https://api.devnet.solana.com'
// Privacy relayer — hides user wallet as fee payer on all Zolana txs.
// Point this at the public HTTPS deployment for anything but local dev; on a
// phone, `localhost` is the phone itself.
// RELAYER_URL / RELAYER_TOKEN / relayerFetch moved to src/lib/config.js so the
// drawers can resolve `.vanta` handles without taking the whole engine as props.

// The design's topographic line field. Purely atmospheric: sits behind the
// content, masked out toward the bottom so it never fights the balance figure.
function TopoWaves() {
  return (
    <svg
      className="topo-waves"
      viewBox="0 0 400 350"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {[
        'M50 0 C 150 40, 250 10, 400 80',
        'M30 0 C 140 50, 240 20, 400 100',
        'M10 0 C 130 60, 230 30, 400 120',
        'M0 10 C 120 70, 220 40, 400 140',
        'M0 30 C 110 80, 210 50, 400 160',
        'M0 50 C 100 90, 200 60, 400 180',
        'M0 70 C 90 100, 190 70, 400 200',
        'M0 90 C 80 110, 180 80, 400 220',
        'M0 110 C 70 120, 170 90, 400 240',
        'M0 130 C 60 130, 160 100, 400 260',
        'M0 150 C 50 140, 150 110, 400 280',
        'M0 170 C 40 150, 140 120, 400 300',
        'M0 190 C 30 160, 130 130, 400 320',
      ].map((d, i) => (
        <path
          key={d}
          d={d}
          stroke="white"
          strokeOpacity={(0.08 + i * 0.004).toFixed(3)}
          strokeWidth="1.2"
        />
      ))}
    </svg>
  )
}

// Token constants now live in src/lib/tokens.js so the drawers can share them.

// ── Shield error translation ───────────────────────────────────────────────
// Wallets report on-chain rejections through a handful of opaque MWA codes.
// fakewallet maps *every* failed submission to -2 "payloads invalid for
// signing" — including a tx that simply had no money in it. Showing that verbatim
// told the user our payload was broken when the real answer was 5,000 lamports.
function shieldErrorMessage(err) {
  const raw = String(err?.message || err || '').trim()
  if (/payloads invalid for signing/i.test(raw)) {
    return 'The wallet rejected this transaction — usually your balance does not cover the amount plus the network fee.'
  }
  if (/timeout|did not respond|did not answer/i.test(raw)) {
    return 'The wallet did not respond. Reconnect it and try again.'
  }
  if (/insufficient/i.test(raw)) {
    return `Not enough SOL: ${raw}`
  }
  // A dead network used to surface as a bare "Failed to fetch" or an SDK
  // "client rpc" string, which reads like a broken app rather than a dropped
  // connection. Say which it is.
  if (/failed to fetch|network|unknown host|load failed|fetch failed|client rpc|rpc/i.test(raw)) {
    return 'Could not reach the network. Check your connection and try again.'
  }
  return `Shield failed: ${raw}`
}

export default function App() {
  // Read the saved wallet SYNCHRONOUSLY in the initializer, not from the boot
  // effect. With a null first render the app painted the connect-wallet screen
  // for one frame on every reload before the effect restored the wallet and
  // bounced to the dashboard. That flash read as a glitch on returning visits.
  const [wallet, setWallet] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('vanta-wallet') || 'null')
    } catch {
      return null
    }
  })
  const [balance, setBalance] = useState(0)
  const [privateBalances, setPrivateBalances] = useState([])
  const [isPrivacyOn, setIsPrivacyOn] = useState(false)
  const [isPrivateMode, setIsPrivateMode] = useState(true) // default ON: shadow send
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  // User-facing notifications live on their own channel. The engine writes
  // progress/errors into `status` from ~20 places in the crypto paths; if they
  // shared one slot, a background sync could silently overwrite a real error
  // like "Insufficient private balance" before the user ever read it.
  const [toast, setToast] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [zolanaReady, setZolanaReady] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [selectedToken, setSelectedToken] = useState('SOL') // SOL or dUSDC
  // Registered privacy identity (the on-chain owner address). This is the
  // address a Vanta sender uses to Shadow-send into your private balance.
  // It is NOT your public wallet address.
  const [vantaAddress, setVantaAddress] = useState(null)
  // Auto-shield is UI-only for now; the batched-sweep wiring lands later.
  const [autoShield, setAutoShield] = useState(() => localStorage.getItem('vanta-auto-shield') === '1')
  // First-run intro. Deliberately localStorage, not the encrypted wallet store:
  // it must be readable before any wallet exists, and it is about this browser
  // rather than this identity. Cleared only by uninstalling / clearing site
  // data, which is exactly the "shows once" behaviour we want.
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem('vanta-onboarded') === '1')
  // Connected device wallet (Seed Vault / Phantom / Solflare) via Mobile Wallet
  // Adapter. When present it *is* the public wallet — no key in localStorage.
  const [mwaAccount, setMwaAccount] = useState(null)
  const [mwaAvailable, setMwaAvailable] = useState(false)

  // ── Drawer / sheet state (replaces the old getElementById().classList calls) ──
  const [sendOpen, setSendOpen] = useState(false)
  const [shieldOpen, setShieldOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [leakOpen, setLeakOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receiptTxn, setReceiptTxn] = useState(null)
  // The action-confirmed overlay. Null when closed; otherwise the details of the
  // Shield / send that just landed, so the overlay can show the amount and proof.
  const [success, setSuccess] = useState(null)
  const [txnFilter, setTxnFilter] = useState('all')
  // Bumping this remounts the balance figure so the roll-up animation replays.
  const [balanceKey, setBalanceKey] = useState(0)

  const clientRef = useRef(null)
  const keysRef = useRef(null)
  const walletRef = useRef(null) // zolana Wallet (UTXO state)
  const signerRef = useRef(null)
  const shieldedKeypairRef = useRef(null)
  const relayerAddressRef = useRef(null) // relayer fee payer address
  const solMintRef = useRef(SOL_MINT)     // set from zk.SOL_MINT at init
  // Resolves once the privacy engine has finished coming up (or failed). Private
  // actions await it so tapping Shield during the deferred warm-up waits a beat
  // instead of hitting a half-built engine.
  const engineReadyRef = useRef(Promise.resolve())
  const engineResolveRef = useRef(null)

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
  const relayTx = useCallback(async (kit, client, compiledTx, userSigners = [], presigned = null) => {
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

      // User signs their own slots. Two paths: a local seed (in-app wallet) or a
      // signature already produced by the device wallet via MWA.
      const seedByAddr = new Map(userSigners.map(s => [s.address, s.seed]))
      const presignedByAddr = presigned ?? new Map()
      for (const slot of slots) {
        const seed = seedByAddr.get(slot.addr)
        if (seed) {
          slot.sig = btoa(String.fromCharCode(...ed25519.sign(messageBytes, seed)))
        } else if (presignedByAddr.has(slot.addr)) {
          slot.sig = presignedByAddr.get(slot.addr)
        }
      }

      const res = await relayerFetch('/relay', {
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
    const res = await relayerFetch('/fund', {
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
        // Normalize the SDK's native-SOL sentinel onto this app's SOL key.
        const mint = b.mint === solMintRef.current ? SOL_MINT : b.mint
        const meta = Object.values(TOKENS).find(t => t.mint === mint)
        return {
          mint,
          symbol: meta?.symbol ?? (mint === SOL_MINT ? 'SOL' : 'token'),
          amount: Number(b.amount) / 10 ** (meta?.decimals ?? 9),
        }
      })
      console.log('[vanta] private balances', bals, '· unspent utxos',
        w.utxos().filter(u => !u.spent).length, '/', w.utxos().length)
      setPrivateBalances(bals)
    } catch (err) {
      console.error('balance read error:', err)
    }
  }, [])

  // Pull the latest private state from the indexer. Required after every
  // confirmed private tx (the SDK builds the next spend from synced notes) and
  // needed on first load so a fresh browser sees a balance a Shadow delivered.
  // Deposits need a moment to index, so this polls before giving up.
  const syncPrivate = useCallback(async () => {
    try {
      const zk = await import('@heliuslabs/zolana')
      const client = clientRef.current
      if (!client || !walletRef.current || !keysRef.current) return null
      setStatus('Syncing private balance…')
      let report = null
      for (let attempt = 1; attempt <= 6; attempt++) {
        report = await zk.syncWallet({ client, wallet: walletRef.current, keys: keysRef.current })
        const utxoCount = walletRef.current.utxos().length
        console.log(`[vanta] sync #${attempt}`, {
          storedUtxos: report?.storedUtxos,
          unparsedTransactions: report?.unparsedTransactions,
          undecryptableCandidates: report?.undecryptableCandidates,
          unknownAssetIds: report?.unknownAssetIds?.map(String),
          walletUtxos: utxoCount,
          identity: String(shieldedKeypairRef.current?.shieldedAddress?.() ?? ''),
        })
        if (utxoCount > 0 || (report?.storedUtxos ?? 0) > 0) break
        if (attempt < 6) await new Promise(r => setTimeout(r, 3000))
      }
      await zk.syncPersistedWallet({
        client, wallet: walletRef.current, keys: keysRef.current, store: lzStore,
        cipher: zk.walletSnapshotCipher(shieldedKeypairRef.current),
      })
      refreshPrivateBalances()
      const found = walletRef.current.balances().length
      setStatus(found ? 'Private balance synced ✓' : 'Synced — no private notes found')
      setTimeout(() => setStatus(''), 3500)
      return report
    } catch (err) {
      console.error('sync error:', err)
      setStatus('Sync failed: ' + (err?.message || err))
      return null
    }
  }, [refreshPrivateBalances])

  // Wipe the local note cache and rescan from scratch. Recovers a wallet whose
  // persisted sync cursors sit ahead of the indexer (e.g. after the 2026-09-24
  // program redeploy reset indexed history) — otherwise notes are skipped forever.
  const forceResync = useCallback(async () => {
    try {
      const zk = await import('@heliuslabs/zolana')
      if (!shieldedKeypairRef.current) { setStatus('Engine not ready'); return }
      localStorage.removeItem('vanta-zwallet')
      walletRef.current = new zk.Wallet({ identity: shieldedKeypairRef.current.shieldedAddress() })
      setPrivateBalances([])
      console.log('[vanta] force resync — cleared local snapshot, rescanned from chain')
      await syncPrivate()
    } catch (err) {
      console.error('resync error:', err)
      setStatus('Resync failed: ' + (err?.message || err))
    }
  }, [syncPrivate])

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
      solMintRef.current = zk.SOL_MINT ?? SOL_MINT
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
      setVantaAddress(signer.address) // registered owner address (private receive)

      // Relayer still pays deposit on-ramp gas
      try {
        const relayerData = await relayerFetch('/address').then(r => r.json())
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

      // Registration is non-fatal: it only gates Shadow *receiving*. Shield and
      // Ghost work without it, so a relayer outage degrades one feature rather
      // than killing init.
      try {
        // 0.3.0 registration takes `payer`, which sponsors the new identity's
        // rent and fees. With the relayer as payer, neither the user wallet nor
        // X needs SOL on hand to come online.
        const reg = await zk.buildRegistrationTransaction({
          client,
          owner: signer.address,
          address: keypair.shieldedAddress(),
          payer: relayerAddressRef.current || signer.address,
        })
        if (reg !== undefined) {
          setStatus('Registering privacy identity...')
          // Relayer-sponsored → route through the relayer so it signs its own
          // fee-payer slot. Otherwise X signs and pays its own way.
          const regSig = relayerAddressRef.current
            ? await relayTx(kit, client, reg, [{ address: signer.address, seed: xSeed }])
            : await xSubmit(kit, client, reg)
          console.log('registered X:', regSig)
        }
        setRegistered(true)
      } catch (err) {
        console.warn('registration failed (Shadow receiving only):', err)
        setStatus('Registration failed — you can still Shield and Ghost-send')
      }

      // First-load sync: without it a fresh browser shows an empty private
      // balance even after a Shadow send has landed for it.
      await syncPrivate()
      console.log('[vanta] identity owner:', signer.address, '· shielded:', String(keypair.shieldedAddress()))
    } catch (err) {
      console.error('zolana init error:', err)
      setStatus('Privacy init failed: ' + (err?.message || err))
      throw err
    }
  }, [refreshPrivateBalances, syncPrivate])

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

  // ── Connect a real device wallet via MWA ────────────────────────────────
  // This becomes Vanta's public wallet: it funds Shielding and receives Ghosts.
  // No private key is written to localStorage. Declared after `fetchBalance`
  // because it depends on it — hoisting this above would hit a TDZ error.
  const connectWalletMwa = useCallback(async () => {
    setLoading(true)
    setStatus('Opening your wallet…')
    try {
      const account = await connectMwa()
      const data = { publicKey: account.address, mwa: true, label: account.label ?? null }
      localStorage.setItem('vanta-wallet', JSON.stringify(data))
      setWallet(data)
      setMwaAccount({ address: account.address, label: account.label ?? null })
      setStatus('Wallet connected')
      playHaptic('success')
      await fetchBalance(account.address)
      await initZolana(data)
    } catch (err) {
      setStatus('Connect failed: ' + (err?.message || err))
      console.error('MWA connect error:', err)
    }
    setLoading(false)
  }, [fetchBalance, initZolana])

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnectMwa()
    } catch (err) {
      console.warn('MWA disconnect error:', err)
    }
    localStorage.removeItem('vanta-wallet')
    localStorage.removeItem('vanta-zwallet')
    setMwaAccount(null)
    setWallet(null)
    setBalance(0)
    setPrivateBalances([])
    setVantaAddress(null)
    setRegistered(false)
    setZolanaReady(false)
    keysRef.current = null
    walletRef.current = null
    signerRef.current = null
    shieldedKeypairRef.current = null
    setStatus('Disconnected')
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
      playHaptic('success')
    } catch (err) {
      setStatus('Airdrop failed: ' + err.message)
    }
    setLoading(false)
  }, [wallet, fetchBalance])

  // ============================================================
  // POST-SEND SYNC — the "wallet never got debited" bug
  // ============================================================
  // A confirmed tx does not mean the indexer has caught up with it. The wallet
  // reads notes from the indexer, so one sync right after confirm can still
  // return the pre-send note set: the change note is invisible AND the spent
  // input still looks unspent, so the balance stays stale until some later
  // load. Observed directly — snapshot at 01:56Z, send at 01:57Z, app only
  // caught up at 02:01Z (PLAN.md §4.1).
  //
  // Fix: fingerprint the note set before submitting, then keep syncing until it
  // actually differs. `requireSlot` stays on every attempt so the SDK never
  // accepts a sync that predates our transaction.
  const privateStateSignature = useCallback(() => {
    try {
      const w = walletRef.current
      if (!w) return ''
      const utxos = w.utxos() ?? []
      const unspent = utxos.filter((u) => !u.spent)
      const balances = (w.balances() ?? [])
        .map((b) => `${b.mint}:${b.amount}`)
        .sort()
        .join(',')
      // Total, unspent and per-mint totals cover every direction: a deposit adds
      // a note; a spend marks inputs spent and adds a change note.
      return `${utxos.length}|${unspent.length}|${balances}`
    } catch (err) {
      console.warn('private state signature failed:', err)
      return ''
    }
  }, [])

  /**
   * Poll sync until the note set moves off its pre-send value, then persist and
   * refresh. Bounded: after MAX_ATTEMPTS it gives up and refreshes anyway rather
   * than hanging a confirmed send.
   */
  const syncAfterSend = useCallback(async (slot, zk, before) => {
    const wallet = walletRef.current
    const keys = keysRef.current
    if (!wallet || !keys) return null

    const MAX_ATTEMPTS = 6
    const RETRY_MS = 1500
    let report = null
    let caughtUp = false

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      report = await zk.syncWallet({
        client: clientRef.current, wallet, keys, config: { requireSlot: slot },
      })
      if (before && privateStateSignature() !== before) {
        caughtUp = true
        break
      }
      if (attempt >= 2 && attempt < MAX_ATTEMPTS) {
        setStatus('⏳ Waiting for the private balance to settle…')
      }
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, RETRY_MS))
    }
    if (!caughtUp) console.warn(`[vanta] balance still stale after ${MAX_ATTEMPTS} syncs (slot ${slot})`)

    await zk.syncPersistedWallet({
      client: clientRef.current, wallet, keys, store: lzStore,
      cipher: zk.walletSnapshotCipher(shieldedKeypairRef.current),
    })
    refreshPrivateBalances()
    // Remount the figure so the blur roll-up replays — this is the visual proof
    // to the user that their send actually landed on the balance.
    if (caughtUp) setBalanceKey((k) => k + 1)
    setStatus('')
    return report
  }, [privateStateSignature, refreshPrivateBalances])

  // ============================================================
  // SHIELD — public → private balance (the front door)
  // Supports SOL and dUSDC (full-shield mode)
  // ============================================================
  const shield = useCallback(async (amount, token = 'SOL') => {
    // Wait out the deferred engine warm-up if the user beat it to the tap.
    await engineReadyRef.current
    const zk = await import('@heliuslabs/zolana')
    const kit = await import('@solana/kit')
    const client = clientRef.current
    const tokenInfo = TOKENS[token]
    const decimals = tokenInfo.decimals
    const rawAmount = BigInt(Math.round(amount * 10 ** decimals))
    setStatus(`🛡️ Shielding ${amount} ${tokenInfo.symbol}...`)
    const before = privateStateSignature()

    // The relayer fee-pays every deposit, in-app AND device-wallet: the wallet
    // signs only as depositor — sign-only MWA, relayer cosigns slot 0 and
    // broadcasts. The wallet→pool edge stays visible (depositor must sign), but
    // a tracker starting from the recipient side lands on the relayer as fee
    // payer, never on the user's wallet as the tx initiator.
    const useMwa = !!wallet.mwa
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
    let sig
    if (useMwa) {
      // Relayer fee-pays; the device wallet signs ONLY as depositor (sign-only
      // MWA — it is never asked to authorize a fee it does not pay). The relayer
      // fills its own slot and broadcasts, so the wallet never appears as fee
      // payer and never broadcasts the tx itself.
      const { bytes, order, v1 } = serializeCompiledTx(deposit)
      const signed = await signTransactionWithMwa(bytes)
      const walletSlot = order.indexOf(wallet.publicKey)
      const presigned = new Map([
        [wallet.publicKey, bytesToBase64(signatureFromSignedTx(signed, walletSlot, v1))],
      ])
      sig = await relayTx(kit, client, deposit, [], presigned)
    } else {
      sig = await relayTx(kit, client, deposit, [
        { address: wallet.publicKey, seed: new Uint8Array(wallet.secretKey.slice(0, 32)) },
      ])
    }
    const slot = await client.confirmTransaction(sig)
    await syncAfterSend(slot, zk, before)
    await fetchBalance(wallet.publicKey)
    // Shield is the one flow the relayer fee-pays, so it already owns a row with
    // flow_source='relayer'. Re-posting this signature would upsert that back to
    // 'client' and erase the fact that the relayer observed it directly, so this
    // only re-reads the server's verdict.
    await recordSend({
      signature: sig,
      mode: 'Shield',
      // `amount` here, not `amt` — the parameter is `amount`. This was `amt`,
      // a ReferenceError thrown AFTER the deposit already confirmed on chain:
      // the user saw their wallet debited and the private balance rise, but no
      // history row and no confirmation, because the throw skipped both.
      amount,
      decimals: tokenInfo.decimals,
      actor: wallet.publicKey,
      addresses: [wallet.publicKey, signerRef.current?.address],
    })
    return sig
  }, [wallet, fetchBalance, refreshPrivateBalances, privateStateSignature, syncAfterSend])

  // ============================================================
  // SHADOW SEND — private → private (Vanta to Vanta)
  // Recipient must be registered (any Vanta user is, automatically)
  // ============================================================
  const shadowSend = useCallback(async (recipient, amount, token = 'SOL') => {
    await engineReadyRef.current
    const zk = await import('@heliuslabs/zolana')
    const kit = await import('@solana/kit')
    const client = clientRef.current
    const tokenInfo = TOKENS[token]
    const decimals = tokenInfo.decimals
    setStatus('🕳️ Building shadow transfer (ZK proof)...')
    const before = privateStateSignature()
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
    await syncAfterSend(slot, zk, before)
    // The relayer never sees a Shadow (X pays its own fee), so this report is the
    // only route its signature takes into the history — and the only way a
    // receipt can say "confirmed" instead of "your device says so".
    await recordSend({
      signature: sig,
      mode: 'Shadow',
      amount,
      decimals,
      counterparty: recipient,
      actor: signerRef.current.address,
      addresses: [signerRef.current.address],
    })
    return sig
  }, [refreshPrivateBalances, privateStateSignature, syncAfterSend])

  // ============================================================
  // GHOST SEND — private → any public wallet (Vanta to anyone)
  // Recipient does NOTHING. Funds arrive FROM THE POOL.
  // ============================================================
  const ghostSend = useCallback(async (recipient, amount, token = 'SOL') => {
    await engineReadyRef.current
    const zk = await import('@heliuslabs/zolana')
    const kit = await import('@solana/kit')
    const client = clientRef.current
    const tokenInfo = TOKENS[token]
    const decimals = tokenInfo.decimals
    setStatus('👻 Building ghost withdrawal (ZK proof)...')
    const before = privateStateSignature()
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
    await syncAfterSend(slot, zk, before)
    // Same story as Shadow: the relayer is not in this transaction, so report it
    // or it never reaches the history at all.
    await recordSend({
      signature: sig,
      mode: 'Ghost',
      amount,
      decimals,
      counterparty: recipient,
      actor: signerRef.current.address,
      addresses: [signerRef.current.address],
    })
    return sig
  }, [refreshPrivateBalances, privateStateSignature, syncAfterSend])

  // ============================================================
  // PLAIN SEND — public SOL transfer
  // ============================================================
  const sendSol = useCallback(async (recipient, amount) => {
    const { Keypair, Connection, Transaction, SystemProgram, PublicKey } = await import('@solana/web3.js')
    const conn = new Connection(PUBLIC_RPC, 'confirmed')
    const from = new PublicKey(wallet.publicKey)
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: from,
        toPubkey: new PublicKey(recipient),
        lamports: Math.round(amount * 1e9),
      }),
    )
    let sig
    if (wallet.mwa) {
      // Device wallet signs and broadcasts — Vanta never holds this key.
      const { blockhash } = await conn.getLatestBlockhash('confirmed')
      tx.feePayer = from
      tx.recentBlockhash = blockhash
      const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false })
      const sigBytes = await signAndSendTransactionWithMwa(bytes)
      sig = await bytesToBase58(sigBytes)
    } else {
      const kp = Keypair.fromSecretKey(new Uint8Array(wallet.secretKey))
      sig = await conn.sendTransaction(tx, [kp])
    }
    await conn.confirmTransaction(sig, 'confirmed')
    await fetchBalance(wallet.publicKey)
    await recordSend({
      signature: sig,
      mode: 'Public',
      amount,
      decimals: 9,
      counterparty: recipient,
      actor: wallet.publicKey,
      addresses: [wallet.publicKey],
    })
    return sig
  }, [wallet, fetchBalance])

  // ============================================================
  // INIT
  // ============================================================
  useEffect(() => {
    initMwa()
    setMwaAvailable(isMwaAvailable())
    const saved = localStorage.getItem('vanta-wallet')
    if (!saved) return
    const data = JSON.parse(saved)
    setWallet(data)
    fetchBalance(data.publicKey)
    // A saved device-wallet connection re-authorizes from the cached grant when
    // the wallet still holds it; otherwise this resolves on the next connect.
    const ready = data.mwa
      ? connectMwa()
          .then((account) => setMwaAccount({ address: account.address, label: account.label ?? null }))
          .catch((err) => {
            console.warn('MWA silent reconnect failed:', err)
            setStatus('Reconnect your wallet to sign')
          })
      : Promise.resolve()

    // ── Defer the engine off the critical path ──────────────────────────
    // The privacy engine (zolana + crypto) is a ~4.8 MB chunk. It is already
    // code-split, but it used to be fetched the instant the app booted, so the
    // main thread spent the first frames downloading and parsing it. The
    // dashboard — public balance, history, addresses — needs none of it.
    //
    // So: paint first, then load. The gate is the REAL first-contentful-paint
    // entry, not requestAnimationFrame — rAF fires on the browser's first frame
    // (an empty page, before React has painted anything), so a double-rAF gate
    // still started the engine before the dashboard appeared. Measured twice.
    // PerformanceObserver on 'paint' fires exactly when content lands, and with
    // `buffered: true` it also resolves immediately on a warm start where the
    // paint already happened. The timeout is the floor: if a paint entry never
    // arrives we load anyway, because a wallet that never boots beats one that
    // boots a beat late.
    engineReadyRef.current = new Promise((resolve) => {
      engineResolveRef.current = resolve
    })
    let released = false
    const releaseEngine = () => {
      if (released) return
      released = true
      engineResolveRef.current?.()
    }
    let started = false
    const startEngine = () => {
      if (started) return
      started = true
      ready
        .then(() => initZolana(data))
        .catch(() => {})
        .finally(releaseEngine)
    }

    let painted = false
    const afterFirstPaint = () => {
      if (painted) return
      painted = true
      // Now that something is on screen, hand the ~4.8 MB parse to idle time.
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(startEngine, { timeout: 1200 })
      } else {
        startEngine()
      }
    }

    let observer
    try {
      observer = new PerformanceObserver((list) => {
        if (list.getEntries().some((e) => e.name === 'first-contentful-paint')) {
          observer.disconnect()
          afterFirstPaint()
        }
      })
      observer.observe({ type: 'paint', buffered: true })
    } catch {
      observer = null
    }

    // Floor, so the engine always comes up even if no paint entry ever arrives.
    const fallback = setTimeout(afterFirstPaint, 1500)
    return () => {
      clearTimeout(fallback)
      observer?.disconnect()
    }
  }, [fetchBalance, initZolana])

  // ============================================================
  // UI HELPERS — toast, receipts, history
  // ============================================================
  // `setStatus` keeps working untouched everywhere in the crypto paths; `notify`
  // is the richer user-facing channel. Both auto-dismiss like the reference.
  const notify = useCallback((message, icon = '✓') => {
    setToast({ message, icon })
  }, [])

  useEffect(() => {
    if (!toast) return
    const serious = /fail|error|unavailable|invalid/i.test(toast.message)
    const timer = setTimeout(() => setToast(null), serious ? 6000 : 3600)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!status) return
    const timer = setTimeout(() => setStatus(''), 4000)
    return () => clearTimeout(timer)
  }, [status])

  const addTxn = (title, amount, type, isPrivate, meta = {}) => {
    setTransactions(prev => [
      {
        title,
        amount,
        type,
        isPrivate,
        time: new Date().toLocaleTimeString(),
        at: Date.now(),
        ...meta,
        // The send path has already reported (or re-read) this signature before
        // the row exists, so the proof is read synchronously from the module map
        // instead of being fetched here. Absent -> null -> "Not checked", which
        // is the honest default rather than an implied confirmation.
        proof: meta.proof ?? lookupProof(meta.signature),
      },
      ...prev,
    ])
  }

  const openReceipt = (txn) => {
    setReceiptTxn(txn)
    setReceiptOpen(true)
  }

  const tokenBalance = (token) => {
    const info = TOKENS[token]
    return privateBalances.find(b => b.mint === info.mint)?.amount ?? 0
  }

  const visibleTransactions = transactions.filter((tx) => {
    if (txnFilter === 'private') return tx.isPrivate
    if (txnFilter === 'public') return !tx.isPrivate
    return true
  })

  const togglePrivacy = () => {
    playHaptic('tap')
    const next = !isPrivacyOn
    setIsPrivacyOn(next)
    if (!next) setBalanceKey(k => k + 1) // remount → replay the blur roll-up
    notify(next ? 'Balance hidden' : 'Balance visible', next ? '🔒' : '👁')
  }

  // One banner, two sources: a user toast wins, otherwise show engine progress.
  const engineBanner = status ? splitLeadingGlyph(status) : null
  const bannerMessage = toast ? toast.message : engineBanner?.text
  const bannerIcon = toast ? toast.icon : engineBanner?.glyph ?? '⋯'

  const toggleMode = () => {
    playHaptic('tap')
    setIsPrivateMode(prev => !prev)
  }

  const toggleAutoShield = () => {
    playHaptic('tap')
    setAutoShield(prev => {
      localStorage.setItem('vanta-auto-shield', prev ? '0' : '1')
      return !prev
    })
  }

  // ── Shield (the front door) ──────────────────────────────────────────
  // The amount now comes from ShieldDrawer rather than being hardcoded to
  // 0.1 SOL / 10 dUSDC, so a wallet holding less than 0.100010 can still shield.
  // This function keeps the guard, the tx and the history row; the sheet owns
  // the picker. Both read SHIELD_FEE_RESERVE from lib/tokens so they cannot
  // disagree about what "All" means.
  const shieldNow = async (amt) => {
    if (loading) return
    const symbol = TOKENS[selectedToken].symbol

    // ── Fee reserve ─────────────────────────────────────────────────────
    // The deposit leaves the connected wallet, and on the MWA path that wallet
    // is ALSO the fee payer — so shielding X needs X plus the network fee.
    //
    // Top-ups behave the same way: sending "exactly 0.1" from another wallet
    // arrives as 0.099995 because that sender paid 5,000 lamports of fee out of
    // the amount. The old guard only demanded 0.05 SOL, so a wallet holding
    // 0.099995 happily passed and then died on-chain — surfacing to the user as
    // fakewallet's meaningless "payloads invalid for signing".
    const required = selectedToken === 'SOL' ? amt + SHIELD_FEE_RESERVE : 0.05
    if (balance < required) {
      notify(
        selectedToken === 'SOL'
          ? `Need ${required.toFixed(6)} SOL to shield ( ${amt} + network fee ). You have ${balance.toFixed(6)}.`
          : `Need public SOL for the network fee. You have ${balance.toFixed(6)}.`,
        '⚠️',
      )
      return
    }

    playHaptic('tap')
    setLoading(true)
    try {
      const sig = await shield(amt, selectedToken)
      addTxn(`Shielded ${amt} ${symbol}`, `+${amt} ${symbol}`, 'income', true, {
        mode: 'Shield',
        symbol,
        value: amt,
        signature: sig,
        status: 'Confirmed',
      })
      setSuccess({ kind: 'shield', amount: amt, symbol, signature: sig, mode: 'Shield' })
    } catch (err) {
      notify(shieldErrorMessage(err), '⚠️')
      console.error(err)
    }
    setLoading(false)
  }

  // ── Asset rail ───────────────────────────────────────────────────────
  // Static metadata only — the amounts are read at render time. Public dUSDC
  // has no balance read in this build, so it renders as an em dash rather than
  // a fabricated figure.
  const ASSET_RAIL = [
    {
      key: 'SOL',
      name: 'Solana',
      // Wells stay neutral. The Solana gradient below is a brand mark and keeps
      // its own colours; tinting the well green made the whole card read green.
      well: 'bg-sunken border-hair',
      glow: 'bg-accent/10',
      icon: (
        <svg className="relative z-10 w-5 h-5" viewBox="0 0 397 311" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="vanta-sol-g" x1="0" y1="0" x2="397" y2="311" gradientUnits="userSpaceOnUse">
              <stop stopColor="#00FFA3" />
              <stop offset="1" stopColor="#DC1FFF" />
            </linearGradient>
          </defs>
          <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" fill="url(#vanta-sol-g)" />
          <path d="M64.6 3.8C67 1.4 70.3 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#vanta-sol-g)" />
          <path d="M332.4 120.9c-2.4-2.4-5.7-3.8-9.2-3.8H5.8c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#vanta-sol-g)" />
        </svg>
      ),
    },
    {
      key: 'dUSDC',
      name: 'Private USD Coin',
      well: 'bg-sunken border-hair',
      glow: 'bg-white/10',
      icon: <span className="relative z-10 text-[16px] font-bold text-[#5AC8FA]">$</span>,
    },
  ]

  // Session totals for the transactions header. History lives only in this
  // browser, so this is "this session", not a fabricated all-time figure.
  const sessionIn = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + (Number(t.value) || 0), 0)
  const sessionOut = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + (Number(t.value) || 0), 0)
  const todayLabel = new Date()
    .toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    .toUpperCase()

  // ============================================================
  // FIRST RUN
  // ============================================================
  // Onboarding comes BEFORE the connect screen. The gate below used to sit above
  // it, so a first install opened on "Connect device wallet" and only showed the
  // intro after the wallet existed. The intro is what frames the product, so it
  // has to be the first thing a new user sees. All hooks are declared above this
  // point, so an early return is safe.
  if (!onboarded) {
    return (
      <Onboarding
        onDone={() => {
          localStorage.setItem('vanta-onboarded', '1')
          setOnboarded(true)
        }}
      />
    )
  }

  // ============================================================
  // CONNECT
  // ============================================================
  if (!wallet) {
    return (
      <div className="relative w-full max-w-[440px] min-h-screen bg-canvas flex flex-col items-center justify-center px-6 mx-auto overflow-hidden">
        <div className="spotlight-left" />
        <div className="spotlight-right" />
        <TopoWaves />

        <div className="relative z-10 flex flex-col items-center gap-7 text-center">
          <div className="relative w-20 h-20 rounded-3xl bg-card border border-hair flex items-center justify-center shadow-2xl overflow-hidden">
            <div className="absolute inset-0 bg-accent/10 blur-md" />
            {/* Was a bare letter "V". The real mark is white-on-transparent, so it
                needs no filter or tint against the near-black canvas. */}
            <img
              src={vantaLogo}
              alt=""
              aria-hidden="true"
              className="relative z-10 h-12 w-12 object-contain"
            />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Vanta</h1>
            <p className="text-sm text-muted mt-2 max-w-[290px] leading-relaxed">
              Private transfers on Solana. Shield into a shielded pool, then Shadow-send to another
              Vanta user or Ghost-send to any wallet.
            </p>
          </div>
          <button
            onClick={() => { playHaptic('pop'); connectWalletMwa() }}
            disabled={loading}
            className="w-full max-w-[300px] py-4 rounded-2xl bg-accent hover:bg-accent-hi font-bold text-black shadow-lg shadow-accent/20 active:scale-[0.98] tap text-base disabled:opacity-50"
          >
            {loading ? 'Connecting…' : 'Connect device wallet'}
          </button>
          <button
            onClick={() => { playHaptic('tap'); createWallet() }}
            disabled={loading}
            className="w-full max-w-[300px] py-3.5 rounded-2xl bg-white/5 border border-hair font-semibold text-white/80 hover:bg-white/10 active:scale-[0.98] tap text-sm disabled:opacity-50"
          >
            Use a throwaway in-app wallet
          </button>
          <p className="text-[11px] text-muted max-w-[300px] leading-snug">
            Seed Vault / Phantom / Solflare holds your funds — Vanta never stores that key.
          </p>
          {!mwaAvailable && (
            <p className="text-[10px] text-muted/70 max-w-[300px] leading-snug">
              No wallet app detected — install Phantom or Solflare, or use a Seeker.
            </p>
          )}
          {status && <p className="text-xs text-muted">{status}</p>}
        </div>
      </div>
    )
  }

  // ============================================================
  // MAIN UI
  // ============================================================
  return (
    <div className="relative w-full max-w-[440px] min-h-screen bg-canvas flex flex-col px-6 pt-5 pb-8 overflow-x-hidden mx-auto">

      <Toast message={bannerMessage} icon={bannerIcon} />

      {/* Ambient spotlights + topographic field, behind everything */}
      <div className="spotlight-left" />
      <div className="spotlight-right" />
      <TopoWaves />

      {/* HEADER */}
      <header className="relative z-10 w-full flex items-center justify-between pt-1 pb-6">
        <button
          onClick={() => { playHaptic('tap'); setReceiveOpen(true) }}
          aria-label="Receive — show QR code"
          className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-hair flex items-center justify-center text-white/90 hover:bg-white/10 tap duration-200 active:scale-95 shadow-lg"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="2.5" stroke="currentColor" strokeWidth="2" />
            <rect x="14" y="3" width="7" height="7" rx="2.5" stroke="currentColor" strokeWidth="2" />
            <rect x="3" y="14" width="7" height="7" rx="2.5" stroke="currentColor" strokeWidth="2" />
            <rect x="14" y="14" width="7" height="7" rx="2.5" stroke="currentColor" strokeWidth="2" />
            <circle cx="6.5" cy="6.5" r="1" fill="currentColor" />
            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
            <circle cx="6.5" cy="17.5" r="1" fill="currentColor" />
            <circle cx="17.5" cy="17.5" r="1" fill="currentColor" />
          </svg>
        </button>

        <div className="flex items-center gap-2.5">
          {/* Engine state read-out — and, since it is already on screen and costs
              nothing, the entry point to the "what leaks" breakdown.

              The breakdown does NOT belong as its own row on home: a dedicated
              legend line read as clutter and got pulled. A status chip is where
              "so what does 'Shielded' actually mean?" already gets asked, so the
              sheet stays one tap away with zero added surface. */}
          <button
            onClick={() => { playHaptic('tap'); setLeakOpen(true) }}
            aria-label="Engine status — tap for what Vanta hides and what it exposes"
            title="Tap for what Vanta hides and what it exposes"
            className="h-9 pl-2.5 pr-3 rounded-full bg-white/[0.03] border border-hair flex items-center gap-1.5 hover:bg-white/10 transition-colors active:scale-95"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                zolanaReady ? (registered ? 'bg-accent' : 'bg-amber-400') : 'bg-white/30'
              }`}
            />
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">
              {zolanaReady ? (registered ? 'Shielded' : 'Shield only') : 'Starting'}
            </span>
          </button>

          <button
            onClick={() => { playHaptic('pop'); setProfileOpen(true) }}
            aria-label="Profile and Vanta name"
            className="w-12 h-12 rounded-full bg-white/[0.03] border border-hair flex items-center justify-center text-white font-bold text-base hover:bg-white/10 tap duration-200 active:scale-95 shadow-lg"
          >
            V
          </button>
        </div>
      </header>

      <main className="relative z-10 w-full flex-1 flex flex-col gap-4">

        {/* PRIMARY BALANCE — bare on the canvas, per the design */}
        <section className="relative mt-3 mb-7">
          <div key={balanceKey} className={`blur-rollup ${isPrivacyOn ? 'balance-masked' : ''}`}>
            <p className="text-muted text-[13px] font-normal mb-2 tracking-normal">Private balance</p>

            <div className="flex items-baseline gap-3">
              <span className="text-[60px] leading-none font-light tracking-tight text-white tnum">
                {tokenBalance(selectedToken).toFixed(selectedToken === 'SOL' ? 3 : 2)}
              </span>
              <span className="text-2xl font-normal text-white/80 tracking-normal">
                {TOKENS[selectedToken].symbol}
              </span>
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => copyText(wallet.publicKey, notify, 'Public address copied!', '📥')}
                className="flex items-center gap-2 text-left active:scale-[0.98] tap"
                title="Copy public address"
              >
                <span className="text-[15px] font-mono text-muted tracking-tight">
                  {shortAddr(wallet.publicKey)}
                </span>
                <svg className="w-3.5 h-3.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 border border-accent/30 text-accent">
                DEVNET
              </span>
            </div>
          </div>

          {/* Sync + visibility — the design's eye toggle, plus the sync action */}
          <div className="absolute top-1 right-0 flex items-center gap-2">
            <button
              onClick={() => { playHaptic('tap'); syncPrivate() }}
              className="w-10 h-10 rounded-full bg-white/[0.03] border border-hair flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 active:scale-90 tap shadow-lg"
              title="Sync private balance"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <button
              onClick={togglePrivacy}
              className="w-10 h-10 rounded-full bg-white/[0.03] border border-hair flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 active:scale-90 tap shadow-lg"
              title="Toggle balance visibility"
            >
              {isPrivacyOn ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              )}
            </button>
          </div>
        </section>

        {/* ACTION ROW — Shield leads, because it is the front door.

             Width maths, because the first version got this wrong: the container
             splits 1fr/1fr minus a 60px Receive button and two gaps, so each button
             gets ~129px. At px-2.5 + a 40px icon well + gap-3.5 the text column was
             left with ~55px, and "Choose amount" in 10px mono needed ~78px — it
             wrapped and read as the icon pushing the label sideways. Shrinking the
             well to 32px and dropping `pr-2` buys back ~20px, and the sub-label is
             non-mono now so it optically aligns with the title above it. */}
        <section className="grid grid-cols-[1fr_1fr_auto] gap-3 mb-5">
          <button
            onClick={() => { playHaptic('pop'); setShieldOpen(true) }}
            disabled={loading}
            className="glass-btn h-[60px] rounded-[22px] px-3 flex items-center gap-2.5 tap duration-200 disabled:opacity-50"
          >
            <div className="w-8 h-8 shrink-0 rounded-[10px] bg-sunken border border-hair flex items-center justify-center">
              {/* Shield + keyhole. The plain shield silhouette read as stock clip-art;
                  the keyhole says "vault" and gives the glyph a centre to sit on. */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2.5 5 5.7v5.4c0 4.4 3 8.1 7 9.4 4-1.3 7-5 7-9.4V5.7L12 2.5Z" />
                <circle cx="12" cy="10.8" r="1.5" />
                <path d="M12 12.3V15" />
              </svg>
            </div>
            <span className="flex flex-col text-left min-w-0">
              <span className="font-semibold text-[15px] text-white tracking-tight leading-tight">Shield</span>
              <span className="text-[10px] text-muted leading-tight truncate">Set amount</span>
            </span>
          </button>

          <button
            onClick={() => { playHaptic('pop'); setSendOpen(true) }}
            className="glass-btn h-[60px] rounded-[22px] px-3 flex items-center gap-2.5 tap duration-200"
          >
            <div className="w-8 h-8 shrink-0 rounded-[10px] bg-sunken border border-hair flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20V4m0 0l-6 6m6-6l6 6" />
              </svg>
            </div>
            <span className="flex flex-col text-left min-w-0">
              <span className="font-semibold text-[15px] text-white tracking-tight leading-tight">Send</span>
              <span className="text-[10px] text-muted leading-tight truncate">{isPrivateMode ? 'Shadow' : 'Ghost'}</span>
            </span>
          </button>

          <button
            onClick={() => { playHaptic('pop'); setReceiveOpen(true) }}
            aria-label="Receive — show QR code"
            className="glass-btn h-[60px] w-[60px] rounded-[22px] flex items-center justify-center tap duration-200"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v16m0 0l-6-6m6 6l6-6" />
            </svg>
          </button>
        </section>

        {/* SEND MODE — Shadow (Vanta→Vanta) or Ghost (→ any wallet) */}
        <div
          onClick={toggleMode}
          className={`w-full rounded-[20px] p-4 mb-6 flex items-center justify-between border tap cursor-pointer ${
            isPrivateMode ? 'bg-accent/10 border-accent/30' : 'bg-card border-hair'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isPrivateMode ? 'bg-accent/20 text-accent' : 'bg-white/5 text-muted'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-semibold text-white">{isPrivateMode ? 'Shadow send' : 'Ghost send'}</span>
              <span className="text-[11px] text-muted">
                {isPrivateMode
                  ? 'Vanta → Vanta · amount and counterparty hidden'
                  : 'Vanta → any wallet · arrives from the pool, not you'}
              </span>
            </div>
          </div>            <div className={`w-12 h-7 shrink-0 rounded-full tap flex items-center px-0.5 ${isPrivateMode ? 'bg-accent' : 'bg-white/10'}`}>
            <div className={`w-6 h-6 rounded-full bg-white shadow-md transition-transform ${isPrivateMode ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
        </div>

        {/* TRANSACTIONS */}
        <section className="flex-1 flex flex-col">
          {/* Header bar — real date, real session totals */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-muted text-[14px] font-normal tracking-normal">Transactions</p>
              <button
                onClick={() => { playHaptic('tap'); setActivityOpen(true) }}
                className="text-[12px] font-semibold text-accent hover:text-white transition-colors"
              >
                View all →
              </button>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="font-mono text-[13px] tracking-widest text-white/90 font-semibold uppercase">
                Today, {todayLabel}
              </span>
              <div className="flex items-center gap-3 font-mono text-[13px]">
                <span className="text-accent font-medium tnum">+{sessionIn.toFixed(3)}</span>
                <span className="text-muted font-medium tnum">-{sessionOut.toFixed(3)}</span>
              </div>
            </div>
          </div>

          {/* Asset rail — also the token selector, showing private vs public */}
          <div className="flex flex-col gap-3 mb-5">
            {ASSET_RAIL.map((asset) => {
              const active = selectedToken === asset.key
              const priv = tokenBalance(asset.key)
              const pub = asset.key === 'SOL' ? `${balance.toFixed(4)} SOL` : '—'
              return (
                <button
                  key={asset.key}
                  onClick={() => { playHaptic('pop'); setSelectedToken(asset.key) }}
                  className={`asset-card rounded-[22px] p-4 flex items-center justify-between text-left active:scale-[0.99] tap ${
                    active ? 'border-accent/40 card-glow' : ''
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`relative w-11 h-11 shrink-0 rounded-full border flex items-center justify-center overflow-hidden ${asset.well}`}>
                      <div className={`absolute inset-0 blur-sm ${asset.glow}`} />
                      {asset.icon}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium text-[16px] text-white leading-snug">{asset.name}</span>
                      <span className="text-muted text-[12px] font-mono leading-snug">public {pub}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-mono text-[15px] font-normal text-white leading-snug tnum">
                      {priv.toFixed(asset.key === 'SOL' ? 4 : 2)}
                    </span>
                    <span className={`text-[12px] font-mono leading-snug ${active ? 'text-accent' : 'text-muted'}`}>
                      private
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="flex flex-col divide-y divide-white/5 mt-1">
            {visibleTransactions.length === 0 ? (
              <div className="py-8 text-center text-muted text-sm">
                {transactions.length === 0 ? (
                  <>No transactions yet.<br />Shield some SOL to go private.</>
                ) : (
                  <>Nothing in this filter.</>
                )}
              </div>
            ) : (
              visibleTransactions.map((tx, i) => (
                <div
                  key={`${tx.at}-${i}`}
                  onClick={() => { playHaptic('pop'); openReceipt(tx) }}
                  className="flex items-center justify-between py-3 px-2 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`w-10 h-10 rounded-2xl bg-white/[0.03] border border-hair flex items-center justify-center group-hover:scale-105 transition-transform ${tx.type === 'income' ? 'text-accent' : 'text-danger'}`}>
                      {tx.mode === 'Shield' ? '🛡️' : tx.mode === 'Shadow' ? '🕳️' : tx.mode === 'Ghost' ? '👻' : tx.type === 'income' ? '↓' : '↑'}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[14px] font-semibold text-white tracking-tight">{tx.title}</span>
                      <span className="text-[11px] font-medium text-muted">{tx.time}{tx.isPrivate ? ' • 🔒 private' : ' • public'}</span>
                    </div>
                  </div>
                  <span className={`text-[15px] font-bold tracking-tight tnum ${tx.type === 'income' ? 'text-accent' : 'text-danger'}`}>{tx.amount}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* SEND SHEET — keypad + the existing shadow/ghost wiring */}
      <SendDrawer
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        selectedToken={selectedToken}
        privateBalance={tokenBalance(selectedToken)}
        isPrivateMode={isPrivateMode}
        loading={loading}
        notify={notify}
        addTxn={addTxn}
        shadowSend={shadowSend}
        ghostSend={ghostSend}
        sendSol={sendSol}
        mwaAddress={mwaAccount?.address ?? null}
        onSuccess={(details) => setSuccess({ kind: 'send', ...details })}
      />

      {/* SHIELD SHEET — amount picker; the guard and tx stay in shieldNow */}
      <ShieldDrawer
        open={shieldOpen}
        onClose={() => setShieldOpen(false)}
        selectedToken={selectedToken}
        balance={balance}
        loading={loading}
        onRequestAirdrop={requestAirdrop}
        onShield={shieldNow}
      />

      {/* ACTION CONFIRMED — the animated check that ends a Shield or a send */}
      <SuccessOverlay {...(success ?? {})} open={!!success} onClose={() => setSuccess(null)} />

      {/* RECEIVE SHEET */}
      <ReceiveDrawer
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        wallet={wallet}
        vantaAddress={vantaAddress}
        notify={notify}
      />

      {/* RECEIPT SHEET — receiptTxn is kept after close so the exit animation has content */}
      <ReceiptDrawer
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        txn={receiptTxn}
        notify={notify}
      />

      {/* PRIVACY ANALYTICS + ALL ACTIVITY */}
      <ActivityDrawer
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        transactions={transactions}
        filter={txnFilter}
        setFilter={setTxnFilter}
        onOpenReceipt={openReceipt}
      />

      {/* WHAT LEAKS — per-action breakdown */}
      <PrivacySheet open={leakOpen} onClose={() => setLeakOpen(false)} />

      {/* PROFILE SHEET — identity, addresses, and the .vanta handle */}
      <ProfileDrawer
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        vantaAddress={vantaAddress}
        wallet={wallet}
        registered={registered}
        mwaAccount={mwaAccount}
        notify={notify}
        onOpenSettings={() => {
          setProfileOpen(false)
          setSettingsOpen(true)
        }}
      />

      {/* SETTINGS & ACCOUNT */}
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenProfile={() => {
          setSettingsOpen(false)
          setProfileOpen(true)
        }}
        autoShield={autoShield}
        onToggleAutoShield={toggleAutoShield}
        forceResync={forceResync}
        requestAirdrop={requestAirdrop}
        wallet={wallet}
        vantaAddress={vantaAddress}
        zolanaReady={zolanaReady}
        registered={registered}
        loading={loading}
        notify={notify}
        mwaAccount={mwaAccount}
        onDisconnect={disconnectWallet}
        onConnect={connectWalletMwa}
      />
    </div>
  )
}
