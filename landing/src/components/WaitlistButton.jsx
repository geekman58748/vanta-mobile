import { ArrowUpRight } from './Marks.jsx'

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
 * It no longer navigates. Clicking raises the on-page card (`WaitlistModal`)
 * through a window event, so the signup happens on the site instead of handing
 * the visitor to a third party. The card is mounted once at the app root.
 */
export default function WaitlistButton({ size = 'md', className = '' }) {
  const h = size === 'lg' ? 'h-16 px-5' : 'h-12 px-4'

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('vanta:waitlist'))}
      className={`group inline-flex items-center justify-center gap-2 rounded-xl border border-hairline bg-canvas px-5 text-[15px] font-medium text-ink-strong transition-colors duration-200 hover:bg-surface-2 hover:border-hairline-strong active:scale-[0.98] ${h} ${className}`}
    >
      Join the waitlist
      <span className="text-accent transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
        <ArrowUpRight size={13} />
      </span>
    </button>
  )
}
