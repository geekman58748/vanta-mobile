# Vanta — PMF & stickiness narrative (PLAN B5)

> **Why this file exists.** Judging for CLOCK IN is scored on *stickiness & PMF · UX ·
> innovation · presentation/demo*. The codebase demonstrates UX and innovation; nothing in
> the repo answers the stickiness question. This document is that answer — the retention
> story to lift into the **pitch deck**, the **demo video script**, and the **README**.
>
> Claims discipline: everything here obeys `PLAN.md` §7.5 and `HANDOFF.md` §9. No
> "anonymous", no "untraceable", no "sender hidden". Every claim either has a tx hash
> behind it or is explicitly framed as direction.

---

## 1. The gap, stated honestly

Today's demo is a one-time trick: install → connect → Shield → send privately → see the
receipt → done. Impressive once, forgotten by week two. A judge asking *"why is this still
on the phone after month one?"* currently gets silence.

**The reframe: Vanta is not a trick you perform, it is a wallet you keep money in.**

---

## 2. The core narrative — "Raise publicly, spend privately."

This is already the product tagline (`HANDOFF.md` §0). The PMF story is what it implies:

> **You ran a fundraiser. Everyone saw the money come in. Nobody sees where it goes.**

- A campaign, a DAO treasury, a collective splint, a person paying rent after a public
  fundraiser — the **inflow is public by design** (that's the trust: donors see the pool
  fill), and the **outflow is private by design** (that's the safety: recipients, amounts,
  and cadence stay between payer and payee).
- The pool hides **the link between funding and payout** and **who you pay**. It cannot
  hide that you funded the pool — and we say so on every receipt.

**Why this is sticky, not a stunt:** a crowdfund is *repeatable*. Every campaign, every
grant round, every community treasury is a new cycle of raise → shield → pay out. The
wallet isn't opened once — it's opened **whenever money moves that shouldn't be public
between two parties**. The recurring object is the campaign, and Vanta is where it lives.

---

## 3. The four reasons a user comes back

### 3.1 The `.vanta` handle — your persistent private identity
- Claim once (`maxx.vanta`), reuse forever: payees can be paid *by name* without ever
  seeing an address beforehand.
- One handle per owner, Ed25519 claim proof, stored in Postgres — a real, portable
  identity asset, not a settings label.
- **Stickiness mechanic:** the handle is only valuable if it's kept — the same reason a
  phone number churns with you. Handles create switching cost *for the user's benefit*
  (recipients keep recognising you), not lock-in tricks.
- **Currently underexposed** — the handle doesn't appear in the Receive sheet yet
  (PLAN P0). That polish directly serves retention: you can't reuse what you can't see.

### 3.2 The activity ledger + honest receipts — a history worth keeping
- Every send produces a per-leg receipt (amount hidden ✓, recipient hidden ✓, sender
  fee-payer visible ⚠️) with a real tx hash, plus a portable **PDF export**.
- Receipts are records people keep: expense proof for a campaign, evidence for a DAO,
  a paper trail that says *what actually leaked* — which no other wallet produces.
- **Stickiness mechanic:** the ledger is the reason to open the app *after* the send —
  to check, export, or verify. History is retention.

### 3.3 The Seeker-native custody path — the phone where it actually works
- On a Seeker, the Seed Vault holds the funds' signing key; Vanta never stores it.
  (Today's dev build keeps the shielded key in `localStorage` — flagged as the real gap
  in `BETA-TEST.md`; Seed Vault is the fix and it is *only* natural on Solana Mobile
  hardware.)
- **Stickiness mechanic:** an app that is *more secure on this specific device* than on
  any other is an argument to keep it — and it's exactly why this belongs in the dApp
  Store rather than as a web page.

### 3.4 The loop that requires two parties
- Private sends need a registered counterparty (Shadow Vanta→Vanta) or a public address
  (Ghost). As more people you pay register handles, sending gets *easier*, not just more
  private — the network is the retention.
- Honest caveat: at hackathon scale this loop is thin. It's a **direction**, and the
  deck should present it as the roadmap, not the current state.

---

## 4. One-line PMF answers (for each judge's likely question)

| Question they'll ask | Answer to give |
|---|---|
| Who is this for? | Anyone who has to move money whose *details* shouldn't be public but whose *fact of payment* is legitimate — crowdfunders, DAOs, grant recipients, privacy-conscious Seeker owners. |
| Why now? | Rings (Helius's privacy rails) went into private beta Aug 2026; nobody has shipped a consumer client for it. Vanta is that client, on-device, via MWA. |
| Why does a user return? | Handles persist, receipts accumulate, campaigns recur. Day-30 Vanta is a wallet with your history and your name in it. |
| Why Seeker / Solana Mobile? | Seed Vault custody makes the security story real instead of `localStorage`; MWA means Vanta never holds the key. Mobile-first because the wallet is the phone. |
| Why not a feature of the wallet itself? | Wallets optimise for *moving* value publicly. Vanta is the layer for when public movement is the liability — receipts, honesty and shielding as the product, not a setting. |
| What's the moat? | Honest receipts backed by tx hashes + a working Rings client. The differentiation today is *difficulty* (see PLAN §7.4) — say that plainly rather than overclaiming. |

---

## 5. Copy blocks ready to lift

**Deck slide — problem:**
> Raising money in public means *staying* public. Every donor, amount and payout in a
> fundraiser is permanently visible — to competitors, to harassers, to anyone with a
> block explorer. People either accept the exposure or lose the crowdfunding model
> entirely.

**Deck slide — product:**
> **Vanta — raise publicly, spend privately.**
> Funds enter a shielded pool where everyone can see the campaign fill. Payouts leave to
> recipients whose identities and amounts are not derivable from chain data. Every send
> ships a receipt that states exactly what leaked — because a privacy product that
> overclaims is worse than none.

**Video narrative (30-second spine):**
> 1. Show a public explorer: a Shield deposit — *depositor and amount, fully public.*
>    Say so.
> 2. Show a Vanta→Vanta Shadow send — explorer shows the sender paying a **5,000-lamport
>    fee** and nothing else; amount and recipient absent from the transaction.
> 3. Show the receipt: hidden amount ✓, hidden recipient ✓, visible fee-payer ⚠️ — with
>    the real hash.
> 4. Ghost withdraw — amount becomes public again *on the way out*, deliberately.
> 5. Close on: "The pool hides the link between funding and payout. We'll tell you
>    exactly what it doesn't."

**README opening paragraph:**
> Vanta is a devnet privacy wallet for Solana Mobile. Shield funds into a shared pool,
> pay other Vanta users without exposing amounts or recipients, and withdraw to any
> public address — every step accompanied by a per-leg receipt that names what's hidden
> *and what isn't*. Built on Helius Zolana (Privacy Rings), signed on-device through the
> Mobile Wallet Adapter, packaged as an Android APK.

---

## 6. Honesty guardrails (do not drift from these)

- ✅ "the amount and recipient are not derivable from on-chain data (Shadow send)"
- ✅ "confidential" — never "anonymous"
- ⚠️ Always disclose: public Shield edge, reused spend identity, small anonymity set,
  shared-vault custody with a live upgrade authority, device wallet is the public
  depositor on the MWA path.
- 🚫 No fabricated pool volume / bots (PLAN P3). The thin-pool problem is addressed by
  *real* seeded demo volume and honest wording.
- The stickiness claims in §3.4 are **roadmap**, and the deck must label them as such.
  Nothing in this file that isn't shipped may be presented as shipped.

---

## 7. What would make this narrative *true* instead of *aspirational*

Ordered by effort — first two are submission-scope:

1. **Handle in the Receive sheet** (PLAN P0 polish) — makes §3.1 visible in the demo.
2. **Tell the crowdfund story in video + deck** (this file) — zero code.
3. **Seed Vault custody on Seeker** — converts §3.3 from argument to property.
4. **Beta-test results table** filled in from `BETA-TEST.md` — real users, real flows,
   is the cheapest PMF evidence that exists.
5. Handle release/transfer + a second campaign flow — makes §3.4 a demo rather than a
   roadmap line.
