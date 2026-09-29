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
import { ModeMark } from './components/Icons'
import SettingsDrawer from './components/SettingsDrawer'
import BackupDrawer from './components/BackupDrawer'
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
import { relayerFetch, faucetFetch, FAUCET_URL } from './lib/config'
import { recordSend, lookupProof, checkProof } from './lib/txHistory'
import {
  clearPendingShield, findLandedDeposit, loadPendingShield, readSlot, savePendingShield,
} from './lib/pendingShield'
import {
  readSlots, readInactive, saveSessionWallet, saveDeviceWallet, activateSlot, clearSlots,
} from './lib/walletStore'
import {
  bytesToBase58, connectMwa, disconnectMwa, initMwa, isMwaAvailable,
  serializeCompiledTx, signAndSendTransactionWithMwa,
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
    return 'The wallet rejected this transaction. Usually your balance does not cover the amount plus the network fee.'
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
  // Some errors are already addressed to the user and carry the action — the MWA
  // path ones name the wallet, and an unknown outcome says what to check. Running
  // those through the "Shield failed:" prefix buries the instruction.
  if (err?.userFacing || err?.outcomeUnknown) return raw
  return `Shield failed: ${raw}`
}

// The one outcome the app must never round off. A wallet that never answers, or
// a chain lookup that itself failed, is NOT evidence that the deposit did not
// happen — the wallet may have broadcast it and lost the reply. Claiming failure
// here invites a second Shield, so say what is true and what to do.
function unknownOutcomeError(cause) {
  const err = new Error(
    'Your wallet did not reply, so this deposit is still unconfirmed. Check your private ' +
    'balance before trying again. If it rose, the Shield did land.',
    { cause },
  )
  err.outcomeUnknown = true
  return err
}

// ── The wallet's reply vs. the chain ──────────────────────────────────────
//
// MWA's answer comes back over a localhost socket between the WebView and the
// wallet app. While the wallet is in the foreground Android stops servicing it,
// so a deposit can land on chain while its reply never arrives — and the Shield
// button then sits on "Shielding…" until the 90s timeout, with no success
// screen, no history row and a balance that only catches up on a manual reload.
// The chain loses nothing: poll it in parallel and take the first answer.
const CHAIN_WATCH_INTERVAL_MS = 2_000
const CHAIN_WATCH_TIMEOUT_MS = 90_000

async function raceWalletReply(walletReply, { depositor, sinceSlot }) {
  let done = false
  const watch = (async () => {
    const deadline = Date.now() + CHAIN_WATCH_TIMEOUT_MS
    while (!done && Date.now() < deadline) {
      const landed = await findLandedDeposit({
        rpcUrl: PUBLIC_RPC,
        depositor,
        sinceSlot,
        notBeforeMs: Date.now() - 120_000,
      })
      if (done) return null
      if (landed) return landed.signature
      await new Promise((resolve) => setTimeout(resolve, CHAIN_WATCH_INTERVAL_MS))
    }
    return null
  })()

  try {
    const winner = await Promise.race([
      walletReply.then((sig) => sig),
      watch.then((sig) => sig),
    ])
    if (winner) return winner
    // The chain found nothing inside the window and the wallet has not answered
    // yet — keep waiting on the wallet, whose rejection or timeout should be the
    // error the user sees (shield's own reconciler checks the chain on the way
    // out, so a lost reply still resolves rather than failing).
    return walletReply
  } finally {
    // Stop the poll whichever way we resolved; otherwise it keeps hitting the
    // RPC for the next 90 seconds after the Shield already finished.
    done = true
  }
}

export default function App() {
  // Read the saved wallet SYNCHRONOUSLY in the initializer, not from the boot
  // effect. With a null first render the app painted the connect-wallet screen
  // for one frame on every reload before the effect restored the wallet and
  // bounced to the dashboard. That flash read as a glitch on returning visits.
  //
  // Custody is two-slot (session + device) with an active pointer — see
  // lib/walletStore.js. `wallet` is whichever slot is active; `inactiveWallet`
  // is the other one, kept alive so its funds stay reachable.
  const [wallet, setWallet] = useState(() => readSlots().wallet)
  const [inactiveWallet, setInactiveWallet] = useState(() => readInactive())
  const [balance, setBalance] = useState(0)
  const [privateBalances, setPrivateBalances] = useState([])
  const [isPrivacyOn, setIsPrivacyOn] = useState(false)
  const [isPrivateMode, setIsPrivateMode] = useState(true) // default ON: shadow send
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  // `status` is a TRANSCRIPT, not a modal: ~20 places write into it and only a
  // few ever clear it. Anything written by a path with no clearer left the
  // banner stuck on screen — after a Shield the "⋯" icon and its line stayed up
  // until the page was reloaded by hand, which is exactly what someone demoing
  // would hit. Every message now dismisses itself, so the banner can only
  // outlive a status that is still being changed.
  useEffect(() => {
    if (!status) return undefined
    const timer = setTimeout(() => setStatus(''), 6000)
    return () => clearTimeout(timer)
  }, [status])
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
  const [backupOpen, setBackupOpen] = useState(false)
  const [backupMode, setBackupMode] = useState('export')
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
  // Incoming-credit watch. See the effect next to addTxn: `synced` arms it only
  // after the first indexer sync has finished, and `armed` then swallows that
  // first snapshot as the baseline — otherwise a cold start would "discover" the
  // user's whole existing private balance and file it as one giant receipt.
  // `expect` lists private-balance increases this app caused itself (a Shield is
  // a deposit into your own private balance, not a payment received) — the effect
  // consumes those entries instead of writing a receipt for them.
  const incomingWatchRef = useRef({ synced: false, armed: false, totals: null, expect: [] })
  // A pre-loaded Shield record is reconciled once, not on every render.
  const pendingShieldCheckedRef = useRef(false)

  // Registered BEFORE a local deposit runs, so it is already there when the
  // balance moves — the effect may fire in a render that happens mid-await.
  // Entries expire so an abandoned Shield cannot swallow a real payment later.
  const expectPrivateCredit = (symbol, value) => {
    const watch = incomingWatchRef.current
    watch.expect = [...(watch.expect ?? []).filter((e) => Date.now() - e.at < 300_000), { symbol, value, at: Date.now() }]
  }

  const dropPrivateCreditExpectation = (symbol, value) => {
    const watch = incomingWatchRef.current
    const index = (watch.expect ?? []).findIndex((e) => e.symbol === symbol && Math.abs(e.value - value) < 1e-6)
    if (index >= 0) watch.expect = watch.expect.filter((_, i) => i !== index)
  }

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
      // Arm the incoming-credit watch (see the effect by addTxn). Set after the
      // sync, so the notes this sync just loaded become the baseline rather than
      // a receipt.
      incomingWatchRef.current.synced = true
      const found = walletRef.current.balances().length
      setStatus(found ? 'Private balance synced ✓' : 'Synced, no private notes found')
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
      // A rescan re-derives every note from the indexer, so the totals go to zero
      // and come back. That is not a payment: re-arm the watch from scratch so
      // the recovery is not filed as an incoming receipt.
      incomingWatchRef.current = { synced: false, armed: false, totals: null }
      localStorage.removeItem('vanta-zwallet')
      walletRef.current = new zk.Wallet({ identity: shieldedKeypairRef.current.shieldedAddress() })
      setPrivateBalances([])
      console.log('[vanta] force resync — cleared local snapshot, rescanned from chain')
      await syncPrivate()
      // The notes are only half of what can look wrong. A user presses this button
      // because a number is stale, and the stale number is often the public one,
      // so the resync asks for a fresh balance read too.
      document.dispatchEvent(new Event('vanta:refresh-public'))
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
        setStatus('Registration failed. You can still Shield and Ghost-send')
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
  // Re-read both slots after any custody change so the dashboard and Settings
  // agree with storage without a reload.
  const refreshWalletSlots = useCallback(() => {
    setWallet(readSlots().wallet)
    setInactiveWallet(readInactive())
  }, [])

  const createWallet = useCallback(async () => {
    setLoading(true)
    setStatus('Generating wallet...')
    try {
      const { Keypair } = await import('@solana/web3.js')
      const keypair = Keypair.generate()
      const data = { publicKey: keypair.publicKey.toBase58(), secretKey: Array.from(keypair.secretKey) }
      const replaced = saveSessionWallet(data)
      if (replaced) console.warn('[vanta] replaced in-app wallet parked:', replaced.publicKey)
      refreshWalletSlots()
      setStatus('Wallet created!')
      await fetchBalance(data.publicKey)
      await initZolana(data)
    } catch (err) {
      setStatus('Error: ' + err.message)
    }
    setLoading(false)
  }, [initZolana, refreshWalletSlots])

  // Read-only balance lookup (no state write) — used by the custody guard, which
  // needs the *outgoing* wallet's balance while the active one is unchanged.
  const readBalance = useCallback(async (pubKey) => {
    try {
      const { Connection, PublicKey } = await import('@solana/web3.js')
      const conn = new Connection(PUBLIC_RPC, 'confirmed')
      return (await conn.getBalance(new PublicKey(pubKey))) / 1e9
    } catch (err) {
      console.error('Balance read error:', err)
      return null
    }
  }, [])

  const fetchBalance = useCallback(async (pubKey) => {
    const bal = await readBalance(pubKey)
    if (bal !== null) setBalance(bal)
  }, [readBalance])

  // The public balance has no push channel: it was read once at boot. Without this,
  // SOL that arrives from a faucet, the relayer's gas float or a Ghost payout stayed
  // invisible until the app restarted, and the Shield sheet quoted (and sized its
  // fee-aware Max from) a balance the chain disagreed with. Poll while visible,
  // refresh on return to the foreground, and refresh on demand when Settings resyncs.
  useEffect(() => {
    const pubKey = wallet?.publicKey
    if (!pubKey) return undefined
    let cancelled = false
    const refreshPublic = () => {
      if (cancelled || document.visibilityState === 'hidden') return
      fetchBalance(pubKey)
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      refreshPublic()
      // Notes can land while the app is backgrounded, so the private side gets the
      // same treatment as the public one.
      syncPrivate()
    }
    refreshPublic()
    const timer = setInterval(refreshPublic, 20_000)
    document.addEventListener('visibilitychange', onVisible)
    document.addEventListener('vanta:refresh-public', refreshPublic)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      document.removeEventListener('vanta:refresh-public', refreshPublic)
    }
  }, [wallet?.publicKey, fetchBalance, syncPrivate])

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
      // Binds the device slot and moves the pointer — the session key survives
      // in its own slot (it used to be overwritten here, stranding its funds).
      const previous = saveDeviceWallet(data)
      refreshWalletSlots()
      setMwaAccount({ address: account.address, label: account.label ?? null })
      setStatus('Wallet connected')
      playHaptic('success')
      await fetchBalance(account.address)
      await initZolana(data)
      // Name the funds we are leaving behind instead of switching silently.
      if (previous?.secretKey && previous.publicKey !== data.publicKey) {
        const stranded = await readBalance(previous.publicKey)
        if (stranded > 0) {
          notify(
            `In-app wallet still holds ${stranded.toFixed(4)} SOL. Kept safe, switch back in Settings to move it.`,
            '⚠️',
          )
        }
      }
    } catch (err) {
      setStatus('Connect failed: ' + (err?.message || err))
      console.error('MWA connect error:', err)
    }
    setLoading(false)
    // `notify` is deliberately NOT in this list: it is declared further down this
    // component, and naming it here would evaluate it during render — before its
    // `const` exists — and throw "cannot access before initialization", which
    // takes the whole app down. It is a stable useCallback([]) either way.
  }, [fetchBalance, initZolana, readBalance, refreshWalletSlots])

  // ── Switch the active public wallet ────────────────────────────────────
  // A pointer move, not a re-bind: nothing is deleted, so the wallet you leave
  // keeps its funds and can be switched back to at any time. The private side
  // (identity X, encrypted notes) is keyed separately and does not move.
  const switchWallet = useCallback(async (mode) => {
    const next = activateSlot(mode)
    if (!next) {
      notify('That wallet is no longer available.', '⚠️')
      refreshWalletSlots()
      return
    }
    playHaptic('tap')
    refreshWalletSlots()
    setLoading(true)
    setStatus('Switching wallet…')
    try {
      // The device wallet stays bound either way — only the pointer moved — so
      // the MWA row keeps showing it. Re-authorize the grant so it can sign.
      if (next.mwa) {
        try {
          const account = await connectMwa()
          setMwaAccount({ address: account.address, label: account.label ?? null })
        } catch (err) {
          console.warn('Wallet switch re-auth failed:', err)
          setMwaAccount((prev) => prev ?? { address: next.publicKey, label: next.label ?? null })
          setStatus('Reconnect your device wallet to sign')
        }
      }
      await fetchBalance(next.publicKey)
      if (next.mwa) {
        setStatus('Device wallet active')
        notify('Now spending from your device wallet.', '🔁')
      } else {
        setStatus('In-app wallet active')
        notify('Now spending from your in-app wallet.', '🔁')
      }
    } finally {
      setLoading(false)
    }
    // Same reasoning as connectWalletMwa above: notify is declared later.
  }, [fetchBalance, refreshWalletSlots])

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnectMwa()
    } catch (err) {
      console.warn('MWA disconnect error:', err)
    }
    // Explicit user action → drop every wallet slot (including any parked
    // copy). The private identity and its encrypted notes go too — and so does
    // the history, which is encrypted for that identity and unreadable without
    // it.
    clearSlots()
    localStorage.removeItem('vanta-zwallet')
    incomingWatchRef.current = { synced: false, armed: false, totals: null }
    import('./lib/localHistory.js')
      .then(({ clearHistory }) => clearHistory())
      .catch(() => {})
    setMwaAccount(null)
    setWallet(null)
    setInactiveWallet(null)
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
    setStatus('Requesting devnet SOL...')
    try {
      // The public devnet faucet (Connection.requestAirdrop) is rate-limited and
      // mostly answers -32603 Internal error, which made this button look broken.
      // Vanta runs its own faucet as a separate service with a separate wallet,
      // so a judge whose wallet is empty still gets enough to Shield, Shadow
      // and Ghost — and a drain can never touch the relayer's fee float.
      if (!FAUCET_URL) throw new Error('Faucet not configured (VITE_FAUCET_URL)')
      const res = await faucetFetch('/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet.publicKey }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      await fetchBalance(wallet.publicKey)
      setStatus(`Received ${data.amount} SOL from the faucet!`)
      playHaptic('success')
    } catch (err) {
      setStatus('Faucet failed: ' + err.message)
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

    // ⚠ DO NOT put the relayer back in this branch (trialed 2026-09-27 → 09-28).
    // With the relayer as fee payer the deposit needs TWO signatures, and the
    // wallet's one has to be lifted back out of whatever payload it returns.
    // On a real phone that payload's signature did not verify against the
    // message we relay (Solflare, devnet, 3/3 attempts): every Shield died as
    // the RPC's nameless "Transaction did not pass signature verification",
    // which names no signer and points at nothing. Worse, the relayer's only
    // check is `length === 64`, so 64 bytes of not-a-signature passed the client,
    // passed the relayer, and only failed on chain.
    //
    // Sign-and-send costs the device wallet its own ~5,000 lamports of fee and
    // leaves it as the deposit's initiator. That is a real disclosure, but the
    // deposit is public by design (it names the depositor and the amount — see
    // HANDOFF §9), the relayer is out of the trust path entirely, and this is the
    // shape that was verified on a physical phone on 2026-09-26. The in-app
    // wallet — whose seed this app holds, so it can sign a slot we asked for —
    // keeps the relayer-sponsored fee payer below.
    const useMwa = !!wallet.mwa
    const depositParams = {
      client,
      feePayer: useMwa ? wallet.publicKey : relayerAddressRef.current,
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

    // Written down BEFORE anything is broadcast and cleared only once the outcome
    // is known. If the wallet's reply is lost — or the page does not survive it —
    // this is what lets the deposit be found on chain instead of reported as a
    // failure it never was. See lib/pendingShield.js.
    const sinceSlot = await readSlot(PUBLIC_RPC)
    savePendingShield({ amount, symbol: tokenInfo.symbol, depositor: wallet.publicKey, sinceSlot })

    let sig
    try {
      if (useMwa) {
        // One signer (the wallet is depositor AND fee payer), so it signs the whole
        // deposit and broadcasts it itself — Vanta never sees the key, and there is
        // no foreign signature to recover from its reply.
        const { bytes } = serializeCompiledTx(deposit)
        // Whichever arrives first: the wallet's signature, or the deposit itself
        // landing on chain. See raceWalletReply.
        sig = await raceWalletReply(
          signAndSendTransactionWithMwa(bytes).then(bytesToBase58),
          { depositor: wallet.publicKey, sinceSlot },
        )
      } else {
        sig = await relayTx(kit, client, deposit, [
          { address: wallet.publicKey, seed: new Uint8Array(wallet.secretKey.slice(0, 32)) },
        ])
      }
    } catch (err) {
      // The call failed. That is not the same as the deposit not happening: the
      // wallet can broadcast and lose its answer, and a relay can answer with an
      // error for a transaction the node already has. Ask the chain.
      let landed
      try {
        landed = await findLandedDeposit({
          rpcUrl: PUBLIC_RPC,
          depositor: wallet.publicKey,
          sinceSlot,
          notBeforeMs: Date.now() - 120_000,
        })
      } catch (lookupErr) {
        // The lookup failed, which tells us nothing either way. Leave the record
        // alone so the next load can try again.
        console.warn('[vanta] could not check the chain for this deposit:', lookupErr?.message ?? lookupErr)
        throw unknownOutcomeError(err)
      }
      if (!landed) {
        // The chain is the authority: nothing of ours landed, so this really did
        // fail and the record has no business surviving.
        clearPendingShield()
        throw err
      }
      console.warn('[vanta] wallet reply lost — the deposit is on chain anyway:', landed.signature)
      sig = landed.signature
    }
    clearPendingShield()

    // ── Everything below is bookkeeping, and it runs in the background ──
    // The deposit is on chain the moment we hold its signature. The success
    // screen, the history row and the balance are what the user is waiting for,
    // and none of them may wait on a confirm round-trip, on the private-balance
    // settle (up to ~20s of retries by design), or on a relayer report that took
    // ~10s to answer on its own status endpoint. Holding the receipt hostage to
    // them is what left a CONFIRMED Shield staring at a spinner with no row and a
    // stale balance until the page was reloaded by hand.
    ;(async () => {
      const slot = await client.confirmTransaction(sig)
      await syncAfterSend(slot, zk, before)
      await fetchBalance(wallet.publicKey)
      // Shield history: the relayer observed this one only when it paid for it.
      // A device-wallet Shield never touches the relayer, so it has to be reported
      // like a Shadow — otherwise the row exists only on this device and its
      // receipt can never say "On chain". `actor` is the shielded identity, whose
      // seed is here, so the report can be signed without a phone approval prompt.
      await recordSend({
        signature: sig,
        mode: 'Shield',
        actor: signerRef.current?.address,
        addresses: [signerRef.current?.address],
        relayerObserved: !useMwa,
      })
    })().catch((err) => {
      // The money moved, so this is never a Shield failure: the row and the
      // success screen are already up. Report it as a receipt problem and force
      // both balances so nothing depends on the user finding the refresh gesture.
      //
      // Deliberately `setStatus`, not `notify`: `notify` is declared further down
      // this file, so naming it in this callback's deps array is a temporal-dead-
      // zone crash on every render (it was, and it blanked the app). `setStatus`
      // is the stable setter and drives the same banner.
      console.warn('[vanta] Shield landed but bookkeeping failed:', err?.message ?? err)
      setStatus('🛡️ Shield landed. Your receipt could not be attached yet. It will be attached on the next refresh.')
      fetchBalance(wallet.publicKey).catch(() => {})
      syncPrivate().catch(() => {})
    })

    return sig
  }, [wallet, fetchBalance, privateStateSignature, syncAfterSend, syncPrivate])

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
    // No amount, no recipient: the relayer is told a signature exists and asked
    // whether it landed, nothing more. Those two facts stay on this device.
    await recordSend({
      signature: sig,
      mode: 'Shadow',
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
    const data = readSlots().wallet
    if (!data) return
    setWallet(data)
    setInactiveWallet(readInactive())
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

  // ── History persistence ──────────────────────────────────────────────
  // Rows are written to an encrypted on-device store so Activity and its
  // receipts survive a restart (AUDIT-2026-09-27 H1 — they used to live in React
  // state only and vanished on every reload while the relayer kept the anchors).
  // It is also the only place an amount or a recipient is kept at all now that
  // the relayer stores neither (C2).
  //
  // `historyLoaded` is the guard that matters: persisting before hydration would
  // write the empty initial state over the real history on every cold start.
  const [historyLoaded, setHistoryLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Lazy import: the cipher is not needed for the first paint. If the identity
    // does not exist yet, loadHistory returns [] without touching the store.
    import('./lib/localHistory.js')
      .then(({ loadHistory }) => {
        if (cancelled) return
        const rows = loadHistory()
        if (rows.length) setTransactions((prev) => (prev.length ? prev : rows))
      })
      .catch((err) => console.warn('[history] hydrate failed:', err?.message ?? err))
      .finally(() => {
        if (!cancelled) setHistoryLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!historyLoaded) return
    import('./lib/localHistory.js')
      .then(({ saveHistory }) => saveHistory(transactions))
      .catch((err) => console.warn('[history] persist failed:', err?.message ?? err))
  }, [transactions, historyLoaded])

  // ── A Shield from before this page load ────────────────────────────────
  // The reconcile inside `shield` covers a lost wallet reply while the page is
  // alive. This covers the same failure when the page did not survive it — a
  // reload, a pull-to-refresh, or Android reclaiming the WebView. On 2026-09-28
  // exactly that pairing left a real 0.05 SOL deposit with no row at all: the
  // money was on chain, the private balance had risen, and Activity said "No
  // transactions yet". The record outlives the page, so the deposit gets its row
  // and its receipt instead of vanishing.
  //
  // Gated on `vantaAddress`: that is set once the shielded identity exists, which
  // is what the relayer report needs to be signed.
  useEffect(() => {
    if (!vantaAddress || pendingShieldCheckedRef.current) return
    const pending = loadPendingShield()
    if (!pending) return
    pendingShieldCheckedRef.current = true
    let cancelled = false
    ;(async () => {
      try {
        const landed = await findLandedDeposit({
          rpcUrl: PUBLIC_RPC,
          depositor: pending.depositor,
          sinceSlot: pending.sinceSlot,
          // A minute of slack on the record's own timestamp: the deposit is sent
          // after it is written, so its block time is always later.
          notBeforeMs: (pending.at ?? 0) - 60_000,
        })
        if (cancelled) return
        clearPendingShield()
        if (!landed) {
          console.log('[vanta] pending Shield did not land — nothing to restore')
          return
        }
        console.log('[vanta] restored a pending Shield from chain:', landed.signature)
        // Same reservation as a live Shield: the note this deposit created is
        // ours, so the credit watch must not file it as a payment received.
        expectPrivateCredit(pending.symbol, pending.amount)
        addTxn(
          `Shielded ${pending.amount} ${pending.symbol}`,
          `+${pending.amount} ${pending.symbol}`,
          'income',
          true,
          {
            mode: 'Shield',
            symbol: pending.symbol,
            value: pending.amount,
            signature: landed.signature,
            status: 'Confirmed',
          },
        )
        notify(`Your earlier Shield of ${pending.amount} ${pending.symbol} did land. Receipt restored.`, '🛡️')
        await recordSend({
          signature: landed.signature,
          mode: 'Shield',
          actor: signerRef.current?.address,
          addresses: [signerRef.current?.address],
          relayerObserved: false,
        })
      } catch (err) {
        // Nothing here may break the app: the balance sync is the real source of
        // truth and it has already run.
        console.warn('[vanta] pending Shield could not be reconciled:', err?.message ?? err)
      }
    })()
    return () => { cancelled = true }
  }, [vantaAddress])

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

  // ── Incoming private credits ──────────────────────────────────────────
  // A Shadow send used to be invisible on the receiving side: the notes landed,
  // the private balance rose, and Activity stayed empty (the 2026-09-27 audit
  // filled a counterparty wallet and found zero rows on it). Which makes the
  // two-party story — the reason a handle and a private address exist — the one
  // thing the app could not show.
  //
  // The sync path already produces the only signal there is: spendable private
  // totals per mint. A credit is a strictly positive delta after a sync. There is
  // deliberately no signature on such a row — a note is found by scanning the
  // pool, not by following a link, so the sender's transaction is not known to
  // this device and inventing a reference would be a lie on a receipt.
  useEffect(() => {
    const watch = incomingWatchRef.current
    const synced = watch.synced
    const next = Object.fromEntries(privateBalances.map((row) => [row.symbol, row.amount]))
    if (!synced) return
    if (!watch.armed) {
      watch.armed = true
      watch.totals = next
      return
    }
    const before = watch.totals ?? {}
    watch.totals = next
    for (const [symbol, amount] of Object.entries(next)) {
      const delta = Number(amount) - Number(before[symbol] ?? 0)
      if (delta > 1e-9) {
        const rounded = Number(delta.toFixed(6))
        // A deposit this app just made into its own private balance is not a
        // payment received. Caught live on 2026-09-28: a single 0.05 Shield
        // produced a phantom "Received 0.05 SOL privately" row, which would put
        // a lie on a receipt.
        const expected = (watch.expect ?? []).findIndex(
          (e) => e.symbol === symbol && Math.abs(e.value - rounded) < 1e-6 && Date.now() - e.at < 300_000,
        )
        if (expected >= 0) {
          watch.expect = watch.expect.filter((_, i) => i !== expected)
          continue
        }
        addTxn(`Received ${rounded} ${symbol} privately`, `+${rounded} ${symbol}`, 'income', true, {
          mode: 'Shadow',
          symbol,
          value: rounded,
          status: 'Confirmed',
          incoming: true,
        })
        notify(`Received ${rounded} ${symbol} into your private balance`, '🎁')
      }
    }
  }, [privateBalances, addTxn, notify])

  const openReceipt = (txn) => {
    setReceiptTxn(txn)
    setReceiptOpen(true)

    // The receipt sheet only READS a cached proof key — it never queries
    // anything. A row whose one report failed (history unreachable when it was
    // recorded) therefore had no path back to "Confirmed on chain": it was
    // grey for the life of the install while the transaction sat there
    // confirmed. Ask now, and update the row so the open sheet upgrades in
    // place instead of staying "Not checked".
    // Logged because "why is this receipt still Not checked" cannot be answered
    // from the sheet itself, and this only ever runs once per tap.
    const cached = txn?.signature ? lookupProof(txn.signature) : 'no-signature'
    console.log('[tx] receipt opened', {
      sig: txn?.signature ? txn.signature.slice(0, 12) : null,
      rowProof: txn?.proof ?? null,
      cached,
      signable: [vantaAddress, wallet?.publicKey].filter(Boolean).length,
    })
    if (!txn?.signature || txn?.proof || cached) return
    checkProof(txn.signature, [vantaAddress, wallet?.publicKey], {
      mode: txn.mode,
      actor: vantaAddress,
    })
      .then((proof) => {
        if (!proof) return
        setTransactions((prev) =>
          prev.map((t) => (t.signature === txn.signature ? { ...t, proof } : t)),
        )
        setReceiptTxn((current) =>
          current?.signature === txn.signature ? { ...current, proof } : current,
        )
      })
      .catch((err) => console.warn('[tx] receipt re-check failed:', err?.message ?? err))
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
    // Declared before the deposit runs: this is a balance increase we caused, so
    // the incoming-credit watch must not file it as a payment received.
    expectPrivateCredit(symbol, amt)
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
      // Drop the reservation only when we know the deposit did not happen —
      // otherwise a real payment of the same size later would be swallowed as
      // "ours". An UNKNOWN outcome is not that: the note may still be coming, and
      // giving up the reservation here would file it as "Received … privately",
      // a receipt for a payment the user made to themselves.
      if (!err?.outcomeUnknown) dropPrivateCreditExpectation(symbol, amt)
      notify(shieldErrorMessage(err), '⚠️')
      console.error(err)
    } finally {
      // Both belong to THIS attempt, on every path. Leaving `loading` set is why
      // the button stayed disabled, and leaving `status` set is why the banner
      // stayed up, after a wallet that rejected or never came back.
      setLoading(false)
      setStatus('')
    }
  }

  // ── Asset rail ───────────────────────────────────────────────────────
  // Static metadata only — the amounts are read at render time. Public dUSDC
  // has no balance read in this build, so it renders as an em dash rather than
  // a fabricated figure.
  const ASSET_RAIL = [
    {
      key: 'SOL',
      name: 'Solana',
      // Wells stay neutral. The mark used to be Solana's brand GRADIENT
      // (#00FFA3 -> #DC1FFF), which on a near-black card was the single most
      // saturated thing on the screen — the opposite of the rest of the app.
      // Solana's own dark-mode treatment is the plain white symbol, so that is
      // what this is: same three bars, no gradient, no glow.
      well: 'bg-sunken border-hair',
      icon: (
        <svg className="relative z-10 w-[18px] h-[18px] text-white/85" viewBox="0 0 397 311" fill="currentColor" aria-hidden="true">
          <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" />
          <path d="M64.6 3.8C67 1.4 70.3 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" />
          <path d="M332.4 120.9c-2.4-2.4-5.7-3.8-9.2-3.8H5.8c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" />
        </svg>
      ),
    },
    {
      key: 'dUSDC',
      name: 'Private USD Coin',
      well: 'bg-sunken border-hair',
      // Was a bare bold "$". Drawn as the actual coin instead — ring, stem and
      // S — in a blue that has been lifted for a dark surface: #2775CA is the
      // brand colour but sits too dim on near-black to read at 20px.
      icon: (
        <svg
          className="relative z-10 w-[18px] h-[18px] text-[#5FA3E4]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 6.9v10.2" />
          <path d="M14.5 9.2c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 1.9 0 1.2 1 1.7 2.6 2 1.7.3 2.8.9 2.8 2.1 0 1.3-1.2 2.1-2.8 2.1-1.3 0-2.3-.5-2.8-1.4" />
        </svg>
      ),
    },
  ]

  // Totals for the transactions header. History lives only on this device —
  // encrypted, and readable only while the identity that wrote it exists — so
  // these are "what this device remembers", not a fabricated all-time figure.
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
          {/* Was a rounded tile with its own border, shadow and violet tint. The
              mark is white-on-transparent, so it was really a lighter box sitting
              on the canvas with the logo pasted onto it — the loading screen read
              as a panel, not as a brand mark. It now sits on the canvas like every
              other mark in the app, with the padding the art actually needs. */}
          <img
            src={vantaLogo}
            alt=""
            aria-hidden="true"
            className="h-20 w-20 object-contain"
          />
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
            className="btn-accent tap w-full max-w-[300px] disabled:opacity-50"
          >
            {loading ? 'Connecting…' : 'Connect device wallet'}
          </button>
          <button
            onClick={() => { playHaptic('tap'); createWallet() }}
            disabled={loading}
            className="btn-quiet tap w-full max-w-[300px] disabled:opacity-50"
          >
            Use a throwaway in-app wallet
          </button>
          <p className="text-[11px] text-muted max-w-[300px] leading-snug">
            Seed Vault / Phantom / Solflare holds your funds. Vanta never stores that key.
          </p>
          {!mwaAvailable && (
            <p className="text-[10px] text-muted/70 max-w-[300px] leading-snug">
              No wallet app detected. Install Phantom or Solflare, or use a Seeker.
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
          aria-label="Receive. Show QR code"
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
              legend line read as clutter and got pulled. A status marker is where
              "so what does 'Shielded' actually mean?" already gets asked, so the
              sheet stays one tap away with zero added surface.

              No pill either. A bordered card around a dot and a word made the
              header read as two competing pieces of chrome; the indicator is the
              dot and the word, and the whole thing is still the tap target. */}
          <button
            onClick={() => { playHaptic('tap'); setLeakOpen(true) }}
            aria-label="Engine status. Tap for what Vanta hides and what it exposes"
            title="Tap for what Vanta hides and what it exposes"
            className="flex items-center gap-1.5 px-1.5 py-2 tap active:scale-95"
          >
            <span
              className={`pulse-dot shrink-0 ${
                zolanaReady ? (registered ? 'text-accent' : 'text-amber-400') : 'text-white/30'
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
            <p className="font-display text-muted text-[13px] font-normal mb-2 tracking-normal">Private balance</p>

            {/* The display face, tight-tracked, exactly as the site sets its hero
                figure — this is the one number the whole app is built around, so
                it is where the type change has to be unmistakable. */}
            <div className="flex items-baseline gap-3">
              <span className="font-display text-[60px] leading-none font-normal tracking-[-0.035em] text-white tnum">
                {tokenBalance(selectedToken).toFixed(selectedToken === 'SOL' ? 3 : 2)}
              </span>
              <span className="font-display text-2xl font-normal text-white/80 tracking-tight">
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

             The marks now sit ON the button instead of inside a 32px well. The
             well was doing real damage: a bordered box inside a 60px button left
             the label ~55px, so the sub-label wrapped and the icon appeared to
             shove the text sideways. With no well there is room for both lines at
             their natural width, and a greyed-out stroke mark reads as decoration
             rather than as a second button. */}
        <section className="grid grid-cols-[1fr_1fr_auto] gap-3 mb-5">
          <button
            onClick={() => { playHaptic('pop'); setShieldOpen(true) }}
            disabled={loading}
            className="glass-btn h-[60px] rounded-[22px] px-4 flex items-center gap-3 tap duration-200 disabled:opacity-50"
          >
            {/* Shield + keyhole. The plain shield silhouette read as stock clip-art;
                the keyhole says "vault" and gives the glyph a centre to sit on. */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-white/35">
              <path d="M12 2.5 5 5.7v5.4c0 4.4 3 8.1 7 9.4 4-1.3 7-5 7-9.4V5.7L12 2.5Z" />
              <circle cx="12" cy="10.8" r="1.5" />
              <path d="M12 12.3V15" />
            </svg>
            <span className="flex flex-col text-left min-w-0 gap-1">
              <span className="font-display font-semibold text-[15px] text-white tracking-tight leading-none">Shield</span>
              <span className="text-[10px] text-muted leading-none">Set amount</span>
            </span>
          </button>

          <button
            onClick={() => { playHaptic('pop'); setSendOpen(true) }}
            className="glass-btn h-[60px] rounded-[22px] px-3 flex items-center gap-2.5 tap duration-200"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-white/35">
              <path d="M12 20V4m0 0l-6 6m6-6l6 6" />
            </svg>
            <span className="flex flex-col text-left min-w-0 gap-1">
              <span className="font-display font-semibold text-[15px] text-white tracking-tight leading-none">Send</span>
              <span className="text-[10px] text-muted leading-none">{isPrivateMode ? 'Shadow' : 'Ghost'}</span>
            </span>
          </button>

          <button
            onClick={() => { playHaptic('pop'); setReceiveOpen(true) }}
            aria-label="Receive. Show QR code"
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
          className={`w-full rounded-[20px] p-4 mb-6 flex items-center justify-between tap cursor-pointer ${
            isPrivateMode ? 'bg-accent/10 border border-accent/30' : 'bg-card ring-card'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isPrivateMode ? 'bg-accent/20 text-accent' : 'bg-white/5 text-muted'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <div className="flex flex-col">
              <span className="font-display text-[14px] font-semibold text-white">{isPrivateMode ? 'Shadow send' : 'Ghost send'}</span>
              <span className="text-[11px] text-muted">
                {isPrivateMode
                  ? 'Vanta to Vanta · amount and counterparty hidden'
                  : 'Vanta to any wallet · arrives from the pool, not you'}
              </span>
            </div>
          </div>            <div className={`w-12 h-7 shrink-0 rounded-full tap flex items-center px-0.5 ${isPrivateMode ? 'bg-accent' : 'bg-white/10'}`}>
            <div className={`w-6 h-6 rounded-full bg-white shadow-md transition-transform ${isPrivateMode ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
        </div>

        {/* The site's hatched band used to sit here as a section break. On the
            site it divides long editorial blocks; here it landed between the
            send-mode card and the Transactions header, where it read as a stray
            half-drawn rule rather than as a device — and the mode card already
            carries its own mb-6, so the spacing is unchanged without it. */}

        {/* TRANSACTIONS */}
        <section className="flex-1 flex flex-col">
          {/* Header bar — real date, real session totals */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-display text-muted text-[14px] font-normal tracking-normal">Transactions</p>
              <button
                onClick={() => { playHaptic('tap'); setActivityOpen(true) }}
                className="font-display text-[12px] font-semibold text-accent hover:text-white transition-colors"
              >
                View all
              </button>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="font-mono text-[13px] tracking-widest text-white/90 font-semibold uppercase">
                Today, {todayLabel}
              </span>
              {/* Empty state stays empty: a "today" row of +0.000 / -0.000 with no
                  activity reads as a broken number rather than a zero. */}
              {transactions.length > 0 && (
                <div className="flex items-center gap-3 font-mono text-[13px]">
                  <span className="text-accent font-medium tnum">+{sessionIn.toFixed(3)}</span>
                  <span className="text-muted font-medium tnum">-{sessionOut.toFixed(3)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Asset rail — also the token selector, showing private vs public */}
          <div className="flex flex-col gap-3 mb-5">
            {ASSET_RAIL.map((asset) => {
              const active = selectedToken === asset.key
              const priv = tokenBalance(asset.key)
              const pub = asset.key === 'SOL' ? `${balance.toFixed(4)} SOL` : 'n/a'
              return (
                <button
                  key={asset.key}
                  onClick={() => { playHaptic('pop'); setSelectedToken(asset.key) }}
                  className={`asset-card rounded-[22px] p-4 flex items-center justify-between text-left active:scale-[0.99] tap ${
                    active ? 'border-accent/45' : ''
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`relative w-11 h-11 shrink-0 rounded-full border flex items-center justify-center overflow-hidden ${asset.well}`}>
                      {asset.icon}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-display font-medium text-[16px] text-white leading-snug">{asset.name}</span>
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
              // The dashboard is a summary, not the ledger: the four most recent
              // rows and a route to the rest. It used to print the entire history,
              // which grew the home screen without bound and buried the balance and
              // the actions under it — and made "View all →" pointless, since
              // everything was already on screen.
              visibleTransactions.slice(0, 4).map((tx, i) => (
                <div
                  key={`${tx.at}-${i}`}
                  onClick={() => { playHaptic('pop'); openReceipt(tx) }}
                  className="flex items-center justify-between py-3 px-2 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5">
                    {/* The mark is the flow (shield / vault / pool-out), and it
                        tints by DIRECTION: accent when money arrives, the neutral
                        outgoing grey when it leaves. */}
                    <div className={`w-10 h-10 shrink-0 rounded-2xl bg-white/[0.03] border border-hair flex items-center justify-center group-hover:scale-105 transition-transform ${tx.type === 'income' ? 'text-accent' : 'text-out'}`}>
                      <ModeMark mode={tx.mode} type={tx.type} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-display text-[14px] font-semibold text-white tracking-tight truncate">{tx.title}</span>
                      <span className="text-[11px] font-medium text-muted">{tx.time}{tx.isPrivate ? ' · private' : ' · public'}</span>
                    </div>
                  </div>
                  <span className={`font-display text-[15px] font-bold tracking-tight tnum shrink-0 ${tx.type === 'income' ? 'text-accent' : 'text-out'}`}>{tx.amount}</span>
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
        inactiveWallet={inactiveWallet}
        onSwitchWallet={switchWallet}
        onDisconnect={disconnectWallet}
        onConnect={connectWalletMwa}
        onBackup={() => {
          setSettingsOpen(false)
          setBackupMode('export')
          setBackupOpen(true)
        }}
        onRestore={() => {
          setSettingsOpen(false)
          setBackupMode('import')
          setBackupOpen(true)
        }}
      />

      <BackupDrawer
        open={backupOpen}
        mode={backupMode}
        notify={notify}
        onClose={() => setBackupOpen(false)}
        // A restored identity has to be re-derived (notes resync, keys reload),
        // and every in-memory ref still points at the old one — a reload is both
        // the simplest and the only honest way to finish the restore.
        onRestored={() => setTimeout(() => window.location.reload(), 900)}
      />
    </div>
  )
}
