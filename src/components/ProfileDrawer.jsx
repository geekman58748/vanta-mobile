import { useEffect, useRef, useState } from 'react'
import Drawer from './Drawer'
import { playHaptic } from '../lib/haptic'
import { copyText } from '../lib/clipboard'
import { shortAddr } from '../lib/format'
import { checkName, claimName, ownedNames } from '../lib/names'
import { VANTA_NAME_SUFFIX } from '../lib/config'

const COPY_ICON = (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
)

const addressRow = (label, value, onCopy, tone) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] text-muted uppercase tracking-wider">{label}</span>
    <span className={`text-[11px] font-mono break-all ${tone}`}>{value}</span>
    <button
      onClick={onCopy}
      className={`self-start mt-1 px-3 py-1.5 rounded-xl border font-semibold text-[11px] transition-all active:scale-95 flex items-center gap-1.5 ${
        tone === 'text-muted'
          ? 'bg-white/10 border-hair text-white'
          : 'bg-accent/15 border-accent/30 text-accent hover:bg-accent/25'
      }`}
    >
      {COPY_ICON}
      Copy
    </button>
  </div>
)

/**
 * Profile sheet — identity, addresses, and the `.vanta` handle.
 *
 * Why a Profile sheet and not a Settings row: a handle is who you are, not a
 * preference. It is also the thing you paste to someone, so it lives where your
 * addresses live.
 *
 * The claim is three decisions in one screen — type it, see exactly which address
 * it will bind to, then sign. The target address is deliberately shown *before*
 * signing: binding is a one-handle-per-owner operation, so making the irreversible
 * part explicit is worth the extra line.
 */
export default function ProfileDrawer({
  open,
  onClose,
  vantaAddress,
  wallet,
  registered,
  mwaAccount,
  notify,
  onOpenSettings,
}) {
  const [owned, setOwned] = useState([])
  const [loadingOwned, setLoadingOwned] = useState(false)
  const [name, setName] = useState('')
  const [lookup, setLookup] = useState({ state: 'idle' })
  const [claiming, setClaiming] = useState(false)
  const debounceRef = useRef(null)

  // Refresh the handle list every time the sheet opens — it can change elsewhere.
  useEffect(() => {
    if (!open || !vantaAddress) return
    setLoadingOwned(true)
    let cancelled = false
    ownedNames(vantaAddress)
      .then((rows) => {
        if (!cancelled) setOwned(rows)
      })
      .finally(() => {
        if (!cancelled) setLoadingOwned(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, vantaAddress])

  useEffect(() => {
    setName('')
    setLookup({ state: 'idle' })
    setClaiming(false)
  }, [open])

  // One registry request per pause, never per keystroke — the same debounce
  // shape the Send drawer uses for resolving a recipient.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const raw = name.trim()
    if (!raw) {
      setLookup({ state: 'idle' })
      return undefined
    }
    setLookup({ state: 'pending' })
    debounceRef.current = setTimeout(async () => {
      const result = await checkName(raw)
      setLookup(
        result.available
          ? { state: 'ok', handle: result.handle || `${raw.toLowerCase().replace(/^@/, '').replace(/\.vanta$/, '')}.vanta` }
          : { state: 'missing', reason: result.reason },
      )
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [name])

  const handle = owned[0]?.handle ?? null
  const trimmed = name.trim()

  const submit = async () => {
    if (lookup.state !== 'ok' || claiming) return
    setClaiming(true)
    try {
      const result = await claimName({ name: trimmed, ownerAddress: vantaAddress })
      if (!result.ok) {
        notify(result.error, '⚠️')
        return
      }
      playHaptic('success')
      notify(`Claimed ${result.handle}`, '✓')
      setOwned(await ownedNames(vantaAddress))
      setName('')
      setLookup({ state: 'idle' })
    } finally {
      setClaiming(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Profile" subtitle="Your identity on Vanta">
      {/* ── HANDLE ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-card border border-hair p-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Vanta name
        </span>

        {loadingOwned ? (
          <div className="h-10 mt-2 rounded-xl bg-white/5 border border-hair animate-pulse" />
        ) : handle ? (
          <>
            <div className="flex items-center justify-between gap-3 mt-1.5">
              <span className="text-[24px] font-bold text-white tracking-tight truncate">
                {handle}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 border border-accent/30 text-accent shrink-0">
                CLAIMED
              </span>
            </div>
            <p className="text-[11px] leading-snug text-muted mt-1.5">
              Senders can type this instead of pasting a 44-character key. It is bound to{' '}
              <b className="text-white/80 font-mono">{shortAddr(vantaAddress)}</b>, and it is a
              lookup convenience, not a privacy feature.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => copyText(handle, notify, 'Handle copied!', '📋')}
                className="flex-1 py-2.5 rounded-xl bg-accent/15 border border-accent/30 text-accent font-bold text-[13px] hover:bg-accent/20 active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                {COPY_ICON} Copy handle
              </button>
              <button
                onClick={() => copyText(vantaAddress, notify, 'Vanta address copied!', '📥')}
                className="flex-1 py-2.5 rounded-xl bg-white/10 border border-hair text-white font-bold text-[13px] hover:bg-white/15 active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                {COPY_ICON} Copy address
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 mt-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                type="text"
                spellCheck={false}
                autoComplete="off"
                placeholder="yourname"
                className="min-w-0 flex-1 bg-black/40 border border-hair rounded-xl px-3.5 py-2.5 text-white text-[15px] font-semibold placeholder:text-white/25 focus:outline-none focus:border-accent/50"
              />
              <span className="text-[13px] font-bold text-accent shrink-0">{VANTA_NAME_SUFFIX}</span>
            </div>

            {lookup.state !== 'idle' && (
              <div
                role="status"
                aria-live="polite"
                className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] ${
                  lookup.state === 'ok'
                    ? 'bg-accent/10 border-accent/30 text-accent'
                    : lookup.state === 'pending'
                      ? 'bg-white/5 border-hair text-muted'
                      : 'bg-danger/10 border-danger/30 text-danger'
                }`}
              >
                <span aria-hidden="true">
                  {lookup.state === 'ok' ? '✓' : lookup.state === 'pending' ? '⋯' : '✕'}
                </span>
                <span className="truncate">
                  {lookup.state === 'ok'
                    ? `Available · ${lookup.handle}`
                    : lookup.state === 'pending'
                      ? 'Checking…'
                      : lookup.reason}
                </span>
              </div>
            )}

            {/* The irreversible part, shown before it happens. */}
            {lookup.state === 'ok' && vantaAddress && (
              <div className="mt-2 rounded-xl bg-black/40 border border-hair p-3">
                <span className="text-[10px] text-muted uppercase tracking-wider">
                  This name will point to
                </span>
                <span className="block text-[11px] font-mono text-white/90 break-all mt-0.5">
                  {vantaAddress}
                </span>
                <p className="text-[10px] text-muted leading-snug mt-1.5">
                  One name per identity. The proof is a signature over{' '}
                  <span className="font-mono text-white/70">vanta-name-claim:{'<'}</span>name
                  <span className="font-mono text-white/70">{'>'}</span>. The registry verifies it,
                  and it is never published on-chain.
                </p>
              </div>
            )}

            <button
              onClick={submit}
              disabled={lookup.state !== 'ok' || claiming}
              className="w-full mt-3 py-3 rounded-xl bg-accent hover:bg-accent-hi font-bold text-black text-sm active:scale-[0.98] transition-all disabled:opacity-40"
            >
              {claiming ? 'Signing…' : `Claim ${VANTA_NAME_SUFFIX} name`}
            </button>
          </>
        )}
      </div>

      {/* ── ADDRESSES ──────────────────────────────────────────────────── */}
      <div className="w-full rounded-2xl p-4 bg-black/40 border border-white/10 flex flex-col gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Your addresses
        </span>
        {addressRow(
          'Vanta identity · private receive',
          vantaAddress || 'initializing…',
          () => copyText(vantaAddress, notify, 'Vanta address copied!', '📥'),
          'text-accent',
        )}
        <div className="w-full h-px bg-white/10" />
        {addressRow(
          'Public wallet · on-ramp',
          wallet?.publicKey || '',
          () => copyText(wallet?.publicKey, notify, 'Public address copied!', '📥'),
          'text-muted',
        )}
      </div>

      {/* ── STATE ──────────────────────────────────────────────────────── */}
      <div className="w-full rounded-2xl bg-white/5 border border-hair px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-white">Shadow receive</span>
        <span
          className={`text-[11px] font-bold px-2 py-1 rounded border ${
            registered
              ? 'bg-accent/10 border-accent/30 text-accent'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}
        >
          {registered ? 'Registered' : 'Not registered'}
        </span>
      </div>

      <button
        onClick={() => {
          playHaptic('tap')
          onOpenSettings?.()
        }}
        className="w-full py-3.5 px-4 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-[0.98] transition-all flex items-center justify-between text-white font-semibold text-left gap-3"
      >
        <span className="text-sm">Settings & account</span>
        <span className="text-muted">→</span>
      </button>

      <span className="text-[10px] text-muted leading-relaxed">
        {mwaAccount
          ? 'Devnet build. Unaudited, not for real funds. Your public funds are signed by your device wallet; Vanta stores only the shielded spending key.'
          : 'Devnet build. Unaudited, not for real funds. Keys live in this browser’s localStorage only.'}
      </span>
    </Drawer>
  )
}
