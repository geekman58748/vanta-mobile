/**
 * Real devnet evidence captured during the Vanta live-test session (2026-09-25).
 *
 * Everything here was read off-chain and confirmed by account-delta diffs, NOT
 * inferred from the app UI. Sourced from PLAN.md §2 and docs/vanta-privacy-architecture.md §8.
 *
 * These are the page's proof points. If any value changes, re-verify the
 * signature — do not hand-edit to make the story nicer.
 */

export const SHADOW = {
  id: 'shadow',
  kind: 'Shadow',
  route: 'Vanta → Vanta',
  amountMoved: '0.1 SOL',
  signature:
    '26JSzUqjsXsedNJRbULKRTGvSgwp6hmp5G4MJhS2DY1aTAqPU8wJRJ4mT2BdYPXw7HUWmh3u2npquW5EiJM72w8B',
  headline: 'The amount and the recipient are not derivable from on-chain data.',
  /** Every account whose balance changed, exactly as the chain reports it. */
  deltas: [
    {
      account: 'CmPCvP42XqsBU6vMuDUgwzqVxcj26Gt73iiYKzWrhHQT',
      short: 'CmPCvP42…',
      role: 'Sender identity (fee payer)',
      delta: '−0.000005000',
      tone: 'exposed',
    },
    {
      account: '33KVhbT4QtdQDrrrGwwThqD47Dh4Q6tA443t9jMNcWFN',
      short: '33KVhbT4…',
      role: 'Shielded pool',
      delta: '−0.001402080',
      tone: 'neutral',
    },
    {
      account: '469NRJVjxBRvE2nYTHboDr5g1jXF1nGfUFYUz8RPL5dx',
      short: '469NRJVj…',
      role: 'New encrypted note',
      delta: '+0.000701040',
      tone: 'neutral',
    },
    {
      account: 'DPsTJ7FfyHZ8cKgnwQYZN8uZ2JwCFKsMVGxJRUqvcMxK',
      short: 'DPsTJ7Ff…',
      role: 'New encrypted note',
      delta: '+0.000701040',
      tone: 'neutral',
    },
  ],
  /** The three claims the receipt makes, each verified against the tx above. */
  findings: [
    {
      claim: 'Amount',
      verdict: 'hidden',
      detail:
        '0.1 SOL appears nowhere in the transaction. Note accounts are a fixed rent-exempt size, so the amount cannot be inferred from size either.',
    },
    {
      claim: 'Recipient',
      verdict: 'hidden',
      detail:
        'The recipient address is not in the account list and none is loaded through an address lookup table. The relayer is absent too.',
    },
    {
      claim: 'Sender',
      verdict: 'visible',
      detail:
        'The sender identity is account[0], the fee payer, and it is reused across every send. Anyone who knows your address can chart your sends.',
    },
  ],
}

export const GHOST = {
  id: 'ghost',
  kind: 'Ghost',
  route: 'Private → any Solana address',
  amountMoved: '0.3 SOL',
  signature:
    'Q5o9soTu8Yf7U7iwgoj9WeLKgkDS6CSdoZHyZPjQgNJon1nQ27GMa3RUVzThBEWxBsLxjT4LUPMH8CSrQcwm4QA',
  headline: 'Redemption is real. The private balance left the pool vault.',
  deltas: [
    { short: '2iAazE9t…', role: 'Pool vault', delta: '−0.300000000', tone: 'exposed' },
    { short: 'CmPCvP42…', role: 'Withdrawer', delta: '+0.299995000', tone: 'exposed' },
  ],
  note: 'A private balance is a redeemable bearer claim, not a number the app renders. Withdrawing makes the amount public again, by design.',
}

export const SHIELD = {
  id: 'shield',
  kind: 'Shield',
  route: 'Public → private',
  amountMoved: '0.3 SOL',
  signature:
    '3f2UWBXyb4suw7Bx4sHCJQuZeyVFyzMqAMMcsq9Lf8NjvP51DBWFs84wiBn5MmRi6ZyX9A7cpAnU87bomw29iwsN',
  headline: 'The deposit edge is public, and we say so.',
  deltas: [
    { short: 'FhV7cyfV…', role: 'Relayer (fee only)', delta: '−0.000010000', tone: 'exposed' },
  ],
  note: 'The relayer sponsors fees and registration rent. It never funds a payment amount. Your own wallet pays the deposit.',
}

export const ALL_EVIDENCE = [SHADOW, GHOST, SHIELD]

/** The user's own three live sends, all err:null, all the same 2-note shape. */
export const USER_SENDS = [
  { time: '01:38:27Z', signature: '3gs3si9qbzyBFkEzqB41ZANrSefs6KaNbdWyvYjSfyBCHmabPcJJBQPP52D3W7FEohK2je8V1UPjXKNxJnpnbAYHg' },
  { time: '01:52:02Z', signature: '5cTevV1CB4eBpWnX59z8Zvo918ZMoAq6Q16d4fgN6oGZDnSeTCHGdpNJ6hfkx2jsvfd8VT5FmpNGcy8um41gqWrc' },
  { time: '01:57:22Z', signature: 'ktWS55BU38TG3HrMdxJgxR3CDpwphQkES7zH897htEHgu3zMySusfBfpZ7cmQTrBrjxeZhWcXM3ZMG8y4Ms3evc' },
]

/**
 * Addresses worth showing publicly. Program IDs and the vault are already
 * public chain state; no user key material lives here.
 */
export const CONTRACTS = [
  { label: 'Shielded-pool program', value: 'sppU489D7A4U1exNo1oeMGZtLEofq3a6o2fR7UeoWB6' },
  { label: 'User registry program', value: 'regyS5rkAcw2YzDJCmTwCTHs2s246FXxbmuRZ42u2PD' },
  { label: 'Pool vault', value: '2iAazE9tAWcUJhNhfscRzX17Gb32Km9jJYZLGy1AnkVP' },
]
