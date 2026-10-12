/**
 * Single source of truth for every outbound link on the landing page.
 *
 * ⚠️ APK_URL is empty on purpose, and it points at the **dApp Store listing**,
 * not at the APK. The two are easy to confuse: the APK *is* served from this
 * site — `public/download/vanta.apk`, the direct download link on the
 * submission form, replaced and re-committed with every release — while Vanta
 * is not listed in the dApp Store yet, which is the only thing this badge
 * waits on. Set this to the store listing when it exists and the badge becomes
 * a real link (see StoreBadge.jsx) with no other change.
 */
export const APK_URL = ''

/**
 * Waitlist signup.
 *
 * Both placements open the on-page card (WaitlistModal.jsx) rather than leaving
 * the site, so there is no destination URL any more. The card POSTs here, and
 * the row lands in the relayer's Postgres alongside the tx history. Empty this
 * and the card's submit surfaces the failure instead of silently dropping a
 * signup.
 */
export const WAITLIST_ENDPOINT = 'https://p01--vanta-mobile--9ymc8tqmdxvj.code.run/waitlist'

export const GITHUB_URL = 'https://github.com/geekman58748/vanta-mobile'

export const SOCIALS = [
  { label: 'GitHub', href: GITHUB_URL },
  { label: 'X', href: 'https://x.com/' },
]

/**
 * Every on-chain claim on this page resolves to one of these signatures.
 * Devnet. Verify any of them on Solana Explorer (devnet cluster).
 */
export const EXPLORER = 'https://explorer.solana.com/tx/'
export const EXPLORER_SUFFIX = '?cluster=devnet'

export const explorerUrl = (sig) => `${EXPLORER}${sig}${EXPLORER_SUFFIX}`
