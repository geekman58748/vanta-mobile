# VANTA — PRIVACY ARCHITECTURE & THREAT MODEL

> Sources: `@heliuslabs/zolana` README (full), SDK source (`wallet/actions.js`,
> `wallet/registry.js`, `wallet/transactions.js`, `flows/compile.js`), on-chain
> forensics (see `docs/zolana-status-2026-09-25.md`). Claims below marked
> **[verified in source/doc]** or **[to verify once SDK matches programs]**.

---

## 1. What the rails actually are

**Solana Privacy Rings (zolana)** — "a programmable shielded pool with encrypted
onchain balances and execution directly on Solana" **[README]**.

The mental model is **notes (UTXOs) in a pool**, not accounts:

```
Vanta wallet ──deposit──▶  [ POOL: encrypted notes owned by shielded addresses ]
                                    │
                          ┌─────────┴──────────┐
                    transfer (private)   withdrawal (public exit)
                          │                    │
                 new encrypted note      plain SOL/SPL transfer
                 owned by recipient       to any address
```

- **Shielded address** — derived *client-side* from the wallet seed:
  `ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(seed))`.
  It is **permanent per wallet** and published once to the **on-chain registry**
  (`owner → shielded address`) via `buildRegistrationTransaction`.
  Helius does **not** issue it; they run the Photon indexer (encrypted state) and
  the ZK prover service. **[README + registry.js]**
- Everything is one Solana transaction (v1 format, ≤4096 bytes), so a proof-carrying
  transfer fits in one tx. **[README]**
- `WalletKeys` = `ShieldedKeys` (decrypt/derive/transactionKeys) + `ProofAuthority`
  (prove/proveMerge). Keys stay client-side (or in an enclave) — proving is batched.
  **[README]**

### The three operations

| Operation | Builder | Recipient | Registry needed? |
|---|---|---|---|
| **Shield (deposit)** | `buildDepositTransaction` | your own shielded address | no |
| **Shadow (private transfer)** | `buildTransferTransaction` | a **registered** Solana address or a `ShieldedAddress` | **yes** — else `WALLET_RECIPIENT_NOT_REGISTERED` |
| **Ghost (withdrawal)** | `buildWithdrawalTransaction` | **any** public Solana address | no |

Plus `buildSplitTransaction` / `buildMergeTransaction` for UTXO hygiene.

## 2. What each mode hides — and what it leaks

The single most important line in the entire product documentation:

> **"Anonymous transfers that would use a relayer are not supported."**
> — README, *Custom Rings* section

Rings are **confidential**, not anonymous. Confidential hides *values*; anonymous
hides *who*. Zolana gives you the first, and gives you it well. It does **not** give
you the second, because:

1. **The transaction's fee payer is the spending owner identity** and is public in
   every Solana tx. The SDK enforces `fee payer is also the shielded owner`
   ("the shielded keypair and the Solana signer must use the same owner seed").
   You cannot delegate fees to a relayer. **[README + integration doc]**
2. **The registry is a public map** from `owner` (a plain Solana address) to
   shielded address. **[registry.js]**
3. **A deposit names both parties publicly**: `depositor` (your wallet) and the
   shielded `recipient`. **[deposit.js; observed on-chain 09-21]**

Chain those three and you get a link: *recipient sees withdrawal tx → fee payer `X`
→ registry: `X ↔ shieldedAddress` → deposit tx where `depositor = Vanta wallet`.*

### Honest claim table (use this verbatim in the submission)

| | Amount | Recipient | Initiator / sender | Deposit leg |
|---|---|---|---|---|
| **Shield** | 🌐 public | 🕶️ shielded | 🌐 public (depositor) | 🌐 public |
| **Shadow** (Vanta↔Vanta) | 🕶️ **hidden** | 🕶️ **hidden** (encrypted note) | ⚠️ visible (`X`, fee payer) | 🌐 public |
| **Ghost** (→ any address) | 🌐 **public** (recipient must receive a real amount) | 🌐 public (by design) | ⚠️ visible (`X`, fee payer) | 🌐 public |

**Two corrections to the current pitch:**
- Ghost does **not** hide the amount. The recipient receives a concrete public SOL
  transfer out of the pool. Ghost breaks the *sender↔recipient* link; it cannot
  encrypt the amount of a public exit.
- "Sender hidden" is only true in the sense that the on-chain initiator is `X`
  (a privacy identity, not the Vanta wallet) — and `X` is linkable to whoever
  funded the deposit, unless we break that edge (see §3).

## 3. Your required flow, and how to actually get it

> *"Send funds to an address; the receiver never knows where it came from — not
> tieable back to my Vanta wallet, regardless of having deposited through a burner."*

That is an **anonymity** requirement, and it is achievable on these rails **with a
client-side hardening layer** — no new crypto needed. The technique is the one you
already invented for Umbra (burner-mediated funding), transplanted:

```
        (A) CURRENT — linkable
   Vanta wallet ──deposit──▶ S_X ──withdrawal(fee payer X)──▶ recipient
        └──────────────── one public edge ────────────────┘

        (B) HARDENED — severed
   relayer ──▶ burner (fresh) ──deposit──▶ S_X ──withdrawal(fee payer X')──▶ recipient
                 └─ no public edge to the Vanta wallet ─┘
```

Concrete changes (all client-side, in `App.jsx`):

1. **Burner-mediated deposit.** Generate a fresh burners wallet, fund it from the
   **relayer** (not from the Vanta wallet), and have it do the deposit to `S_X`.
   The Vanta wallet never appears in the on-chain deposit leg. *(This is exactly the
   §4.5 lesson from the Umbra era, re-applied.)*
2. **Rotate the spending owner.** Today `X` is a persistent localStorage identity
   (`vanta-ephemeral`) — so **all your spends cluster together** and `X`'s history
   is the user's history. Rotate `X` per spend (each funded by the relayer). Cost:
   one extra funded keypair + registration per spend. Benefit: unlinkable spends.
3. **Decouple amount + timing.** Save and withdraw different amounts; leave a
   delay between deposit and withdrawal; use `buildMergeTransaction` /
   `buildSplitTransaction` to break amount fingerprints.
4. **Never deposit straight from the Vanta wallet** when the claim is anonymity.
   The UI should say so, per mode.
5. **Verify the anonymity set.** Hiding inside a pool of 2 depositors isn't hiding.
   For the demo, run several burner deposits first so the pool has depth.

### Acceptance test for the claim (we have the tooling)

Private-send to a fresh wallet, then open the inbound tx and assert:
**no Vanta wallet address, no reusable identity from a previous send** — only
pool/relayer/burner accounts. This is the §6-style E2E script from the Umbra era,
which is exactly what judges and auditors will ask for.

## 4. Proposed architecture (5 layers)

```
┌─ 5. HONESTY ─── per-mode receipt: what's hidden / public / linkable  (Phase 5)
├─ 4. HARDENING ─ burner deposits · X rotation · amount+timing decoupling · UTXO merge/split
├─ 3. RAILS ───── zolana Privacy Rings (confidential)  [Umbra burner flow = anonymous rail, proven]
├─ 2. IDENTITY ── Vanta wallet (self-custody) → shielded address (permanent, derived)
│                 + ephemeral owner X (fee + note-owner role, rotatable)
└─ 1. STORAGE ─── encrypted wallet snapshot (walletSnapshotCipher, AES-256-GCM)
```

**Why keep Umbra in the picture** (even though the zolana rework removed it):
the two rails have *different* privacy properties — zolana = confidential
(amounts), Umbra = anonymous (relayer + ephemeral signer, recipient does nothing).
"Confidential for amounts, anonymous for linkage" is a genuinely strong, honest
story, and Umbra is the only one of the two with **proven on-chain evidence**.

## 5. Should we sprint-build our own ZK privacy program?

**Verdict: no — not for this deadline.** Reasoning:

- What's *missing* (relayer-paid spends → true sender unlinkability) is not a
  small patch. It needs a verifier that accepts a proof without the owner signing,
  an anti-double-spend nullifier set, encrypted note delivery, and a prover — i.e.
  a Tornado/Elusiv-class protocol. That's a multi-week build *before* it's
  trustworthy, and an unaudited custom pool is a **worse** story than using
  Helius's rails. Judges in the Colosseum track reward working, verifiable demos.
- Rings explicitly own this surface (`RingProgramBinary`, `deployRingProgram`,
  policy tiers, auditor keys). A **custom Ring** is their supported extension
  point — "Vanta ships a compliance Ring with an auditor policy" is a real,
  feasible differentiator that rides their infrastructure instead of replacing it.
- What *is* sprint-sized and high-value: **the hardening layer** (§3) + the
  **honesty layer** (§4.5). Both are pure client work, both are demo-able, and both
  are what actually converts "we used a privacy SDK" into "we built a privacy product".

If you want a code artifact that shows depth, make it the **verification harness**
(`scripts/e2e-zolana.mjs` grown into a report that prints, per send, exactly which
addresses are linkable). That's 1 day of work and it *proves* your claims.

## 6. Blockers & unblock paths

| Blocker | Status | Path |
|---|---|---|
| ~~SDK ↔ program drift~~ **RESOLVED 2026-09-25** — `@heliuslabs/zolana@0.3.0-alpha` (built from release tag `v0.3.0-alpha`) matches the live devnet programs; Shield / Shadow / Ghost verified live (§8) | ✅ | — |
| No `zolana` CLI on npm (`zolana dev start` local stack) | 🔴 unavailable | Not published; ask Helius. Would give a drift-free local stack |
| Faucet daily limits | 🟡 watch | Fund relayer (`FhV7…`, ~0.72 SOL now) ahead of demo days |
| UTXO growth → `MaxLoadedAccountsDataSizeExceeded` | 🟡 watch | `buildMergeTransaction` / `buildSplitTransaction`; sync after every tx |

## 7. Demo narrative (what to say, honestly)

> "Vanta has two rails. **Ghost** sends to any wallet — the receiver opens their
> wallet and the funds came from the pool, not from you. **Shadow** is Vanta-to-Vanta
> with encrypted amounts and hidden recipients — the chain sees a proof, not a payment.
> Deposits are public by design; we show you exactly what leaks, in the app, on
> every receipt. Here's the on-chain proof: [tx] — no Vanta address in the account
> list, and here's the same trace for a naive implementation that *does* leak."

That last sentence ("here's what a leak looks like") is your Umbra-era
deanonymization discovery turned into a demo segment. It reads as competence.

---

## 8. VERIFIED LIVE — 2026-09-25 (controlled A/B Shadow test)

Fully instrumented run with two fresh, **registered** identities where **both sides'
keys are held**, so the sender's *and* the recipient's note state could be read.
Keys live in `vanta-mobile/.vanta-test-wallets.json` (gitignored); never printed.
This section turns §2 from "read from the source" into "observed on devnet".

### 8.1 The rails work — sender debited, recipient credited

| Step | A (private) | B (private) |
|---|---|---|
| initial | 0 | 0 |
| after **Shield** 0.3 on A | **0.3** (1 note) | 0 |
| after **Shadow** 0.1 A→B | **0.2** (1 unspent of 2) | **0.1** (1 note) |
| after **Shadow** 0.1 B→A *(B held exactly one 0.1 note)* | **0.3** `[0.2, 0.1]` | **0** `[]` |

The last row is the edge case that looked broken in the app: a **note of exactly 0.1
sent as 0.1** spends fully with zero change. Sender → 0, recipient +0.1. Intent
captured at build time: `{kind:"transfer", amount:"100000000", recipient:{…}}`.
→ **No protocol-level bug. Amounts are applied; notes are spent and credited.**

Decode with:
```bash
cd ~/vanta-mobile && node scripts/check-indexed.mjs <SIG>   # indexer has the note
```
Sigs (devnet): Shield 0.3 `3f2UWBXy…iwsN` · Shadow 0.1 A→B `26JSzUqj…w8B` ·
Shadow 0.1 B→A `TDWmB1Yc…HSG`.

### 8.2 What the Shadow tx exposes — confirmed, not theoretical

Decoded lamport deltas of A→B (`26JSzUqj…w8B`):

```
CmPCvP42… (sender identity X)   Δ −0.000005000   ← FEE PAYER, PUBLIC
33KVhbT4… (pool)                Δ −0.001402080   ← rent for 2 note accounts
469NRJVj… (new encrypted note)  Δ +0.000701040
DPsTJ7Ff… (new encrypted note)  Δ +0.000701040
```

- **Amount hidden** — the 0.1 appears nowhere; note accounts are fixed rent-exempt
  size, so it can't be inferred from account size either.
- **Recipient hidden** — not in the account list (no loaded addresses either); the
  relayer is absent.
- **Sender VISIBLE** — `X` is account[0] (fee payer) and is **reused across all
  sends**. This confirms §2 and forbids any "sender hidden" / "zero on-chain sender
  trace" copy. `docs/zolana-integration.md` currently overclaims; fix the wording.

### 8.3 The relayer covers the on-ramp only — NOT spends

| Leg | Fee payer | Relayer in tx? |
|---|---|---|
| Registration | relayer `FhV7…` | ✅ |
| Shield (deposit) | relayer `FhV7…` | ✅ |
| Shadow (transfer) | sender identity `X` | ❌ |
| Ghost (withdrawal) | sender identity `X` | ❌ |

Structural, not a config choice — from the SDK's private-tx params:
> `/** The fee payer is also the shielded owner, so its signature authorizes the spend. */ readonly feePayer: Address;`

So neither Shadow nor Ghost can be relayer-paid on the default (confidential) ring.
The relayer's *only* role in a spend is funding `X`'s fee float — a public
`relayer → X` edge that links `X` to the service, never to the user's wallet.

### 8.4 What "rotate the spend identity" actually requires (§3.2 detail)

`X` owns the notes (the shielded keypair is derived from `X`'s seed) **and** is the
mandatory fee payer, so you cannot simply swap it per send — a fresh `X'` cannot
spend `X`'s notes. Rotation therefore needs either:

1. **Pre-funded identity pool** — identities created and funded *ahead of time* by
   the relayer; each spend draws one and burns it (no fresh funding edge, no
   cluster). ← preferred
2. **Private hop** — `X` privately transfers to `X'`, then `X'` does the send. Works,
   but the hop itself is fee-paid by `X`, so the clustering just moves to `X`.

**Buys:** no single address accumulating an activity graph ("identity made N
sends at these times").
**Does not buy:** anonymity — the **Shield deposit still publicly links the funding
wallet to the pool**, and amount+timing correlation still works at low pool depth.

### 8.5 App bug found during this test (the "wallet never got debited" symptom)

`shadowSend` / `ghostSend` in `App.jsx` perform a **single** `syncWallet` after
confirm and then refresh the balance immediately:

```js
const slot = await client.confirmTransaction(sig)
await zk.syncWallet({ ..., config: { requireSlot: slot } })   // ONE attempt
await zk.syncPersistedWallet({ ... })
refreshPrivateBalances()                                      // ← may be stale
```

If the indexer hasn't indexed the new notes at that slot yet, the wallet neither
sees the change note **nor marks the input spent**, so `balances()` returns the
**pre-send** number → the UI looks frozen. `syncPrivate` (load-time) already polls
6×/3s; the post-send path should do the same. Observed directly: a sender snapshot at
01:56Z held 6 notes, the send landed at 01:57Z, and the app only caught up at 02:01Z.

**Fix:** poll sync after a send until the note set actually changes, then refresh;
or defer `refreshPrivateBalances()` behind that poll. Until then, "Force resync from
chain" in Settings recovers the true balance.
