# Questions for MagicBlock AI

Copy-paste these to MagicBlock's AI / docs chat, then paste answers back.

---

## Q1: Delegation Transaction

What exactly happens on-chain when a user delegates to a Private Ephemeral Rollup?

- What Solana program handles delegation? (Program address?)
- What does the delegation instruction look like? (Accounts, data, signer)
- Is the delegation a single SystemProgram transfer to a PDA, or a custom instruction?
- How much SOL does the delegation tx cost in fees?
- Can the delegation be done via CPI from a custom Solana program, or does it have to go through the MagicBlock SDK directly?
- Is the Delegation Program open-source? Can we inspect the on-chain program code?

## Q2: Off-Chain Authorization (Post-Delegation)

After delegation, how does the user authorize transfers without signing on-chain transactions?

- What message format does the user sign? (Solana SignMessage? Custom format? EIP-191?)
- Where does the signed message go — back to the MagicBlock API, or to the TEE validator directly?
- Is there a challenge-response flow? (API returns challenge → user signs → API verifies)
- Can the signed authorization be reused, or is it single-use?

## Q3: Transaction Signing (Post-Delegation)

After delegation, who actually signs the Solana transactions?

- Does the delegated PDA sign via program seeds (invoke_signed)?
- Does the TEE validator sign on behalf of the user?
- How does the TEE get signing authority over the delegated account?
- Is the user's wallet keypair ever used to sign on-chain txs after delegation?

## Q4: Gasless / Sponsor Model

For gasless transfers (gasless: true):

- Who is the fee payer on the Solana transaction? (The sponsor/relay?)
- How is the sponsor reimbursed? (Token transfer prepended to the tx?)
- What's the flat relay fee? (0.2 USDC?)
- What's the minimum amount for gasless transfers? (0.5 USDC?)
- Can gasless work with SOL or only USDC/USDT?

## Q5: Settlement Transaction (What's Visible On-Chain)

When the TEE settles a private transfer back to Solana mainnet:

- What does the settlement tx look like on Solscan?
- What accounts are in the tx? (Sender wallet? Delegated PDA? Recipient? Program?)
- Is the sender's wallet address anywhere in the tx metadata, logs, or account keys?
- Can an observer trace from the settlement tx back to the original delegator?
- What program address shows up as the "By" field on Solscan?

## Q6: Token Support

- Does the Private Payments API work with native SOL, or only SPL tokens (USDC/USDT)?
- On devnet, does it work with dUSDC or wrapped SOL?
- Can we use it with any SPL token mint, or only whitelisted ones?

## Q7: Minimum Viable Integration

If we wanted to build the LEANEST possible integration:

- What's the absolute minimum we need to implement?
- Can we just use the hosted REST API (no SDK) and get full privacy?
- What's the API endpoint for private transfers?
- Do we need to run our own TEE validator, or is MagicBlock's hosted infra sufficient?
- What's the cost per private transfer? (Privacy fee + gas)
