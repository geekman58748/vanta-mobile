import { Android, ArrowUpRight } from './Marks.jsx'
import { APK_URL } from '../config.js'

/**
 * Android store badge, styled like the familiar TestFlight/App Store badge.
 *
 * ⚠️ While APK_URL is empty this renders in a PENDING state — it is a <div>,
 * not a link, and it says so. Once the APK exists it becomes a real link with
 * no other change (see src/config.js).
 */
export default function StoreBadge({ size = 'md', className = '' }) {
  const live = Boolean(APK_URL)
  const h = size === 'lg' ? 'h-16 px-5' : 'h-14 px-4'
  const icon = size === 'lg' ? 24 : 20

  const inner = (
    <>
      <span className="text-ink-strong shrink-0">
        <Android size={icon} />
      </span>
      <span className="flex flex-col items-start text-left leading-none">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
          {live ? 'Get it on' : 'Coming soon'}
        </span>
        <span className="mt-1.5 text-[15px] font-medium tracking-[-0.01em] text-ink-strong">
          {live ? 'Android · APK' : 'Solana dApp Store'}
        </span>
      </span>
      {live && (
        <span className="ml-1 text-ink-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
          <ArrowUpRight size={13} />
        </span>
      )}
    </>
  )

  const shared = `inline-flex items-center gap-3 rounded-xl transition-all duration-200 ${h} ${className}`

  if (!live) {
    return (
      <div
        className={`${shared} cursor-default bg-surface-2 ring-1 ring-hairline`}
        aria-label="Android app coming soon"
        title="No APK has shipped yet — this badge goes live at submission."
      >
        {inner}
      </div>
    )
  }

  return (
    <a
      href={APK_URL}
      target="_blank"
      rel="noreferrer"
      className={`${shared} group bg-surface-2 ring-1 ring-hairline hover:bg-surface-3 hover:ring-hairline-strong active:scale-[0.98]`}
    >
      {inner}
    </a>
  )
}
