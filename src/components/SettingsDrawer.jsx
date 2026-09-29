import Drawer from './Drawer'
import { playHaptic } from '../lib/haptic'
import { copyText } from '../lib/clipboard'
import { IconLock } from './Icons'

const row =
  'btn-quiet tap w-full flex items-center justify-between gap-3 text-left font-semibold'

// Settings & account sheet. Uses gemini-code's row grammar (label left, status
// pill / chevron right) but every row is a real Vanta action — none of the
// template's decorative "Card Limits" / "Linked Bank Accounts" stubs.
export default function SettingsDrawer({
  open,
  onClose,
  onOpenProfile,
  autoShield,
  onToggleAutoShield,
  forceResync,
  requestAirdrop,
  wallet,
  vantaAddress,
  zolanaReady,
  registered,
  loading,
  notify,
  mwaAccount,
  inactiveWallet,
  onSwitchWallet,
  onDisconnect,
  onConnect,
  onBackup,
  onRestore,
}) {
  const deviceActive = Boolean(wallet?.mwa) || Boolean(mwaAccount && !inactiveWallet)
  const engine = !zolanaReady
    ? { label: 'Starting', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/20' }
    : registered
      ? { label: 'Ready', tone: 'text-accent bg-accent/10 border-accent/20' }
      : { label: 'Shield only', tone: 'text-danger bg-danger/10 border-danger/20' }

  return (
    <Drawer open={open} onClose={onClose} title="Settings & account" subtitle="Vanta · privacy wallet">
      <div className="flex flex-col gap-2">
        <button
          onClick={() => {
            playHaptic('tap')
            onOpenProfile?.()
          }}
          className={row}
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-sm">Profile & Vanta name</span>
            <span className="text-[10px] font-medium text-muted leading-snug">
              Your handle, your addresses, and your registration state.
            </span>
          </span>
        </button>

        <button onClick={onToggleAutoShield} className={row}>
          <span className="flex flex-col gap-0.5">
            <span className="text-sm">Auto-shield incoming SOL</span>
            <span className="text-[10px] font-medium text-muted leading-snug">
              Preview: not wired yet. Shielding stays manual for now.
            </span>
          </span>
          <span
            className={`w-12 h-7 shrink-0 rounded-full tap flex items-center px-0.5 ${
              autoShield ? 'bg-accent' : 'bg-white/10'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full bg-white shadow-md transition-transform ${
                autoShield ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>

        <button
          onClick={() => {
            playHaptic('tap')
            forceResync()
          }}
          className={row}
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-sm">Force resync from chain</span>
            <span className="text-[10px] font-medium text-muted leading-snug">
              Clears the local note cache and rescans the indexer. Use if a Shield or Shadow doesn’t
              show up.
            </span>
          </span>
        </button>

        <button
          onClick={() => {
            playHaptic('tap')
            requestAirdrop()
          }}
          disabled={loading}
          className={`${row} disabled:opacity-50`}
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-sm">Request devnet airdrop</span>
            <span className="text-[10px] font-medium text-muted leading-snug">
              Sends 1 test SOL to your public address so you have something to Shield.
            </span>
          </span>
        </button>

        <button
          onClick={() => {
            playHaptic('tap')
            onBackup?.()
          }}
          disabled={loading}
          className={`${row} disabled:opacity-50`}
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-sm">Back up this device</span>
            <span className="text-[10px] font-medium text-muted leading-snug">
              Encrypt your shielded identity and in-app wallet into one text blob. Without it, a
              reinstall loses the private balance for good.
            </span>
          </span>
          <span className="text-muted">
            <IconLock size={16} />
          </span>
        </button>

        <button
          onClick={() => {
            playHaptic('tap')
            onRestore?.()
          }}
          disabled={loading}
          className={`${row} disabled:opacity-50`}
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-sm">Restore from backup</span>
            <span className="text-[10px] font-medium text-muted leading-snug">
              Paste a backup from this or another phone to rebuild the same identity here.
            </span>
          </span>
        </button>

        <div className="w-full py-3.5 px-4 rounded-2xl bg-white/5 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-white">Privacy engine</span>
          <span className={`text-[11px] font-bold px-2 py-1 rounded border ${engine.tone}`}>
            {engine.label}
          </span>
        </div>

        <div className="w-full py-3.5 px-4 rounded-2xl bg-white/5 flex items-center justify-between gap-3">
          <span className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-semibold text-white">Device wallet (MWA)</span>
            <span className="text-[10px] font-medium text-muted leading-snug">
              {mwaAccount
                ? deviceActive
                  ? 'Connected. Active, signs your public funds'
                  : 'Connected. Bound, not currently active'
                : 'Not connected'}
            </span>
            {mwaAccount && (
              <span className="text-[10px] font-mono text-white/70 break-all">
                {mwaAccount.address}
              </span>
            )}
          </span>
          {mwaAccount ? (
            <button
              onClick={() => {
                playHaptic('tap')
                onDisconnect?.()
              }}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-danger/15 border border-danger/30 text-danger font-semibold text-[11px] hover:bg-danger/25 active:scale-95 tap"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => {
                playHaptic('tap')
                onConnect?.()
              }}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-accent/15 border border-accent/30 text-accent font-semibold text-[11px] hover:bg-accent/25 active:scale-95 tap"
            >
              Connect
            </button>
          )}
        </div>

        {/* Switching wallets is a pointer move: the wallet you leave keeps its
            key and its funds, so nothing can be stranded by connecting or
            switching. That was the H6 bug — connecting used to overwrite the
            session key outright. */}
        {inactiveWallet && (
          <button
            onClick={() => {
              playHaptic('tap')
              onSwitchWallet?.(inactiveWallet.mwa ? 'device' : 'session')
            }}
            disabled={loading}
            className={`${row} disabled:opacity-50`}
          >
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm">
                Switch to {inactiveWallet.mwa ? 'device wallet' : 'in-app wallet'}
              </span>
              <span className="text-[10px] font-mono text-white/70 break-all">
                {inactiveWallet.publicKey}
              </span>
              <span className="text-[10px] font-medium text-muted leading-snug">
                Both wallets stay stored. Switching moves which one pays. Switch back any time to
                move funds out of the other.
              </span>
            </span>
          </button>
        )}
      </div>

      <div className="w-full rounded-2xl p-4 bg-black/40 border border-white/10 flex flex-col gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Your addresses
        </span>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted uppercase tracking-wider">Public (on-ramp)</span>
          <span className="text-[11px] font-mono text-white/90 break-all">{wallet.publicKey}</span>
          <button
            onClick={() => copyText(wallet.publicKey, notify, 'Public address copied!', '📥')}
            className="self-start mt-1 px-3 py-1.5 rounded-xl bg-white/10 border border-hair font-semibold text-white text-[11px] hover:bg-white/20 active:scale-95 tap"
          >
            Copy
          </button>
        </div>

        <div className="w-full h-px bg-white/10" />

        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted uppercase tracking-wider">
            Vanta private (Shadow receive)
          </span>
          <span className="text-[11px] font-mono text-accent break-all">
            {vantaAddress || 'initializing…'}
          </span>
          <button
            disabled={!vantaAddress}
            onClick={() => copyText(vantaAddress, notify, 'Vanta address copied!', '🕳️')}
            className="self-start mt-1 px-3 py-1.5 rounded-xl bg-accent/15 border border-accent/30 font-semibold text-accent text-[11px] hover:bg-accent/25 active:scale-95 tap disabled:opacity-40"
          >
            Copy
          </button>
        </div>
      </div>

      <span className="text-[10px] text-muted leading-relaxed">
        {mwaAccount
          ? 'Devnet build. Unaudited, not for real funds. Your public funds are signed by your device wallet; Vanta stores only the shielded spending key.'
          : 'Devnet build. Unaudited, not for real funds. Keys live in this browser’s localStorage only.'}
        {' '}The shielded spending key is stored in plaintext so the in-app prover can read it; the
        note and history stores are encrypted with a key derived from it, so their encryption
        protects against a stray storage dump, not against anyone holding this device’s seed. Back
        up before you wipe.
      </span>
    </Drawer>
  )
}
