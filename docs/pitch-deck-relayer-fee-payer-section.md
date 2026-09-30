# Pitch deck — the "why does the relayer expose the sender?" slide

> **Why this file exists.** Vanta ships a relayer, and a judge who sees `account[0]` paying
> the fee on a Shadow send will ask the obvious question: *relayers can pay fees on Solana —
> so why is the spend identity still the payer?* The honest answer is that the SDK Vanta
> ships **structurally forbids** a separate fee payer on the default-ring path, and
> only permits one on a custom ring Vanta does not deploy. This is the slide that says
> that with a file path instead of a shrug, and it is written to be lifted straight into the
> deck.
>
> **Claims discipline** follows `docs/pmf-narrative.md` §6 and `docs/pitch-deck.md`: the
> custom-ring path is labelled **direction**, never shipped. Nothing here is "untraceable",
> "anonymous" in our own voice, or "no server".

---

## 1. The slide

**RELAYER & FEE-PAYER — WHAT THE SDK ACTUALLY ALLOWS**
### The relayer can sponsor a fee. It cannot hide a *spender*.

Every Solana transaction has two public slots: a **fee payer** and a **signer list**. Vanta's
relayer fills the first one wherever the rail allows two signatures — and can't where the rail
allows only one.

| Flow | Signers on the wire | Fee payer | SDK verdict |
|---|---|---|---|
| **Register** (`.vanta` / shielded address) | owner + sponsor | relayer | ✅ two signatures, by design |
| **Shield** (public → private deposit) | depositor | relayer | ✅ fee payer is independent of depositor |
| **Shadow** (private → private) | owner only | **owner** | ❌ `TRANSACTION_ED25519_PAYER_MISMATCH` |
| **Ghost** (private → public) | owner only | **owner** | ❌ same guard |
| *Ring exit (custom ring)* | *relayer + note owner* | *relayer* | *✅ — needs a ring program we do not deploy* |

The guard is not a missing flag. It is a refusal, raised **before the proof is generated**:

```
// sdk-libs/ts/src/wallet/private-transaction.ts:114
// The default transact appends no owner signer accounts, the owner must pay.
if (address.solanaAddress() !== transaction.payer()) {
  throw new TransactionError("TRANSACTION_ED25519_PAYER_MISMATCH", …);
}
```

To be precise about *where* the line is: the shipped package (`vendor/heliuslabs-zolana-0.3.0-alpha.tgz`)
has **no relayer path on the default-ring transfer/withdrawal builders this app uses** — zero
occurrences of `relayer` or `relay` in every `.js` file, and no `submit_transaction` anywhere.
A separate-fee-payer primitive *does* exist in the build, but only for custom rings
(`buildRingExitTransaction`), and the one mention of relayers in the whole package is the README
saying they are not supported: *"Anonymous transfers that would use a relayer are not supported."*
Vanta is not failing to use an option that exists — it is not deploying the ring program that
option requires.

**What the relayer *does* buy Vanta:** gasless registration and gasless deposits — the two
flows the SDK lets a third party sponsor. Shadow and Ghost are one-signature by construction,
so the shield identity pays its own ~5,000 lamports and is the visible initiator. The receipts
say so on every send.

---

## 2. Speaker notes (30 seconds)

> "Fair question: Solana lets a relayer pay the fee, so why is our relayer only on deposits and
> registration? Because the SDK we ship draws a hard line. Deposits and registration are
> two-signature transactions — a sponsor can pay rent and the network fee while the owner still
> signs. Our private sends are one-signature, and the SDK throws
> `TRANSACTION_ED25519_PAYER_MISMATCH` if the payer isn't the owner — before it even builds the
> proof. That's not us picking the wrong signer; there is no relayer path on the rails our sends use.
>
> We audited upstream, though. A separate fee payer **does** exist — on custom rings, where the
> note owner co-signs beside the relayer. That's a ring-program deployment and a permanent
> key-escrow trade, so it's a roadmap line, not a today fix. Until then, the honest version is
> the one in the receipts: the fee payer is the spend identity, and anyone you paid can count
> and time your sends."

**If asked "didn't Helius say relayers can sign and pay fees?"** — Yes, in the abstract, and the
Zolana spec does describe an optional relayer fee payer. The spec is describing what the protocol
permits; the shipped SDK exposes it only on the custom-ring path, and its own README states it
plainly: *"Anonymous transfers that would use a relayer are not supported."*

**If asked "can you just fix it then?"** — Not by config or construction order — the check runs
before proving, so the payer must be decided at proof time, and on the default ring the only legal
value is the owner. The real fix is a custom ring (upstream `buildRingExitTransaction` proves the
primitive), which is weeks of unaudited program work plus permanent custody changes.

---

## 3. What NOT to say

- 🚫 **Not** "the protocol can't do relayers." It can — the SDK gates it to custom rings. Overclaiming
  impossibility is the same sin as overclaiming privacy.
- 🚫 **Not** "we could turn it on with a config change." It's a ring-program deployment, not a flag.
- 🚫 **Not** "anonymous." The README uses it; we quote it as a quote. Vanta's own word is *confidential*.
- 🚫 **Not** "gasless" unqualified. It is gasless for **registration and Shield**; Shadow and Ghost
  are paid by the shield identity.

---

## 4. Where each claim lives

| Claim | Receipt |
|---|---|
| Default-ring spend requires fee payer == owner | `sdk-libs/ts/src/wallet/private-transaction.ts:114-116` · built: `vendor/…/dist/wallet/private-transaction.js:73` |
| Same guard on the split builder | `sdk-libs/ts/src/transaction/instructions/builders.ts:364` · built: `…/dist/transaction/instructions/builders.js:266` |
| "The fee payer is also the shielded owner…" | `sdk-libs/ts/src/wallet/transactions.ts:30` |
| Sponsor payer allowed on registration | vendor `README.md` — *"`payer` is optional and defaults to `owner`. A sponsor passed as `payer` funds the record's rent and pays the transaction fee. The owner still signs but needs no SOL, so the transaction carries two signatures."* |
| Deposits allow payer ≠ depositor | `sdk-libs/wallet/src/actions/deposit.rs` (`if depositor.pubkey() != payer.pubkey() { signers.push(depositor) }`) |
| Relayer primitive exists — on custom rings | `sdk-libs/ts/test/e2e/ring-flow.live.test.ts:349-370` (relayer fee payer, note owner co-signs, two signatures, relayer first). **In the shipped build too**: `vendor/…/dist/ring/transfer.js` exports `buildRingExitTransaction` with a `feePayer` param |
| Changelog confirms the ring carve-out | `sdk-libs/ts/CHANGELOG.md:598` (relayed ring exit) · `:982-984` (*"A ring transfer whose fee payer is not the note owner is no longer refused upfront with `TRANSACTION_ED25519_PAYER_MISMATCH`…"*) |
| SDK README states the limit | `sdk-libs/ts/README.md:342` — *"Anonymous transfers that would use a relayer are not supported."* |
| Spec allows an optional relayer | `docs/spec.md` — *"Relayer (optional) — fee-payer that submits a transaction on a user's behalf; by default users invoke the programs directly."* |
| **Vanta's** Shadow returns fee payer = owner | `src/App.jsx:1109` — `feePayer: signerRef.current.address, // X owns the UTXOs and pays — SDK invariant` |
| **Vanta's** Ghost returns fee payer = owner | `src/App.jsx:1150` (same line, same reason) |
| **Vanta's** Shield uses the relayer (in-app wallet) | `src/App.jsx:974` — `feePayer: useMwa ? wallet.publicKey : relayerAddressRef.current` |
| Relayer enforces the same slot rule | `relayer/server.js` — *"The relayer must be the fee payer, or it has no reason to co-sign"* (`slots[0].addr !== RELAYER_ADDR` → refuse) |

Line numbers are as of 2026-09-30. The built `vendor/…tgz` paths are the files actually imported
by `package.json` (`"@heliuslabs/zolana": "file:./vendor/heliuslabs-zolana-0.3.0-alpha.tgz"`).
