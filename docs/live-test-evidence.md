# LIVE TEST EVIDENCE — linkability A/B (devnet, 2026-09-25)

Two sends to the **same fresh receiver** (`92op1Hjhpp2wtDRBc48qF4rNxp2TXc6UCYJ3TwetWMp7`,
zero prior lifetime activity). One naive, one hardened. All hashes independently
verified by a second person on explorer.solana.com (devnet).

---

## Setup

| Role | Address |
|---|---|
| User wallet (funded with 0.1 by the tester) | `8HYp2Yjm5ds2Tr8TJVYwvqbJEuA3yp6dLCqc6J2z6WuW` |
| Spend identity **X** (pseudonym, fee payer + note owner) | `EJEMBpqyHjyJYU3bMdDqTVbuqdAgh7UCVPoZAeiUiedt` |
| Relayer (shared service, sponsor of rent + fees) | `FhV7cyfVAC8gyQqSRYiw5oKdC95GVw83ukvxhhu7uRk7` |
| Receiver (virgin address) | `92op1Hjhpp2wtDRBc48qF4rNxp2TXc6UCYJ3TwetWMp7` |
| Shielded pool program | `sppU489D7A4U1exNo1oeMGZtLEofq3a6o2fR7UeoWB6` |
| Pool account observed in both legs | `2iAazE9tAWcUJhNhfscRzX17Gb32Km9jJYZLGy1AnkVP` |

Reproduce any leg with:
```bash
node scripts/agent-live-test.mjs --inspect <SIG> --watch=8HYp2Yjm5ds2Tr8TJVYwvqbJEuA3yp6dLCqc6J2z6WuW
```

## A — NAIVE (user wallet deposits straight into the pool)

| Leg | Signature | Finding |
|---|---|---|
| Deposit | `5BSDgQcPTtiUnAR8V7kJdX2qvmx7qMBMpznAR9aJDhnFPGmgz1RLjTHXtvUDGwZCKTnFfmXG5C3rc5oUAA4KvEU9` | 🔴 **`8HYp2…` −0.05 as SIGNER** — the pool inflow is publicly tied to the funded wallet |
| Ghost | `2o5fKcGms1wvLqrBB1BPHsigWG432aNZB6LqL9aEKkrykaYSh3dRzjqBaZ1hrtV6uer3fgxu9ERUajfNF6NcWDQG` | X + pool + receiver +0.05. **No wallet address in this tx** — but the two legs correlate by amount (0.05) and timing (minutes), and the anonymity set was 1 |

Verdict: **LINKED in practice.** The public deposit edge is the weak point.

## B — HARDENED (relayer-funded single-use burner)

| Leg | Signature | Finding |
|---|---|---|
| Burner funding | `QvKmN5aCAUaRK5QEZm4KqMGLmuJmA3jjCYYvjMTQFph7oDrqugEbwvzt9rniLvC4zLX9Qcjgga3ueAfSRwzZ3qC` | relayer → burner `3AQdRqa5…` +0.06 |
| Deposit | `2RFVAMq1PedRQsikybEmsQZJ19PC4baRCQqqa8D249Dmxb7yEPTPFBDG9PCXoC5gaa1XWgh38Y3exgfysvcgrAq` | depositor = **burner** (−0.05), fee payer = **relayer**. No user wallet anywhere |
| Ghost | `2eKGAuw71AVykft5TivedCZiwBsMbTx77323XRuhPEJnewdXoZ5nyBhe14uijEHbrnw7ouYMhDe46ewRA9DHHHQL` | X + pool −0.05 → receiver +0.05. ✅ severance confirmed |

Burner `3AQdRqa59z6C4BnwWrCApfWzu2E8ZJEevLjfZNXab87M` lifetime = **exactly 2 txs**, then
abandoned forever. The relayer even paid its deposit fee.

Verdict: **SEVERED.** Trace terminates: receiver ← pool ← single-use burner ← relayer (service).

## How to read the trace (the return-path test) — demo narration

Trace the **funder's public wallet** end to end and two things stand out:

- You **can** see the money go in. `8HYp2…` → pool, publicly, on the deposit leg.
- You **cannot** see any return path. Nothing from the pool ever flows back to
  `8HYp2…`. The only value leaving the pool goes to the receiver — a different
  address, in a different tx, touching none of the funder's accounts.

A normal wallet leaks on every transaction: value in, value out, both ends named.
The pool severs the return path, so a deposit and a payout that a human knows are
related are **not joinable from on-chain data alone**.

Where that fully holds, and where it does not:

| | Deposit edge | Join deposit↔payout | Return path |
|---|---|---|---|
| **Naive** | public (`8HYp2…` visible) | not provable, **guessable** at anonymity set 1 | absent ✓ |
| **Hardened** | hidden (single-use burner) | not provable, guessable only if depth is low | absent ✓ |

One-line version for the video: *"They can watch me put money in. They can watch
money come out. They can never join the two — and in hardened mode they can't even
see that it was me who put it in."*

## Claim language (use this, not more)

✅ **We claim:** *the receiver cannot determine who funded a Ghost send from on-chain
data — the funding edge terminates at a single-use burner funded by a shared relayer,
and no user-controlled address appears in either leg.*

🚫 **Do not claim:** "untraceable", "anonymous", "invisible", "amounts hidden" (Ghost
exits pay a public amount by definition), or "the deposit is private".

⚠️ **Disclosed residuals (state them out loud; it reads as competence):**
1. The spend identity **X** is visible as fee payer/signer and is currently reused —
   spends from one X cluster. Fix: rotate X per spend.
2. Public exit amounts are visible, and with a small anonymity set amount+timing
   correlation is possible. Fix: pool depth, decoupled amounts/timing, batching.
3. The relayer is a shared service; its funding provenance is a service-level edge.

## Ground rules that made this test valid

- Receiver had **zero lifetime history** before the test (no pre-existing balance to
  muddy the trace).
- Both legs went to the **same receiver** so the two patterns are directly comparable.
- Every claim was checked by **two independent people** (agent + owner) on a block
  explorer, not by trusting a log line.

---

# MWA Shield end-to-end (devnet, 2026-09-26)

First proof that Vanta can sign a Helius Privacy Rings deposit **with a device
wallet over Mobile Wallet Adapter**, rather than with an in-app key.

Device: `emulator-5554` (Android 16, WebView 151). Wallet: `fakewallet` **v1**
flavor built from `solana-mobile/mobile-wallet-adapter@main`
(`vanta-mobile/scripts/mwa-v1-e2e.sh` drives the whole flow).

| Role | Address |
|---|---|
| Device wallet (MWA, depositor + fee payer) | `6NrEzXoaEzpxUuHERCtW46xKa3j41B2AAMG4R8a1zhDt` |

| Leg | Signature | Result |
|---|---|---|
| Relayer funding of the device wallet | `5HcLNQrecNBMrF7fX3EdQ4P8zcW6qsQpLNwWfN7U2cRfaNx9h69y5TRPjXi3x37quX5JC9dj5ndTuHcbpe3AmJUR` | ok |
| Shield #1 | `21sFAdV2GMBzfDpEehcZ9mfHxCsQdWqgQMyT2Fccjtn9nERrRBpAfjwwy1MtFcru15woFi9moerqDNBb2NmZcuEA` | ok (slot 504241480) |
| Shield #2 | `5HgkVeT8FaAgecmuLtPZCsuoBsV42zzrCXNop6BQcXtTPqDQhdwMsggyErRDwnFEmE9WuuXmbSUmxEASHGq8A9nT` | ok (slot 504241659) |
| Shield #3 | `3Z2zK7658GRuJLKxjFQaKxGqekvGakmV6HTpdyG3RgRMJofLMgFptDyuRUTDHJxmaTAm9CXP6uFeNoYkxRD3pR6A` | ok (slot 504241947) |

App reported **private balance 0.300 SOL** — exactly 3 × the 0.1 SOL Shield — and
`getSignaturesForAddress` shows 4 transactions, all `err: null`. The pool balance
and the on-chain record agree, so this is a real deposit and not a UI state.

**The bug this closed:** `src/lib/mwa.js`'s `serializeCompiledTx` emitted the
*legacy* wire layout `[sigCount][sigs][message]`. zolana compiles every builder to
a **v1** transaction, whose version byte is `0x81` and whose signatures trail the
message. Because wallet parsers dispatch on byte 0, the legacy prefix made the
wallet read `0x81` as a compact-u16 length and die computing an absurd offset:

```
java.lang.ArrayIndexOutOfBoundsException: length=361; index=8258
  at SolanaSigningUseCase.getSignersForTransaction(…:97)   // 8258 = 2 + 64*129
```

This presented as a *hang* (nobody could see the crash from the app) and was
misdiagnosed as a websocket/approval problem for a long time. Sending
`[message][sigs]` fixes it.

⚠️ **Dependency this exposes:** v1 transactions shipped with Agave 4.2 (Sept 2026)
and wallet support "is per-wallet and may vary". The stock `fakewallet` **release**
APKs are the *legacy* flavor (published under both names), and the legacy build
cannot sign a v1 payload at all. Any wallet Vanta supports must be v1-capable, so
the app should surface a clear error when a wallet cannot parse v1 instead of
reporting a generic signing failure.

⚠️ **Open question from this run:** three deposits landed across two harness runs,
one more than the harness clicked. The Shield button is disabled while loading, so
this most likely came from the harness tapping `AUTHORIZE` on a leftover prompt, but
it should be re-checked that a double click cannot enqueue two deposits.

---

# REAL-PHONE MWA Shield (devnet, 2026-09-26)

The same flow, on **physical hardware** with a **store-installed wallet** — no
emulator, no fakewallet. Device: Xiaomi `25128PC17G` (Android 16, MIUI), USB +
`adb reverse tcp:3000/tcp:3001`. This is the strongest evidence in the repo that
the hackathon criteria are met on a real device.

| Role | Address |
|---|---|
| Phone wallet (MWA-connected, depositor) | `CNfNBNtM5jxQV4mNnQ6iwmiFj9YjnANMoxZXhJrqR2qu` |
| Shielded identity X (fee payer on the deposit leg) | `FQk2Tvnqt8UDRNSmxLUejNDVtYXSEz5Mge6G7uuKHR2J` |

| Leg | Signature | Result |
|---|---|---|
| Relayer funding of the phone wallet | `2KetqjqfpTuA5dX8k3z9fufA2zNgz8mbMWm7tMoqS5zbtuTFruYRQPBJjFTxtAL44rLYRygFpsVtJ2oTn3KW1WXS` | ok |
| **Shield (real wallet, real phone)** | `5425RrTdiVEu8NYuoHJEysPiChRTa7puTcVS8hErPBufbgugv5BmUtdzuYrtPfNnFKHnjYwbSaUQt2c25oNMMgt5` | **Ok**, fee 5000 lamports, zolana program logs `success` |

Balance math checks out: 1.0 SOL funded → 0.899975 SOL after the 0.1 Shield +
fee/rent. Pool account `2iAazE9tAWcUJhNhfscRzX17Gb32Km9jJYZLGy1AnkVP` matches the
A/B test above.

**Correction to an earlier diagnosis (keep this honest):** the first Shield attempt
from the phone failed with "Failed to process request: reached end of buffer
unexpectedly", which was initially read as *this wallet cannot parse v1*. That was
**wrong** — a later attempt with the identical payload format succeeded on-chain.
The first failure was an **association/session flake** (the dapp-side log showed
`ws://localhost:<port>/solana-wallet` refused while the wallet showed its own error
screen), not a v1 rejection. Takeaway: MWA sessions on real phones can fail on the
first association and succeed on retry — the app should make retrying obvious
instead of surfacing a scary parse error.

## All three flows on the real phone (reconciled timeline)

Every lamport accounted for — there are no unexplained transactions:

| Time (local) | Flow | Signature | Ledger shape |
|---|---|---|---|
| 03:30:24 | **Shield** | `5hazTBthEkfUtra67zH2J4HJLDi6TCB51kQYLqKy…` | wallet −0.100025 → pool +0.100000, fee 25,000 |
| 03:32:00 | **Ghost** (to own wallet) | `5425RrTdiVEu8NYuoHJEysPiChRTa7puTcVS8hErPBufbgugv5BmUtdzuYrtPfNnFKHnjYwbSaUQt2c25oNMMgt5` | pool −0.100000 → wallet +0.100000, X-signed, fee 5,000 |
| 03:35:24 | **Shield** | `2myFyKrQ1VKgWCps9pnNv93MLiSEXQz92SZ3…` | wallet −0.100025 → pool +0.100000, fee 25,000 |
| 03:44:06 | **Shadow** → `9j7fG9…qeWb` | `Jvsk1XADAWYcnVgxyfcnjz1a6c5ujaBLUawt…` | **recipient absent**, no SOL transfer — only note rent (−0.001402 / +0.000701 ×2), X-signed |

Shadow privacy checks (from `getTransaction`, not the app's word):

- recipient `9j7fG9…` appears in **neither** shadow transaction
- no plain SOL transfer in the spend leg — only note PDAs churning rent
- the recipient address gained **zero new on-chain activity** (all 8 of its
  signatures predate the send)

Ghost honesty note: this Ghost went to the **user's own wallet**, so it demonstrates
"amount public, payout from pool" — but since recipient = depositor here, it does
**not** demonstrate unlinkability. The unlinkability demo needs a Ghost to an
**external** address that never shielded (e.g. the Backpack wallet or a fresh key).
The claim language stays: pool payout is public; the *link* to the depositor is what
the pool severs — when the recipient is not also the depositor.
