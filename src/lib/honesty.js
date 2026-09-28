// ── Per-leg honesty data ─────────────────────────────────────────────────────
// One table, two surfaces: the "what leaks" sheet (PrivacySheet) and every
// transaction receipt (ReceiptDrawer) read from HERE. Duplicating the wording
// in two components is exactly how a product that claims honesty ends up with
// two different claims, so the rows live in one place.
//
// Every row is what we actually verified on devnet, not what the rail could do
// in theory. See PLAN.md §2.1–§2.4 and §3.1, and HANDOFF §9 for the hard rules:
//
//   · NEVER "anonymous", "untraceable", "sender hidden".
//   · Shadow hides the AMOUNT and the RECIPIENT. It does NOT hide the initiator:
//     identity X is account[0] (fee payer) on every spend and is reused.
//   · Ghost severs the sender→receiver link, but the payout amount is public by
//     definition.
//   · Shield is fully public and says so.
//
// Also: no em dashes in rendered copy. Use a period, a comma, or "(fee payer)".

/** tone: ok (hidden / good) · warn (leaks) · mute (not applicable) */
export const MODE_HONESTY = {
  Shield: {
    verdict: 'Public by design',
    tone: 'warn',
    sub: 'public balance into your private balance',
    rows: [
      ['Amount', 'public', 'warn'],
      ['Who deposited it', 'your wallet, on chain', 'warn'],
      ['Who receives it', 'nobody, it is you', 'mute'],
      ['Where it goes next', 'not revealed', 'ok'],
    ],
    onChain: {
      linkable: true,
      note: 'The explorer shows your wallet, the amount, and the pool address. This is the deposit, and it is meant to be visible.',
    },
  },

  Shadow: {
    verdict: 'Confidential, not anonymous',
    tone: 'ok',
    sub: 'private balance to another Vanta user',
    rows: [
      ['Amount', 'hidden', 'ok'],
      ['Recipient', 'hidden', 'ok'],
      ['Initiator', 'visible (fee payer)', 'warn'],
      ['Link to where it lands', 'severed', 'ok'],
    ],
    onChain: {
      linkable: false,
      note: 'There is no meaningful on-chain record of this send. The explorer shows only a fee paid by your spend identity, and nothing else: neither the amount nor the recipient appears anywhere. That is the point.',
    },
  },

  Ghost: {
    verdict: 'Link severed, amount public',
    tone: 'ok',
    sub: 'private balance into any wallet',
    rows: [
      ['Amount', 'public', 'warn'],
      ['Recipient', 'public', 'warn'],
      ['Initiator', 'visible (fee payer)', 'warn'],
      ['Link sender to receiver', 'severed', 'ok'],
    ],
    onChain: {
      linkable: true,
      // True whether the recipient is a stranger or the user's own wallet: the
      // old wording ("your public wallet is absent from this leg") was false for
      // the Ghost-to-self case the beta test actually runs. `onChainNote()`
      // sharpens this further once the receipt knows the counterparty.
      note: 'The explorer shows the pool paying the recipient, and the amount. Your spend identity paid the fee, so your wallet is not the sender. When the recipient is your own public wallet, that payout is public by definition.',
    },
  },

  Public: {
    verdict: 'Fully public',
    tone: 'warn',
    sub: 'a plain transfer',
    rows: [
      ['Amount', 'public', 'warn'],
      ['Sender', 'public', 'warn'],
      ['Receiver', 'public', 'warn'],
      ['Link between them', 'visible', 'warn'],
    ],
    onChain: {
      linkable: true,
      note: 'A plain transfer. Everything here is public, and your wallet is on both ends.',
    },
  },
}

/**
 * Verification state of a transaction, for the receipt and the PDF.
 *
 * Kept HERE rather than in `lib/txHistory.js` because `receiptPdf.js` imports
 * it, and txHistory pulls in `lib/config.js`, which reads `import.meta.env`.
 * That is fine in the bundle but blows up the Node-based PDF harness, so the
 * vocabulary stays dependency-free with the rest of the honesty copy.
 *
 * tone: ok (confirmed) · warn (reported, not confirmed) · mute (not checked)
 */
export const PROOF = {
  verified: {
    label: 'Confirmed on chain',
    tone: 'ok',
    detail: 'The relayer looked this signature up after the send and found it.',
  },
  observed: {
    label: 'Seen by the relayer',
    tone: 'ok',
    detail: 'The relayer paid this transaction\'s fee, so it observed it directly.',
  },
  reported: {
    label: 'Client-reported, not confirmed',
    tone: 'warn',
    detail: 'Your device reported this signature; an on-chain lookup has not confirmed it yet.',
  },
  unchecked: {
    label: 'Not checked',
    tone: 'mute',
    detail: 'History was unreachable when this was recorded, so it has not been verified.',
  },
  pending: {
    label: 'Checking…',
    tone: 'mute',
    detail: 'Waiting on the relayer to look this signature up.',
  },
}

/** State the residuals out loud. This reads as competence, not as an apology. */
export const RESIDUALS = [
  'The Shield deposit is public and ties your wallet to a pool inflow. Spreading deposits over time is what blurs it.',
  'The spend identity is the fee payer on every send and is reused, so someone you have paid can count your sends.',
  'A small pool makes amount and timing correlatable. Pool depth is the fix.',
]

/**
 * The on-chain note, adapted to who was actually paid.
 *
 * Ghost is the one mode whose static wording can go wrong: a Ghost send to your
 * own public wallet makes "your public wallet is absent from this leg" false, and
 * the beta test does exactly that (Ghost to self). Deriving the sentence from the
 * counterparty keeps the receipt from contradicting the chain it links to.
 *
 * Deliberately dependency-free, like the rest of this file: `receiptPdf.js`
 * imports the vocabulary and runs under plain Node.
 */
export function onChainNote(mode, { counterparty, wallet } = {}) {
  if (mode === 'Ghost') {
    if (counterparty && wallet && counterparty === wallet) {
      return 'The explorer shows the pool paying this address, and the amount. This address is your own public wallet, so the payout is public to you and to everyone else. Your spend identity paid the fee.'
    }
  }
  return MODE_HONESTY[mode]?.onChain?.note ?? null
}

/** Explorer link for a devnet signature, or null when a link would be misleading. */
export function explorerLink(mode, signature) {
  if (!signature) return null
  if (!MODE_HONESTY[mode]?.onChain?.linkable) return null
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`
}
