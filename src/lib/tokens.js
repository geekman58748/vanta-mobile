// ── Token constants (moved verbatim out of App.jsx so drawers can share them) ──
// Zolana's native-SOL sentinel is the system program id, NOT wrapped-SOL.
// Asset balances report THIS mint, so keying SOL by wrapped-SOL makes the
// lookup miss and the private balance silently render as zero.
export const SOL_MINT = '11111111111111111111111111111111'
export const DUSDC_MINT = '4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7'

export const TOKENS = {
  SOL: { mint: SOL_MINT, symbol: 'SOL', decimals: 9, color: 'text-accent' },
  dUSDC: { mint: DUSDC_MINT, symbol: 'dUSDC', decimals: 6, color: 'text-[#5AC8FA]' },
}

// ── Shield fee reserve ────────────────────────────────────────────────────────
// A deposit leaves the connected wallet, and on the MWA path that wallet is ALSO
// the fee payer — so shielding X needs X plus the network fee. With exactly 0.1
// SOL the fee lands first (100,000,000 − 5,000) and the transfer then fails with
// "Transfer: insufficient lamports 99995000, need 100000000".
//
// Shared by App.jsx's balance guard AND the Shield picker's "Max", so the two can
// never disagree about what "all of it" means. Same reason SOL_MINT lives here.
export const NETWORK_FEE_SOL = 0.000005
export const SHIELD_FEE_RESERVE = NETWORK_FEE_SOL * 2

// The most SOL that can be shielded, leaving the fee behind for the depositor.
// No dUSDC equivalent: this build has no public dUSDC balance read, so there is
// nothing honest to compute a "Max" from.
export const maxShieldableSol = (balance) => Math.max(0, balance - SHIELD_FEE_RESERVE)
