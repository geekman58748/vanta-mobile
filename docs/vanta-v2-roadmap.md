# Vanta v2 — roadmap

> **Why this file exists.** `pitch-deck.md` slide 12 lists five items and is deliberately thin.
> `PLAN.md` §6 P2 holds the near-term differentiators. Neither says what *v2* is — the release
> where Vanta stops inheriting Rings' default tradeoffs. This is that document.
>
> **Claims discipline.** Everything here is **direction**, never shipped. The same rules as
> `pmf-narrative.md` §6 apply: "confidential", never "anonymous"; never "untraceable". Where a
> pillar depends on a Helius roadmap item Vanta does not control, it says so.

---

## 0. What v2 is actually for

Vanta v1 is a client for the **default ring**. That ring has three properties we did not choose
and cannot fix by config:

1. **A spend must be signed and paid by the note owner.** `feePayer == owner` is enforced before
   the proof is built. Consequence: the spend identity is on-chain, reused, and the user must hold
   SOL. *(Residual #2 in the honesty table.)*
2. **There is no policy surface.** No auditor key, no disclosure tier — so a DAO cannot buy it
   without an unbudgeted legal answer.
3. **Custody is a shared vault under a live upgrade authority we do not hold.** The largest trust
   assumption in the design, and the one we cannot fix at all.

**v2 = close #1 and #2, and get honest about #3.** In priority order, and in that order of
difficulty.

---

## 1. Pillar A — Custom ring (the unlock)

A custom Ring is Helius's **supported extension point** (`RingProgramBinary`, `deployRingProgram`,
policy tiers, auditor keys — `vanta-privacy-architecture.md` §5). It is *not* writing our own pool:
the circuits, the prover and the indexer stay Helius's. This is the difference between a two-week
integration and a multi-month ZK build, and it is the reason this pillar is feasible at all.

### A1 — Relayer-paid spend (gasless, and the end of residual #2)

The primitive exists upstream: `buildRingExitTransaction` takes a `feePayer` param, the note owner
co-signs beside the relayer, and the changelog records the carve-out
(`pitch-deck-relayer-fee-payer-section.md` §4). What it buys:

| | v1 (default ring) | v2 (custom ring) |
|---|---|---|
| Fee payer on a spend | the owner — **visible, reused** | the relayer — a **shared service address** |
| Reusable spend identity | yes, `account[0]` | **gone** — no per-user identity left on chain |
| Does the user need SOL? | yes (the `/fund` float exists for this) | **no** — `/fund` retires |
| Who can count your sends | anyone you've paid | nobody |

**The honest limit, which must travel with the claim:** this closes the *spend* identity, not the
*deposit* edge. The Shield still publicly names the funding wallet. Relayer-paid spends without a
hardened deposit gives you an anonymous spender with a public on-ramp — real progress, still not
end-to-end. A1 and B1 ship together or the story doesn't hold.

### A2 — Deploy the ring program *without* repeating the custody mistake

The current pool's authority is a **single key, live, not held by us**
(`2kgbLowv…`, `PLAN.md` §3.2). If v2 deploys a program, the authority policy is part of the design,
not a post-launch task: **threshold multisig across org + an independent party, behind a mandatory
timelock**, with the timelock duration published. Never a single key. Publish the authority address
on the landing page the day it deploys.

### A3 — Policy tiers (the sellable surface)

- **Public ring** — v1 behaviour, for demos and open use.
- **Compliance ring** — an auditor key that can open a payment only in a defined role, with the
  disclosure logged. This is the difference between "we cannot answer your auditor" and
  **"here is the key; here is the log of who used it."**
- **Private ring** — no policy. Where the product lives.

### A4 — Auditor-key disclosure, scoped

Wire the compliance ring to the existing `relayer/db.js` schema surface (`sumsub_verified`,
reserved handles — currently schema-only, `PLAN.md` §6 P2) so the disclosure path has a real
identity behind it. Do not build KYC into the wallet; build the *capability to disclose on demand*
and say so plainly.

### A5 — What A costs, stated honestly

Weeks of program work, an **independent audit before it touches mainnet**, a permanent key-escrow
trade (the note owner co-signs beside the relayer), and a re-run of the entire verification harness
against a new program. This is the one pillar where "shipping late" is the correct answer — an
unaudited custom pool is a worse story than a working default-ring client.

---

## 2. Pillar B — Close the rest of the residuals on the ring we already have

Ships **independent of A**, and is arguably worth more per engineering-hour.

- **B1 — Burner-mediated Shield.** The relayer funds a fresh burner that does the deposit, so the
  user's real wallet never appears in the deposit leg (`vanta-privacy-architecture.md` §3). This is
  the Umbra-era lesson, re-applied, and it is the half of the anonymity story A1 cannot supply.
- **B2 — Amount and timing decoupling.** A `buildMergeTransaction` / `buildSplitTransaction`
  scheduler: split on deposit, merge before spend, vary amounts and intervals. Kills the amount
  fingerprint without any new cryptography. *(Today: manual only.)*
- **B3 — Pre-funded identity pool.** Only needed while A1 is unshipped — buys "no single address
  accumulating a send graph" but *not* anonymity. Clearly label it as an interim patch, not a
  destination.
- **B4 — Pool depth, honestly.** Depth is the fix for correlation, and the only honest way to get
  it is real capital and real users. Seed a disclosed demo pool, publish the depth number on the
  dashboard, and never fabricate volume (`PLAN.md` P3).
- **B5 — A depth-aware warning.** The app should tell a user when the pool is too thin for their
  amount to hide. That is the receipt philosophy applied to correlation, and no other privacy
  wallet does it.

---

## 3. Pillar C — Custody

- **C1 — Timelocked multisig authority** on whatever v2 runs on (see A2). The single highest-value
  trust change available.
- **C2 — Delete the `localStorage` fallback wallet.** MWA-only. This retires residual #6 and the
  plaintext-key disclosure in one move, and it is a *deletion*, not a feature (`README.md`).
- **C3 — Seed Vault key path on a Seeker** (already roadmap) — the MWA route already puts the key
  in hardware; this makes the fallback-free path the *only* path.
- **C4 — Recovery that doesn't need a server.** The encrypted single-line backup exists
  (`src/lib/backup.js`). v2: social/guardian recovery with no host holding anything.
- **C5 — Independent audit.** EthelSec is on the judging panel; shipping v2 with a third-party
  audit closes the one gap the README explicitly concedes.

---

## 4. Pillar D — Do not depend on one provider

`PLAN.md` §10 asks it outright: *"Is a local prover possible, or is the Helius prover service
hard-required to spend?"* The honest answer today is that Helius's prover and indexer are in the
liveness path — if they are down, you can neither see nor spend your notes. For a wallet holding
real money that is a liveness risk, and v2 must name it.

- **D1 — Local or fallback prover.** Ship a degraded path (local proof generation, or a second
  prover) so "Helius is down" does not mean "your balance is unreachable".
- **D2 — RPC failover** across providers, with the active one visible in Settings.
- **D3 — Push-based note indexing** via Helius webhooks/LaserStream instead of post-send polling.
  This retires an entire bug class — the stale-balance symptom in `vanta-privacy-architecture.md`
  §8.5 is one instance of a general "we polled and guessed" pattern.
- **D4 — Publish the dependency map.** One page: what breaks, for whom, when each Helius service is
  down. A wallet that states its own blast radius is a wallet an auditor trusts.

---

## 5. Pillar E — Product surface (this is where PMF actually comes from)

The v1 demo is one payment. Nobody's real job is one payment.

- **E1 — Batch payout runs.** A DAO pays thirty contributors privately in one run, each with their
  own receipt. This is the Campaign-plan buyer's actual job, and it is the single feature most
  likely to make the wallet recurring.
- **E2 — Recurring private payroll.** The scheduler from B2, pointed at a list.
- **E3 — Payment links and invoices.** The recipient needs the *link*, not the app (Ghost already
  needs nothing from them).
- **E4 — Org accounts.** A treasury identity that is not one person's phone.
- **E5 — `.vanta` handle in the Receive sheet, plus release and transfer.** Already P0; it is what
  makes the handle an asset instead of a settings label.
- **E6 — Receipt verification without the app.** A URL an auditor or a payer opens to check a
  receipt against chain, no Vanta install. Turns the receipt from a screenshot into evidence.
- **E7 — dApp Store listing, Seeker Genesis Token gating, SKR paid discounts.** Gate *features* on
  SGT, never pretend a token is a privacy primitive.

---

## 6. Pillar F — Platform and the business

Slots into `pitch-deck-monetization.md`; named here so the roadmap and the model stay one document.

- **F1 — Fee note at scale.** Split-note collection, merge, batching below the note-rent floor,
  and privacy-budgeted treasury sweeps.
- **F2 — Relayer-as-a-service.** Other Seeker dApps embed the sponsorship + receipt layer.
- **F3 — Campaign plan billing** and the onboarding-fleet tooling behind it.
- **F4 — A public privacy scorecard per release.** The verification harnesses in `scripts/`
  (`linkability-report.mjs`, `forensic-x.mjs`, `test2-anonymity.mjs`) grown into a **reproducible
  report published with every version** — every send, and exactly which addresses are linkable.
  This is the artifact nobody else has, and it is cheap because the tooling already exists.

---

## 7. Sequencing

| Release | Contents | Gate |
|---|---|---|
| **v2.0 — mainnet readiness, no new program** | B1–B5 · C1–C5 · D1–D4 · E1, E5, E6 | independent audit; `DEVNET` badge becomes a cluster badge |
| **v2.1 — the ring** | A1–A2 (+ A5's audit) | program deployed behind timelocked multisig |
| **v2.2 — the sellable surface** | A3–A4 · F1–F3 | auditor-key design reviewed before any disclosure ships |
| **v2.3 — platform** | D3 pushed indexing · F4 scorecard · E2–E4, E7 | — |

**Rule for all of it:** A1 without B1 is a claim we would have to walk back, and an unaudited
program is worse than a working client. The cheap, high-value work is Pillars B–D; the headline is
Pillar A; do not let the headline reorder the work.

---

## 8. What does NOT go on this roadmap

- 🚫 **"Anonymous."** Even custom-ring + burner deposits leaves correlation at low pool depth. The
  promise is narrower and true: *the spend no longer carries a reusable identity, and the user
  never needs SOL.*
- 🚫 **A Vanta token.** The panel reads it as mercenary (`go-to-market.md` §1).
- 🚫 **Our own shielded pool / circuits.** Rings owns that surface; a custom Ring is the supported
  extension point and a from-scratch pool is a worse story, not a bolder one
  (`vanta-privacy-architecture.md` §5).
- 🚫 **Fabricated pool depth.** Ever.
- 🚫 **Mainnet before the audit.** The README already says this app should not hold real funds; v2
  is the release that changes that sentence, and it cannot be changed by an announcement.
