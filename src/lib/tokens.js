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
// the fee payer — so shielding X needs X plus the deposit's whole fee, or the fee
// is taken first and the transfer then fails with "Transfer: insufficient
// lamports".
//
// ⚠ The fee is NOT 5,000 lamports. That is one signature's base fee; a deposit is
// a v1 transaction carrying a compute-unit limit and a priority fee, and its
// MEASURED fee is 25,000. With the old value a "Max" Shield held back 10,000 for
// a 25,000 bill and the deposit died inside the wallet — the same class of bug
// this reserve exists to prevent, so the number has to be the measured one:
//   devnet 4SdGTbcFGUF8JzSGym1oLhfemF42qxAe5utKqNumzmuBqeftmk9ieiMtUNQBVXYXjx91C2pw1ZnQHaNG9trARJur
//   meta.fee = 25,000 · 1 signer · fee payer = the device wallet (2026-09-28)
//
// Shared by App.jsx's balance guard AND the Shield picker's "Max", so the two can
// never disagree about what "all of it" means. Same reason SOL_MINT lives here.
export const NETWORK_FEE_SOL = 0.000025
export const SHIELD_FEE_RESERVE = NETWORK_FEE_SOL * 2

// The most SOL that can be shielded, leaving the fee behind for the depositor.
// No dUSDC equivalent: this build has no public dUSDC balance read, so there is
// nothing honest to compute a "Max" from.
export const maxShieldableSol = (balance) => Math.max(0, balance - SHIELD_FEE_RESERVE)
