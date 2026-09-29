import { useEffect } from 'react'
import { playHaptic } from '../lib/haptic'
import { shortRef } from '../lib/format'
import { explorerLink } from '../lib/honesty'

/**
 * Action-confirmed overlay — the beat that tells the user the money moved.
 *
 * Shield and send used to end in a toast that slid past while the sheet closed,
 * so the loudest moment in the product was also the easiest to miss. This is the
 * receipt of the *moment*: a drawn check, the amount, and (only when a link tells
 * the truth) the explorer proof. It auto-dismisses, and any tap or the Done
 * button closes it early, so it never blocks the next action.
 *
 * Copy rules match the rest of the app: no "anonymous", no "untraceable", and
 * no em dashes. A public send says it is public here too.
 */

const COPY = {
  shield: {
    title: 'Shielded',
    sub: 'Now in your private balance',
    action: 'Shield',
  },
  shadow: {
    title: 'Sent privately',
    sub: 'Amount and recipient hidden',
    action: 'Shadow send',
  },
  ghost: {
    title: 'Sent',
    sub: 'Link to you severed. Payout is public.',
    action: 'Ghost send',
  },
  public: {
    title: 'Sent',
    sub: 'Public transfer on Solana',
    action: 'Public send',
  },
}

// shield · shadow · ghost · public -> the copy block above.
function variantFor({ kind, mode }) {
  if (kind === 'shield' || mode === 'Shield') return 'shield'
  if (mode === 'Shadow') return 'shadow'
  if (mode === 'Ghost') return 'ghost'
  return 'public'
}

export default function SuccessOverlay({
  open,
  onClose,
  kind = 'send',
  mode,
  amount,
  symbol = 'SOL',
  signature,
  counterparty,
}) {
  useEffect(() => {
    if (!open) return undefined
    playHaptic('success')
    // Long enough to read, short enough not to nag. Tapping anywhere dismisses.
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [open, onClose])

  if (!open) return null

  const variant = variantFor({ kind, mode })
  const copy = COPY[variant]
  const link = explorerLink(mode ?? (kind === 'shield' ? 'Shield' : 'Public'), signature)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${copy.action} confirmed`}
      className="fixed inset-0 z-[120] flex items-center justify-center px-8"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/85 success-veil" />

      <div className="relative z-10 w-full max-w-[320px] bg-card border border-hair-hi rounded-[28px] px-6 py-8 flex flex-col items-center gap-1 shadow-2xl text-center">
        {/* Disc + drawn ring + drawn tick. Sized so the tick reads at a glance. */}
        <div className="relative w-20 h-20 mb-4 success-disc">
          <div className="absolute inset-0 rounded-full bg-accent/15 blur-md" />
          <svg viewBox="0 0 64 64" className="relative w-20 h-20" fill="none" aria-hidden="true">
            <circle
              cx="32"
              cy="32"
              r="26.5"
              stroke="var(--color-accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="success-ring"
              transform="rotate(-90 32 32)"
            />
            <path
              d="M21 33.2 L28.5 40.5 L43.5 24.5"
              stroke="var(--color-accent)"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="success-tick"
            />
          </svg>
        </div>

        <div className="success-body flex flex-col items-center gap-1">
          <span className="text-[11px] font-bold uppercase tracking-widest text-accent">
            {copy.action} confirmed
          </span>
          <h2 className="text-[22px] font-extrabold text-white tracking-tight">{copy.title}</h2>
          {amount != null && (
            <span className="text-2xl font-extrabold text-white tnum mt-1">
              {amount} <span className="text-base text-muted font-bold">{symbol}</span>
            </span>
          )}
          <p className="text-[12px] leading-snug text-muted mt-1.5">{copy.sub}</p>

          {counterparty && (
            <p className="text-[11px] font-mono text-white/70 mt-1 break-all">
              to {counterparty}
            </p>
          )}
        </div>

        <div className="success-body w-full flex flex-col gap-2 mt-5">
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className="btn-quiet tap w-full"
            >
              View on Solana Explorer
            </a>
          )}

          {!link && signature && (
            <p className="text-[10px] leading-snug text-muted font-mono break-all">
              Reference {shortRef(signature)}
            </p>
          )}

          <button
            onClick={onClose}
            className="btn-accent tap w-full"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
