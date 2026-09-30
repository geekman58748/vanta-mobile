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

/** Set to the repo that will be public at submission time. */
/**
 * Waitlist destination.
 *
 * Wired but PLACEHOLDER: both placements (wallet section primary, mobile nav)
 * render now, and the link points at `#wallet`, so it scrolls to
 * the product instead of going nowhere or 404ing. Swap this one string when
 * the real signup exists, nothing else changes:
 *   · a hosted form  e.g. https://tally.so/r/xxxxx  or  https://formspree.io/f/xxxx
 *   · a list service e.g. https://buttondown.email/vanta  (its own signup page)
 *   · `mailto:you@domain?subject=Vanta waitlist`  (works today, collects nothing)
 */
export const WAITLIST_URL = '#wallet'

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
