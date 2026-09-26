import { MODE_HONESTY } from '../lib/honesty'

const ROW_TONE = {
  ok: 'text-accent',
  warn: 'text-amber-300',
  mute: 'text-muted',
}

const MARK = { ok: '✓', warn: '⚠', mute: '·' }

/**
 * One mode's honesty block: a titled card with the verdict strip on top and the
 * per-leg rows beneath.
 *
 * Shared by PrivacySheet (all three modes at once) and ReceiptDrawer (just the
 * mode that was actually sent). Both go through lib/honesty.js, so a receipt can
 * never claim something the what-leaks sheet doesn't.
 */
export default function HonestyRows({ mode, compact = false }) {
  const entry = MODE_HONESTY[mode]
  // An unknown mode still needs to render: history rows can arrive with a mode
  // we have no table for (an imported row, or a future flow).
  if (!entry) return null

  const tone =
    entry.tone === 'warn'
      ? 'text-amber-300 bg-amber-400/10 border-amber-400/30'
      : 'text-accent bg-accent/10 border-accent/30'

  return (
    <div className="rounded-2xl bg-card border border-hair overflow-hidden">
      <div className={`flex items-center justify-between gap-3 px-4 py-2.5 border-b ${tone}`}>
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-bold tracking-tight">{mode}</span>
          {!compact && (
            <span className="text-[10px] leading-tight opacity-80 truncate">{entry.sub}</span>
          )}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider shrink-0">
          {entry.verdict}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-white/5">
        {entry.rows.map(([label, value, toneKey]) => (
          <div key={label} className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="text-[12px] text-muted">{label}</span>
            <span className={`text-[12px] font-semibold flex items-center gap-1.5 ${ROW_TONE[toneKey]}`}>
              <span aria-hidden="true" className="text-[10px]">{MARK[toneKey]}</span>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
