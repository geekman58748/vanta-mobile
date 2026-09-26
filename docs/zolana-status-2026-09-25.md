# ZOLANA STATUS — 2026-09-25 (investigation record)

> ## ✅ RESOLVED — 2026-09-25
>
> The blocking cause was **SDK ↔ on-chain program drift**: Helius upgraded the devnet
> programs in place on 2026-09-24 17:19/17:21 UTC (release `v0.3.0-alpha`), and
> `@heliuslabs/zolana@0.2.0-alpha` (still the newest on npm) **no longer works against
> devnet** — confirmed by Helius's own release note: *"Clients built against
> v0.2.0-alpha no longer work against devnet: instruction data, account lists and
> proving keys changed."*
>
> **Fix (verified: full E2E 10/10 green on devnet):** the matching TS SDK is *not* on
> npm — build it from the release tag:
>
> ```bash
> git clone --depth 1 --branch v0.3.0-alpha https://github.com/helius-labs/zolana.git ~/zolana-sdk-v0.3.0
> cd ~/zolana-sdk-v0.3.0/sdk-libs/ts && npm install && npm run build
> cd ~/vanta-mobile && pnpm add file:../zolana-sdk-v0.3.0/sdk-libs/ts
> ```
>
> Then: `node scripts/e2e-zolana.mjs` → register ×2, shield, sync, ghost, shadow all pass.
>
> ### Migration deltas for `src/App.jsx` (0.2.0-alpha → 0.3.0-alpha)
> - `buildRegistrationTransaction({ client, owner, address, payer? })` — the program now
>   takes a **separate `payer` account for sponsored rent**. The old `feePayer` arg is
>   ignored. **Our relayer can sponsor registration** (`payer: relayerAddress`) — a real
>   privacy win: the new identity never touches the user's wallet.
> - `deposit`/`ring_deposit` entries no longer carry application data — internal to the
>   SDK; this is what caused our `TrailingBytes` failures.
> - Prover routes moved under a `/v1/zolana` gateway prefix — the SDK handles it; the
>   existing `proverUrl` needs no change (proven by the passing E2E).
> - Rest of the breaking list is **custom-ring surface only** — irrelevant to Vanta v1.
> - **Operational rule (now enforced in the harness):** call `syncWallet` after *every*
>   confirmed tx before building the next spend, or the next build fails
>   (`WALLET_BUILD_TRANSFER`). Sync with `config: { requireSlot: slot }`.

---

> **Original investigation (kept for the reasoning trail)** — Every Zolana flow failed
> with cryptic program errors; the cause was not our code. Helius redeployed the devnet
> zolana programs on **2026-09-24 17:19/17:21 UTC**, changing instruction layouts.
> Deposits provably worked on 2026-09-21 with the then-current SDK.

---

## 1. Evidence (all reproducible)

### On-chain program deploy times (`scripts/program-deploy-times.mjs`)

Reads `lastDeployedSlot` from each program's *programdata* account, then `getBlockTime`:

| Program | Address | Last deployed |
|---|---|---|
| shielded-pool | `sppU489D7A4U1exNo1oeMGZtLEofq3a6o2fR7UeoWB6` | **2026-09-24 17:19:25 UTC** |
| user-registry | `regyS5rkAcw2YzDJCmTwCTHs2s246FXxbmuRZ42u2PD` | **2026-09-24 17:21:21 UTC** |

### SDK timeline (npm)

```
0.1.6-alpha  published 2026-09-03
0.2.0-alpha  published 2026-09-21   ← newest published, installed in node_modules
```

### Our last known-good run

Relayer `FhV7cyfVAC8gyQqSRYiw5oKdC95GVw83ukvxhhu7uRk7` landed **successful deposits
2026-09-21 13:36–14:43 local** (`sppU489…` invoked as CPI, relayer as fee payer).
`node_modules/@heliuslabs/zolana` mtime: **2026-09-21 13:02** — unchanged since.

⇒ SDK did not change. The **programs** changed, 3 days later.

### Current failures (same SDK, today)

```
shield/deposit   → custom program error 0x1b58
                   Program log: ERROR: InvalidInstructionData caused by TrailingBytes
                   programs/shielded-pool/src/instructions/deposit/processor.rs:67:18
register         → InstructionError [0, "NotEnoughAccountKeys"]
```

Interpretation:
- **TrailingBytes** — we send *more instruction data* than the live program parses.
- **NotEnoughAccountKeys** — we send *fewer accounts* than the live registry expects.

Both are layout drift, in the same direction: the live programs are a different build
than `0.2.0-alpha` targets.

## 2. Repro / verification tooling (keep these)

| Script | Purpose |
|---|---|
| `scripts/e2e-zolana.mjs` | Full headless E2E: relayer check → fund identities → register → shield → sync → ghost → shadow. Persists identities in `.e2e-identities.json` (gitignored). **Rerun this after any SDK bump — it is the acceptance test.** |
| `scripts/forensic-relayer.mjs` | Classifies every tx touching the relayer wallet. |
| `scripts/forensic-x.mjs` | Traces the ephemeral identity X (75+ txs) via Helius RPC with 429 backoff. |
| `scripts/program-deploy-times.mjs` | Reads on-chain program redeploy timestamps (the decisive check). |
| `scripts/topup-relayer.mjs` | Faucet top-up with retries + balance verification. |

Notes learned the hard way:
- Versioned (v1) transactions: fetch with `maxSupportedTransactionVersion: 1`, and
  `@solana/web3.js` cannot parse them at all — use raw JSON-RPC or `@solana/kit`.
- Public devnet RPC rate-limits aggressively (429); use the Helius endpoint (key is
  already in `src/App.jsx`). Faucet is per-IP daily-limited — fund the relayer ahead of
  demo days; currently ~0.72 SOL.

## 3. What is NOT blocked (do this while waiting for the SDK)

1. **Phase 5 — "what's shielded" honesty UI** (receipt copy, mode labels).
2. Landing page, positioning graphics, README rewrite, architecture diagram.
3. Demo video script + recording setup (record when flows are live again).
4. Error/empty/loading states; the `MaxLoadedAccountsDataSizeExceeded` class of failure
   deserves a friendly message (`scripts/` shows it recurs as wallets accumulate UTXOs —
   the SDK exports `buildMergeTransaction` / `buildSplitTransaction` for UTXO hygiene).

## 4. Unblock paths (in order)

1. **Ask Helius for the SDK matching the 2026-09-24 program deploy** (message below).
   Programs went out today; the alpha SDK normally follows.
2. **On SDK release:** bump `@heliuslabs/zolana`, run `node scripts/e2e-zolana.mjs`,
   expect all steps PASS. Then re-verify the app in the browser.
3. **Fallback if Helius is slow:** the committed Umbra burner flow (branch `main`,
   commit `70cd65e`) is E2E-proven with on-chain evidence in the old HANDOFF §6.
   It is a legitimate demo fallback — "two privacy rails" is a story, and Umbra one
   is tested with real signatures.

## 5. Ready-to-send message to Helius

> Hi — we're building on the zolana/Privacy Rings devnet deployment. Our flows worked
> against your devnet programs on Sep 21 (shielded-pool `sppU489…`, registry `regyS5rk…`).
> As of today the same `@heliuslabs/zolana@0.2.0-alpha` client gets:
>
> - deposit → `InvalidInstructionData caused by TrailingBytes`
>   (`programs/shielded-pool/src/instructions/deposit/processor.rs:67:18`)
> - registration → `InstructionError [0, NotEnoughAccountKeys]`
>
> The programs' programdata accounts show last deployed `2026-09-24 17:19:25 UTC` and
> `2026-09-24 17:21:21 UTC`. We ship in days for a hackathon. Is there an alpha SDK build
> that matches this deploy, or a planned publish time? Also: does registration still
> require only `[userRecordPda, owner, systemProgram]`?

## 6. Current repo state

- Branch `zolana-rework` @ `028544f` — full Zolana rework snapshot (relayer, App.jsx
  rewrite, docs). `main` still holds the working Umbra flow.
- `relayer-keypair.json` is **committed** — move it to an env var / gitignore it before
  the repo goes public.
- Self-hosted relayer runs on `:3001` with `/status`, `/address`, `/relay`, `/fund`.
