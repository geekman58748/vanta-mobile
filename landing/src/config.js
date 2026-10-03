/**
 * Single source of truth for every outbound link on the landing page.
 *
 * ⚠️ APK_URL is empty on purpose, and no longer because there is no build. The
 * release APK is built and signed (deploy/releases/vanta-1.0.0-ux12.apk); the
 * repository does not commit binaries, so it is distributed as a GitHub Release
 * asset and, later, through the dApp Store. It is deliberately not served from
 * this site. When the Release is published, set this to the asset URL and the
 * store badge becomes a real link with no other change.
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
