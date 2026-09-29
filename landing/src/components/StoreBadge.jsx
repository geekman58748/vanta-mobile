import { Android, ArrowUpRight } from './Marks.jsx'
import { APK_URL } from '../config.js'

/**
 * Store badge: the Android mark and "Solana dApp Store" on one line.
 *
 * Used to be the familiar two-line store badge — a monospace eyebrow ("Get it
 * on" / "Coming soon") stacked over the store name. Two lines to say one thing
 * made the badge the tallest, busiest element in the nav, and "Coming soon" was
 * the loudest thing in the hero for a piece of information nobody needs twice.
 * One line: mark, then where to get it.
 *
 * ⚠️ While APK_URL is empty this renders in a PENDING state — it is a <div>,
 * not a link. Once the APK exists it becomes a real link with no other change
 * (see src/config.js). The label does not change either way.
 */
export default function StoreBadge({ size = 'md', className = '' }) {
  const live = Boolean(APK_URL)
  const h = size === 'lg' ? 'h-16 px-5' : 'h-12 px-4'
  const icon = size === 'lg' ? 24 : 18

  const inner = (
    <>
      <span className="text-ink-strong shrink-0">
        <Android size={icon} />
      </span>
      <span className="text-[15px] font-medium tracking-[-0.01em] text-ink-strong whitespace-nowrap">
        Solana dApp Store
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
        aria-label="Vanta on the Solana dApp Store"
        title="The APK is not published yet. This badge becomes a link when it is."
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
