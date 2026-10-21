# Pitch deck — how Vanta makes money

> **Why this file exists.** CLOCK IN is scored on *stickiness & PMF · UX · innovation ·
> presentation/demo*, and a deck that reaches slide 13 without answering "who pays you?" reads as
> a project, not a product. This is that slide, plus the speaker notes, plus the receipts.
>
> **Claims discipline.** This is the **only** slide in the deck that is entirely **direction**.
> The app is devnet-only and takes **no fee today** — `PLAN.md` §5 B5 and the README both say so.
> Say that out loud on the slide. Everything else obeys the language rules in
> `pmf-narrative.md` §6: "confidential", never "anonymous"; never "untraceable"; never "no server".
>
> **The panel matters here.** Mert Mumtaz (CEO, Helius) is a judge and Vanta runs on Helius's
> rails. Any revenue model that misstates how those rails work is a model that loses the room.
> §1 is the correction; §3 is the model.

---

## 1. First, the correction: the "gas engine" model does NOT apply to Vanta

The common privacy-relayer pitch is a paymaster that pays every user's gas and refills itself by
skimming a stablecoin off each transfer, swapped back to SOL on a cron job. It is a real pattern
in other systems. **It is not Vanta's pattern, and a Zolana-literate judge knows it.**

| What the gas-engine pitch assumes | What the rails actually do |
|---|---|
| The relayer pays gas for **every** transaction, including spends | The relayer pays gas only for **registration and Shield**. Spends cannot be relayer-paid — `TRANSACTION_ED25519_PAYER_MISMATCH`, raised *before* the proof is built |
| Heavy demand burns the relayer's paymaster | Heavy demand **reduces** the relayer's relative cost: each spend is paid by the spend identity, and one `0.002 SOL` float covers ~400 spends (`server.js`, 5,000 lamports/tx) |
| A backend cron scrapes a fee wallet and swaps to SOL | There is no fee wallet and no swap. There is a **fee note**, collected inside the same private transfer via the SDK's own split builder |
| The risk is "the $5k evaporates in 72 hours" | The risk is the opposite, and it is the pitch: **the only recurring cost is a tiny one-time onboarding**, ~`0.0014 SOL` per user |

Receipts for every row: `docs/pitch-deck-relayer-fee-payer-section.md` §4 and
`docs/vanta-privacy-architecture.md` §8.3. Do not give a slide built on the left column; every
claim in the right column is checkable in this repository in under a minute.

**The sentence to say:** *"Most privacy apps have a gas problem. We have the opposite. The SDK we
ship forbids a relayer from paying for a private spend — so growth is nearly free for us, and that
constraint is the reason our unit economics work."*

---

## 2. The cost model — who actually pays what

Measured on devnet, from `docs/live-test-evidence.md` and `PLAN.md` §2.4:

| Event | Fee payer | Cost | Who eats it |
|---|---|---|---|
| Identity + shielded-address registration | **relayer** (`FhV7…`) | `0.001340960 SOL` (rent + fee), measured | Vanta — once per user |
| `.vanta` handle claim | relayer | Postgres row, Ed25519 proof | Vanta — ~$0 |
| **Shield** (public → private) | **relayer** | `5,000–25,000` lamports, measured | Vanta — per deposit |
| **Shadow** (private → private) | spend identity `X` | `5,000` lamports | **the user** |
| **Ghost** (private → public) | spend identity `X` | `5,000` lamports | **the user** |
| Gas float to fund `X` | relayer | `0.002 SOL` amortized over ~400 spends | Vanta — near-zero amortized |

**One-time onboarding ≈ `0.0014 SOL` ≈ `$0.21–0.28`** at `$150–200` SOL. Five thousand users
onboarded and Shielding costs the relayer **about `$1,100–1,400`, once** — and the per-send
marginal cost after that is a rounding error. That is the number that ends the "can this survive
heavy demand" question, and it is a measured number, not a projection.

**Fixed cost base:** one always-on container (Northflank free Sandbox tier today, §18.3) plus a
Helius RPC plan plus a Neon Postgres instance. At demo scale this is under `$100/month`, which
means **Vanta breaks even at roughly twenty private payments a day.** Put that number on the slide.
It is small, specific, and defensible.

---

## 3. The revenue model — three lines, in order of when they turn on

### Line 1 — the private-send fee (the core)

**0.5% of each Shadow/Ghost payout, collected as a private fee note.**

The SDK ships `buildSplitTransaction`. A payment is already a note being spent; splitting it
produces one note for the recipient and one for the treasury, **in the same transaction, inside
the same proof.** Nothing about the recipient's leg changes, and — this is the part that matters —
**the fee itself does not leak who paid whom.** A fee collected to a public address would rebuild
exactly the graph the pool exists to hide.

Two operational details that show the model is real, not hand-waved:

- **Minimum fee = one note account.** A new note carries ≈`0.0007 SOL` of rent-exempt space
  (measured: the `+0.000701040` deltas in `docs/vanta-privacy-architecture.md` §8.2). So a
  per-send on-chain fee only makes sense above a floor — roughly a **`$1.50–2.00` payment** at
  0.5%. Below the floor, Vanta **meters off-chain against a prepaid balance and settles in
  batches**. A `$0.05` fee note against `$0.10` of rent is negative margin, and saying so is
  worth more than pretending it isn't.
- **Sweeps, not skims.** Accumulated fee notes merge (`buildMergeTransaction`) and exit to the
  treasury on a schedule, so treasury exits are few, large, and not correlatable to individual
  users — the same discipline the product asks of its users.

| | |
|---|---|
| Take rate | `0.5%` |
| Average private payment in the target segment | `$50–500` (a grant payout, a campaign invoice) |
| Gross per `$50` send | `$0.25`, minus `~$0.10` note rent when collected on-chain → **~60%**, higher when batched |
| Break-even | **~20 private payments/day** |

### Line 2 — the Campaign plan (the buyer is a business, not a consumer)

Vanta's own product story is the crowdfund: *raise publicly, spend privately*. The natural paying
customer is therefore the party doing the raising — a DAO, a grant round, a collective, a
community treasury.

> **$49 per campaign** + **$1 per onboarded member** (Vanta's cost: ~`$0.25`). Includes bulk
> sponsored onboarding, `.vanta` handle batch, and branded per-leg receipts as an audit artifact.

This is the line that answers "who pays?" with a named buyer and a real budget, and it is the line
Helius should care about most: a campaign onboards N users at once, and **each of those N is a new
Rings identity, a new registration, and a new stream of RPC and prover traffic.**

### Line 3 — Relayer-as-a-service (the platform line, later)

The relayer already does the hard, unglamorous parts: token + caps + program allowlist, identity-signed
history (`vanta-history:…` proof, 5-minute freshness), and set-of-sponsorable-flows logic. Any other
Seeker dApp that wants gasless Zolana onboarding would otherwise rebuild it. Price it per call at
roughly **`$0.002` against ~`$0.0003` of cost**. Do not over-invest in this line in the deck — one
bullet, framed as platform direction, is right.

### Not a revenue line: grants

Helius and the Solana Foundation fund infrastructure in exactly this shape (devnet → audited
mainnet). Non-dilutive runway for the custody work, **not** revenue. Mention it in the appendix if
asked how the roadmap gets paid for; never on the slide.

---

## 4. The slide (paste-ready)

> ## How Vanta pays for itself
> *Model, not shipped — devnet today, no fee is taken.*
>
> **The constraint is the business model.**
> Zolana forbids a relayer from paying for a private spend. So Vanta pays for onboarding and
> deposits, and the user's own spend identity pays `5,000` lamports per send.
>
> **Cost:** `0.0014 SOL` one-time per user — **~`$0.25`**. Five thousand users onboard for about
> **`$1,400`, once**. Growth does not burn the relayer.
> **Break-even: ~20 private payments a day.**
>
> | Line | Price | Buyer |
> |---|---|---|
> | Private-send fee | `0.5%`, collected as a **private fee note** (`buildSplitTransaction`) | the sender |
> | **Campaign plan** | `$49` + `$1`/onboarded member | DAOs, grants, fundraisers |
> | Relayer-as-a-service | `$0.002`/call | Seeker dApps |
>
> **The fee is private too.** A fee note is split inside the same proof, so collecting revenue
> cannot rebuild the graph the pool hides — and treasury exits are merged and swept, not per-user.

**Speaker notes (30 seconds):**

> "Here's the part that surprised us. Most privacy apps have a gas problem — a paymaster bleeding
> priority fees, a backend swapping stablecoins back to SOL to stay alive. We don't, and it's not
> clever engineering, it's the SDK. The same `TRANSACTION_ED25519_PAYER_MISMATCH` guard that we
> show on the relayer slide — the one that means our spend identity is visible — also means nobody
> can spend our money for us. So onboarding costs a quarter, once, and everything after that is
> the user's own five thousand lamports. We break even at about twenty private payments a day.
>
> When we do charge, the fee rides the same proof the payment does — a split note, one for the
> recipient, one for us. We can't take a cut and stay honest about the graph if that cut is a
> public transfer, so it isn't one."

---

## 5. Why this specifically lands with the Helius judge

1. **It turns their constraint into your tailwind, in their own vocabulary.** You are not asking
   Mert to relax `feePayer == owner`; you are showing that the guard is *also* the reason your
   cost line is flat. That is the difference between reporting a bug and understanding a design.
2. **Your volume is their volume.** Every send is a Zolana proof through the Helius prover and
   indexer, and every read is an RPC credit. A `0.5%` take rate and a Helius plan are not
   competing — **the Campaign plan is a Rings demand generator**, which is the single most useful
   thing a hackathon team can hand the company that shipped the rails.
3. **It credits upstream and stays honest about the seams** — the npm `0.2.0-alpha` drift, the
   v1-only `maxSupportedTransactionVersion`, the indexer-cursor behaviour, the registry
   fall-through (`PLAN.md` §7.3). A judge who wrote those surfaces reads that as a customer, not a
   critic.

---

### 5.1 Where Helius's *own* revenue comes from (answer it before you're asked)

Helius does not take a cut of Vanta's `0.5%`, and Vanta does not take a cut of Helius's. It is a
customer relationship plus a distribution relationship, and the honest version is more flattering
than a rev-share would have been.

**Helius's revenue is credit-metered infrastructure.** Published tiers: **Free** (`$0`, 1M
credits/mo, 10 RPS) → **Developer** (`$49/mo`, 10M, 50 RPS) → **Business** (`$499/mo`, 100M,
200 RPS) → **Professional** (`$999/mo`, 200M, 500 RPS), with enterprise above that
(`helius.dev/pricing`). Rings is in **private beta**, so it has **no published commercial price** —
do not quote one.

**Vanta turns into that revenue two ways:**

1. **As a customer, on volume.** Every send is a Zolana proof through Helius's prover, an indexer
   read, and RPC traffic — all credit-metered. Vanta's relayer runs its own RPC (`SOLANA_RPC_URL`)
   and the app ships a devnet key, so at demo scale the whole thing sits inside the **Free** tier.
   At Campaign-plan scale — one DAO onboarding 500 members — the account graduates up the tiers
   like any other app. Normal, boring, no downside.
2. **As distribution — the one that matters.** Helius acquired Light Protocol and sells Rings as
   Solana's privacy layer; the stated buyer is **institutions**. What an institution asks before it
   buys a privacy layer is whether a real client runs on real hardware, whether there is a public
   disclosure surface, and whether there is an auditor-key path. Vanta is those three things.

**The line to say, verbatim:**

> "At our scale Helius earns approximately nothing from us, and that is the correct relationship.
> We are not asking for a cut of anything — we are asking to be the first phone on their rails:
> the client that proves the rails work in a consumer's hand, and the one that tells them what
> broke."

---

## 6. What NOT to say

- 🚫 **Not** "the relayer pays all gas and skims it back." False on these rails, and falsifiable by
  the judge from the SDK changelog he wrote.
- 🚫 **Not** "a Jupiter cron job swaps our fees to SOL." `PLAN.md` P3 cut it. Fees arrive as
  **notes in the pool**; converting them is a treasury decision with its own privacy budget, and
  saying "we'll figure that out at scale" is a stronger answer than a cron job.
- 🚫 **Not** a per-transaction fee that is larger than the transfer. The old draft's `0.15 USDC` on
  a `0.1 SOL` send is a `10%` fee and reads as unserious.
- 🚫 **Not** "revenue" without the marker. Say **"model"**, say **"devnet, no fee today"**, and let
  the judges price the direction themselves. Overclaiming revenue in a hackathon is the same
  failure mode as overclaiming privacy, and this deck has spent twelve slides earning the right to
  be believed.
- 🚫 **Not** an SKR or token angle. `go-to-market.md` §1 says it: forced tokenomics on this panel
  reads as mercenary.

---

## 7. Where it slots into `pitch-deck.md`

| | |
|---|---|
| **Position** | New **slide 9b**, immediately after "Who it's for, and why they come back" — monetization is a **PMF/stickiness** artifact, and that is the slide it extends |
| **Full deck** | Add it; total moves from ~6:15 to ~6:45 |
| **3-minute cut** | Do not cut the slide; compress it to the speaker-note sentence about onboarding cost + the break-even number, spoken over slide 9 |
| **If a judge asks "so how do you make money?"** | Give the 30-second note verbatim. It is 90% "the constraint is the model" and that is the part they will remember |

---

## 8. Claim → receipt map

| Claim | Where it comes from |
|---|---|
| Relayer cannot pay for Shadow/Ghost | `docs/pitch-deck-relayer-fee-payer-section.md` §1–4 · guard at `…/private-transaction.ts:114` |
| Registration = `0.001340960 SOL`, relayer-paid | `PLAN.md` §2.4 · `docs/live-test-evidence.md` |
| Shield relayer-paid; `5,000–25,000` lamports observed | `PLAN.md` §2.4 · `docs/live-test-evidence.md` |
| Shadow/Ghost fee `5,000` lamports, spend identity pays | `docs/vanta-privacy-architecture.md` §8.2–8.3 |
| Gas float `0.002 SOL` covers ~400 spends | `src/App.jsx:375` (`if (bal >= 2_000_000) return // >= 0.002 SOL`) · funded by `relayer/server.js` `POST /fund` (`MAX_FUND_SOL` default `0.05`) · `PLAN.md` §4.2 |
| A new note costs `≈0.000701040 SOL` rent | `docs/vanta-privacy-architecture.md` §8.2 (lamport deltas) |
| `buildSplitTransaction` / `buildMergeTransaction` exist | Zolana README, vendored `vendor/…0.3.0-alpha.tgz` |
| `.vanta` handle is a Postgres row with an Ed25519 claim proof | `relayer/db.js`, `relayer/schema.sql`, `PLAN.md` §2.10 |
| Identity-signed history, 5-minute freshness window | `relayer/server.js` (`PROOF_MAX_AGE_MS`) · README §"How it works" |
| Devnet-only, no fee taken today | `README.md` §Known limitations · `PLAN.md` §5 B5 |
