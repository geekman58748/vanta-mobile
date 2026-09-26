/**
 * Single source of truth for every outbound link on the landing page.
 *
 * ⚠️ APK_URL is a PLACEHOLDER. Vanta has no shipped Android build yet
 * (PLAN.md blocker B1). When the Capacitor/webshell APK lands, replace this
 * one value with the GitHub Release asset URL — nothing else needs to change.
 * Until then the store badge renders in its "pending" state.
 */
export const APK_URL = ''

/** Set to the repo that will be public at submission time. */
export const GITHUB_URL = 'https://github.com/geekman58748/vanta-mobile'

/** Devnet wallet app — useful for judges who want to try it before the APK. */
export const DEVNET_APP_URL = 'http://localhost:3000'

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
