import { ArrowUpRight } from './Marks.jsx'
import { WAITLIST_URL } from '../config.js'

/**
 * Waitlist button.
 *
 * Where it lives, and why there rather than in the hero:
 *   1. The wallet section (`AppPreview`) — primary, next to the store badge. It is
 *      the section that shows the product, so it is the moment the intent to try
 *      it forms. A hero CTA asks before it has shown anything; this asks right
 *      after the receipt does the selling.
 *   2. The mobile nav sheet — the one place a thumb can reach without scrolling.
 *
 * Deliberately NOT in the footer: repeating the same CTA in the utility bar
 * read as nagging, and the footer already ends on two things that work (the
 * source, the receipt). It was removed from there.
 *
 * Shape: the same quiet, hairline button the hero already uses for "Read a real
 * receipt" (border-hairline, canvas fill, surface-2 hover). It used to be a
 * solid accent slab, which fought the page two ways: the theme spends accent on
 * the mark, focus rings and key data, never on a 64px block of colour; and a
 * filled block next to the store badge turned the action row into two
 * competing billboards.
 *
 * Now the fill is the page's own surface step, the label is ink-strong like
 * every other button, and the only accent is the arrow. It still reads as the
 * primary action in the row because the store badge sits on surface-2 with a
 * ring and this one has the arrow, without shouting.
 *
 * WAITLIST_URL is a placeholder anchor (#wallet) in src/config.js, so both
 * placements render today and the click lands on the product section rather
 * than a dead link. Point that one string at the real form when it exists.
 * If it is ever emptied again, the button returns null instead of going nowhere.
 */
export default function WaitlistButton({ size = 'md', className = '' }) {
  if (!WAITLIST_URL) return null

  const h = size === 'lg' ? 'h-16 px-5' : 'h-12 px-4'
  const external = /^https?:/i.test(WAITLIST_URL)

  return (
    <a
      href={WAITLIST_URL}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className={`group inline-flex items-center justify-center gap-2 rounded-xl border border-hairline bg-canvas px-5 text-[15px] font-medium text-ink-strong transition-colors duration-200 hover:bg-surface-2 hover:border-hairline-strong active:scale-[0.98] ${h} ${className}`}
    >
      Join the waitlist
      <span className="text-accent transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
        <ArrowUpRight size={13} />
      </span>
    </a>
  )
}
