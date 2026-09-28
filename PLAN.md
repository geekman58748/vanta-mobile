# VANTA — PLAN / STATUS / ACTION LOG

> **Living document.** Read alongside `HANDOFF.md` (**current** master handoff) and
> `docs/vanta-privacy-architecture.md` (threat model + live evidence).
> The Umbra-era handoff is archived at `docs/handoff-umbra-era-2026-09-20.md` —
> it predates the Zolana pivot and is actively misleading if read as current.
>
> Last updated: **2026-09-28 ~14:30** — full remediation pass over
> `docs/AUDIT-2026-09-27.md`: every finding C1–L5 is now fixed, or explicitly disclosed
> where a fix is impossible in-architecture (C3/L5). Session log: **§19**.
> Owner: Maxx · Hackathon deadline: **2026-10-08** (CLOCK IN, Solana Mobile × RadiantsDAO)

---

## 0. SNAPSHOT — where we stand right now

| Thing | State |
|---|---|
| Branch | `zolana-rework` @ `028544f` (`main` @ `70cd65e` = old working Umbra flow) |
| Working tree | **dirty — nothing committed.** ~30 untracked/modified entries: `android/`, `landing/`, `relayer/{db,schema.sql,env.js,Dockerfile,fly.toml,README.md,test-db.mjs}`, `src/{components,lib}/`, `scripts/`, `docs/*.md`, `.env.example`, `PLAN.md` |
| App | `http://localhost:3000` — launchd `com.vanta.server`, serves `dist/` (HTTP 200) |
| Relayer | `http://localhost:3001` — launchd `com.vanta.relayer`, **0.353 SOL**, `database.ok: true` |
| MWA | Integrated and verified on-device 2026-09-26; `src/lib/mwa.js`, `src/lib/wallets.js` |
| SDK | `@heliuslabs/zolana@0.3.0-alpha`, **built from git tag** `v0.3.0-alpha` → `file:` link (npm's `0.2.0-alpha` is broken vs devnet) |
| Backend | Neon Postgres live (`DATABASE_URL` in `.env.local`): tx history + `.vanta` registry |
| Android | webshell project builds; **debug APK ✅, release APK ✅ SIGNED + verified** (§18.1). The APK **bundles the app inside itself** — it does not need a public web host. |
| Onboarding | ✅ **3-page first-run intro shipped** — `src/components/Onboarding.jsx`, localStorage-gated. §18.2 |
| Landing page | `landing/` — separate Vite site, `dist/` built |
| Build | ✅ `dist/` rebuilt 22:18 and re-bundled into `android/app/src/main/assets/www/` |
| Hosting target | **Northflank free Sandbox** (always-on, no sleeping) — replaces Fly.io. §18.3 |
| Network | Solana **devnet** only |

**One-line status:** the rails, the custody path, the backend and the packaging all
work; what is left is **UI surface + submission artifacts** (claim-name UI, honest
receipts, first-run intro, signing, deploy, video, deck).

---

## 1. WHAT WE HAVE

- **App** — `src/App.jsx` (1348 lines) + `src/components/` (7: `Drawer`, `SendDrawer`,
  `ReceiveDrawer`, `ActivityDrawer`, `ReceiptDrawer`, `SettingsDrawer`, `Toast`) +
  `src/lib/` (`config`, `mwa`, `wallets`, `haptic`, `format`, `clipboard`, `tokens`).
- **Three working privacy flows** against live devnet programs:
  - **Shield** — public → private (deposit)
  - **Shadow** — private → private, Vanta→Vanta (recipient must be registered)
  - **Ghost** — private → any public address (withdrawal)
- **MWA custody** — device wallet (Seed Vault / Phantom / Solflare) signs through MWA;
  Vanta never stores that key. In-app throwaway key path remains for dev.
- **Relayer** — `relayer/server.js` (674 lines), token-auth + caps + program allowlist:
  `/healthz` `/status` `/address` `/relay` `/fund` `/tx/:address` `/tx/report`
  `/names/:name` `/names/available/:name` `/names/owned/:address` `/names/claim`.
- **Postgres (Neon)** — `relayer/db.js` (301 lines) + `relayer/schema.sql`: `transactions`
  (+ `verified_on_chain`), `vanta_names` (Ed25519 claim proof), `reserved_names`.
  Harness: `relayer/test-db.mjs` (29 checks) — last run 32/32 per the session log.
- **`.vanta` handles** — resolvable in `SendDrawer` via `resolveVantaName` (`src/lib/config.js`).
- **Env-driven config** — `.env.example` / `.env.local`, `src/lib/config.js`
  (`VITE_HELIUS_API_KEY`, `VITE_RELAYER_URL`, `VITE_RELAYER_TOKEN`).
- **Android** — `android/` (official Solana Mobile webshell, `com.vanta.privacywallet`),
  `scripts/bundle-android.mjs`, `deploy/` (plists, keystore).
- **Landing page** — `landing/src/` (Hero, Flows, PrivacyReceipt, Faq, Marks, …).
- **Diagnostics / harnesses** — `scripts/`: `e2e-zolana.mjs`, `check-indexed.mjs`,
  `agent-live-test.mjs`, `linkability-report.mjs`, `test2-anonymity.mjs`,
  `forensic-*.mjs`, `program-deploy-times.mjs`, `topup-relayer.mjs`,
  `pdf-receipt-check.mjs` + `pdf-receipt-analyze.py` (**receipt PDF: render + pixel
  probe**), `test-name-resolution.mjs`, `device-test.sh`, `bundle-android.mjs`,
  `mwa-v1-e2e.sh` (**use this one**), `mwa-wire-check.mjs`, `mwa-shield-test.mjs`,
  `webview-inspect.mjs`, `webview-console.mjs`, `webview-ua.mjs`, `device-clipboard.mjs`.
- **Docs** — `HANDOFF.md`, `PLAN.md`, `docs/vanta-privacy-architecture.md` (threat model
  + §8 live evidence), `docs/live-test-evidence.md`, `docs/zolana-integration.md`,
  `docs/zolana-status-2026-09-25.md`, archived Umbra-era handoff.
- Test wallets (gitignored) in `.vanta-test-wallets.json`.

---

## 2. WHAT WE VERIFIED (with evidence)

### 2.1 The rails work — sender debited, recipient credited ✅
Controlled A/B with **both keys held**:

| Step | A (private) | B (private) |
|---|---|---|
| initial | 0 | 0 |
| after Shield 0.3 on A | 0.3 (1 note) | 0 |
| after Shadow 0.1 A→B | **0.2** | **0.1** |
| after Shadow 0.1 B→A *(B held exactly one 0.1 note)* | **0.3** `[0.2, 0.1]` | **0** `[]` |

→ The edge case that looked broken in the app (a 0.1 note sent as 0.1) is correct.
**No protocol-level bug.**

### 2.2 Redemption is real, not a display ✅
Ghost-withdrew A's 0.3 private → A public:
`BEFORE A public 0.189995 | AFTER 0.48999`, `VAULT Δ −0.300000000`.
→ A private balance is a **redeemable bearer claim**, not a rendered number.

### 2.3 What a Shadow tx exposes ✅
```
CmPCvP42… (sender identity X)   Δ −0.000005000   ← FEE PAYER, PUBLIC
33KVhbT4… (pool)                Δ −0.001402080   ← rent for 2 note accounts
469NRJVj… / DPsTJ7Ff…           Δ +0.000701040   ← new encrypted notes
```
- **Amount hidden** — nowhere on chain; note accounts are fixed rent-exempt size.
- **Recipient hidden** — not in the account list, no loaded addresses, relayer absent.
- **Sender VISIBLE** — X is account[0] and is **reused across all sends** (§3.1).

### 2.4 The relayer scope ✅
| Leg | Fee payer | Relayer in tx? |
|---|---|---|
| Registration | relayer `FhV7…` (−0.001340960 = rent + fee) | ✅ |
| Shield | relayer `FhV7…` (−0.000010000 fee **only**) | ✅ |
| Shadow | sender identity `X` | ❌ |
| Ghost | sender identity `X` | ❌ |

→ The relayer **never funds a payment amount** — only fees, registration rent, and a
plain `relayer → X` gas float via `/fund`. Deposits are paid by the depositor's wallet.

### 2.5 Recipient resolution ✅
`TransferDestination = Address | ShieldedAddress`. A plain owner `Address` resolves
through the registry; if unregistered it throws `WALLET_RECIPIENT_NOT_REGISTERED`
(→ app falls back to Ghost). Both `9j7fG9xe…` and `6vckYW2K…` confirmed registered.

### 2.6 `localStorage` keys (verified by reading Chrome LevelDB)
`vanta-wallet` (public) · `vanta-ephemeral` (identity X — **plaintext**) ·
`vanta-zwallet` (encrypted note snapshot) · `vanta-ephemeral-migrated` ·
`vanta-zwallet-legacy`.

### 2.7 Three live sends — all succeeded, all sender-visible
| Time (Z) | Sig | err | Shape |
|---|---|---|---|
| 01:38:27 | `3gs3si9q…` | `null` | 2-note |
| 01:52:02 | `5cTevV1C…` | `null` | 2-note |
| 01:57:22 | `ktWS55BU…` | `null` | 2-note |

→ Every send landed; the recipient's **public** wallet was untouched — the credit went
to their *private* balance, which is why the public explorer "shows nothing".

### 2.8 MWA signing verified end-to-end (2026-09-26) ✅
Device wallet `6NrEzXoaEzpxUuHERCtW46xKa3j41B2AAMG4R8a1zhDt`; three Shields, all `err: null`
(`21sFAdV2…`, `5HgkVeT8…`, `3Z2zK765…`); app reported private balance **0.300 SOL**.

**Root cause of the long-standing "MWA signing hangs":** `serializeCompiledTx` emitted the
legacy wire layout `[sigCount][sigs][message]`. Zolana compiles to **v1** (version byte
`0x81`, signatures trailing the message), so the legacy prefix made the wallet read `0x81`
as a compact-u16 length → `ArrayIndexOutOfBoundsException: length=361; index=8258`. Fixed
by sending `[message][sigs]`; validated offline by `scripts/mwa-wire-check.mjs`.

➕ **All three flows verified on a physical phone** (Xiaomi, store-installed wallet, USB +
`adb reverse`): Shield ×2, Ghost (to self), Shadow — all on-chain from the device wallet,
with the Shadow's recipient provably absent from both transactions.

### 2.9 Android APK ✅ (debug) / 🟡 (release)
webshell project builds; `android/app/build/outputs/apk/debug/app-debug.apk` produced, and
`bundle-android.mjs` stages `dist/` into `android/app/src/main/assets/www/`. The release
APK currently exists only as `app-release-unsigned.apk` — it must be signed with
`deploy/vanta-release.jks` before submission.

### 2.10 Postgres + `.vanta` registry ✅
`relayer/test-db.mjs` exercises the schema + Ed25519 claim verification end-to-end
(29 assertions; session log reports 32/32 green). `verified_on_chain` records whether a
client-reported Shadow/Ghost tx was later confirmed against the chain.

---

## 3. CRITICAL FINDINGS

### 3.1 🔴 The spend identity is publicly visible and reused
Every Shadow/Ghost send has **X as account[0] (fee payer)**. Anyone who knows your Vanta
address can chart your entire send history (count + timing).

**Root cause:** SDK invariant —
> `/** The fee payer is also the shielded owner, so its signature authorizes the spend. */ readonly feePayer: Address;`

The relayer **cannot** pay for spends. Structural, not a config bug.

### 3.2 🔴 Custody model — a program-controlled vault
```
pool VAULT   2iAazE9t…   10.055517496 SOL   owner: system program, 0 bytes (PDA)
pool STATE   33KVhbT4…   ~47.56 SOL         owner: shielded-pool program, 40 KB
program      sppU489…    executable, on the UPGRADEABLE loader
UPGRADE AUTHORITY        2kgbLowvCQuMWxDKbHUZAURycziuRrvmtTuDEYMGMRsj  ⚠️ SET
```
- Deposits leave the user's wallet into a **shared vault**; the private balance is an
  encrypted bearer claim (viewing **and** nullifier keys from one seed).
- The live **upgrade authority** is the real custodian — one upgrade from draining the vault.
- Deny-liveness risk: no Helius indexer/prover → can't see *or* spend your notes.

### 3.3 🟠 Git history still contains the old secrets — **in-tree is clean**
`relayer-keypair.json` is staged for deletion and gitignored; the Helius key is now
`import.meta.env.VITE_HELIUS_API_KEY`. **But `028544f` still carries them in history** —
the repo cannot go public until history is rewritten/rotated. Rotate both keys regardless.

### 3.4 ✅ RESOLVED — relayer auth
`/relay` `/fund` `/tx/*` `/names/claim` now require `x-vanta-token`; `/fund` has a
per-request cap, per-window count cap and per-window lamport cap; `/relay` refuses txs
that touch no allowlisted program; CORS is origin-listed. Remaining: actually deploy it.

### 3.5 ✅ RESOLVED — app config
`src/lib/config.js` reads `VITE_RELAYER_URL` / `VITE_RELAYER_TOKEN`; nothing hardcoded in
`App.jsx`. On a device `localhost` still means the phone, so `adb reverse` (dev) or the
public HTTPS URL (release) is required.

### 3.6 ✅ RESOLVED — untracked key material
`.gitignore` now covers `.test2-state.json`, `.vanta-test-wallets.json(.tmp)`,
`.e2e-identities.json`, `.agent-identity.json`, `*.jks`, `deploy/.keystore-password`,
`.env*`, `relayer/relayer-keypair.json`, `*.apk`, `deploy/apk-backup/`, `android/**/build`.

### 3.7 🟠 `docs/zolana-integration.md` was stale and overclaiming
It said `0.2.0-alpha` and *"zero on-chain sender trace"* — both wrong. **Rewritten this
session**; it now matches §3.1 and the 0.3.0 API.

---

## 4. BUGS & DEFECTS

### 4.1 ✅ RESOLVED — stale private balance after a send
`App.jsx` now fingerprints the note set before submitting and polls `syncWallet` until it
moves (`~531–588`), then persists and refreshes. "Force resync from chain" in Settings
remains as a manual recovery tool.

### 4.2 🟡 `ensureXFloat` threshold is tight
X needs ≥ 0.002 SOL to skip a float top-up; spends cost 5,000 lamports each. Fine for
demos; review if many sends per session.

### 4.3 🟡 `autoShield` toggle is UI-only
Explicitly labelled "Preview — not wired yet" in `SettingsDrawer`.

### 4.4 ✅ RESOLVED — Shield amount is no longer hardcoded
`shieldNow(amt)` now takes its amount from the new **`src/components/ShieldDrawer.jsx`**:
sheet with presets (0.05 / 0.1 / 0.5 SOL · 5 / 10 / 25 dUSDC), a **fee-aware Max**, a keypad,
and inline "not enough" copy. The action-row button reads "Choose amount" and opens it.

`SHIELD_FEE_RESERVE` and `maxShieldableSol()` now live in `src/lib/tokens.js` and are
imported by **both** the drawer and `shieldNow`'s guard, so "all of it" cannot mean two
different numbers — the same anti-drift rule as `SOL_MINT`.

Earlier fixes that were already in place: the fee-inclusive guard and
`shieldErrorMessage` (translates fakewallet's meaningless `-2 "payloads invalid for
signing"` into "your balance does not cover the amount plus the network fee").

### 4.5 🟡 MWA v1 support is a soft dependency
v1 shipped with Agave 4.2 (Sept 2026) and support "is per-wallet and may vary". Stock
`fakewallet` release APKs are the legacy flavor and cannot sign v1 at all. `mwa.js` now
translates the resulting wallet error into an actionable message (partial). Unconfirmed for
Phantom / Solflare / Backpack.

### 4.6 🟡 Duplicate-spend question (narrowed, unclosed)
On the emulator two Shields landed 66s apart while the harness clicked once — most likely a
leftover pending sign session. Mitigations: Shield disables while `loading`, sign calls time
out after 90s. The phone timeline reconciles exactly. Verify the combination closes it.

### 4.7 ✅ RESOLVED (the entry was wrong) — the release APK is self-contained
This row previously said the APK "loads the app over HTTP" and would show blank without a
public URL. **That is false.** `scripts/bundle-android.mjs` stages `dist/` into
`android/app/src/main/assets/www/`, and `MainActivity` serves it through `WebViewAssetLoader`
at `https://appassets.androidplatform.net/assets/www/index.html` (the
`WEB_SHELL_URL` default in `android/gradle.properties`). The APK boots with **zero
network**. The remote-URL mode is the uncommented *dev live-reload* alternative.

Verified 2026-09-26: the signed release APK (4.1 MB) contains `assets/www/index.html`,
`assets/www/assets/*.js`, and the wasm is inlined (see §18.1).

**What actually still needs a public URL is the relayer, not the app** — `VITE_RELAYER_URL`
is baked into the JS bundle at build time, so an APK built with `http://localhost:3001`
can serve the UI but cannot Shield, resolve `.vanta` names, or pull a gas float.

---

## 5. BLOCKERS — HACKATHON

- [x] **B1. Release-signed APK.** ✅ Signed + `apksigner verify` passes
      (`CN=Vanta, OU=Privacy, O=Vanta, L=Lagos, C=NG`, APK Signature Scheme v2). See §18.1.
      *Remaining:* rebuild once with the public relayer URL baked in.
- [ ] **B2. Public relayer deploy.** **Northflank free Sandbox**, not Fly (§18.3). Fly has
      had no free tier since 2024-10-07 and bills from the first machine (~$2–3/mo).
      `relayer/fly.toml` is therefore the wrong target and should become a Northflank
      service definition; the `Dockerfile` carries over unchanged.
- [ ] **B3. Repo hygiene.** In-tree is clean; **git history is not**. Rotate relayer keypair
      + Helius key, then rewrite/scrub before the repo goes public. Judges include two
      security researchers (Voynich, A2nkF/EthelSec).
- [ ] **B4. ✅ Relayer authenticated** (token + caps + allowlist).
- [ ] **B5. Devnet-only story.** No PMF/retention narrative yet — needs a real reason a
      Seeker user returns.
- [ ] **B6. Submission artifacts.** README rewrite (root README is still the Sep-20 stub),
      LICENSE, demo video, pitch deck.

---

## 6. FOLLOW-UPS / ACTION ITEMS

### P0 — correctness on the demo path
- [x] **Shield amount picker** (§4.4) — done: `ShieldDrawer.jsx` + shared fee reserve.
- [ ] **Claim-name UI** in a new **Profile** tab — **shipped (§13.1)**. Remaining polish:
      show it in the Receive sheet too, so senders can discover a handle without asking.
- [ ] Verify the stale-session duplicate-spend question is closed (§4.6).
- [ ] Finish v1 capability detection → a specific, actionable error (§4.5).

### P1 — submission-critical
- [x] **Honest receipt UI — per-leg breakdown.** `src/lib/honesty.js` is the single
      source of truth (one table, two surfaces), rendered by `HonestyRows.jsx` from both
      `ReceiptDrawer` and `PrivacySheet`, so a receipt can never claim what the
      "what leaks" sheet doesn't back up. See §13.0.
- [x] **Receipt PDF export** — `src/lib/receiptPdf.js`. Verification is a script, not a
      claim: `node scripts/pdf-receipt-check.mjs`. See §13.0.
- [x] **Surface `verified_on_chain` in the receipt.** New `src/lib/txHistory.js`;
      proof levels render in `ReceiptDrawer` and as an "On chain" row in the PDF.
      See §13.0b. The read path is verified live against the relayer; the write path
      fires on the next in-app send.
- [x] **3-page first-run intro** — shipped §18.2. `src/components/Onboarding.jsx` +
      `Onboarding.css`, mounted from `App.jsx` behind `localStorage['vanta-onboarded']`.
      Verified by server-rendering all three steps (`scripts/ob-ssr-check.jsx`, 37 checks).
- [ ] Sign the release APK; bake the public URL.
- [ ] Deploy the relayer (B2).
- [ ] Root `README.md` rewrite + LICENSE.
- [ ] Demo video: a real Vanta→Vanta send where the explorer shows **only a 5,000-lamport
      fee**, then a Ghost withdraw where the **amount is public**. That contrast is the pitch.

### P2 — differentiators (only if P0/P1 are done)
- [ ] Motion/feel pass (sheet blur-in, rolling numbers, skeletons, Android back).
- [ ] Sumsub sandbox: server-side token endpoint + verify-to-unlock. **Currently
      schema-only** (`sumsub_verified`, reserved `sumsub` handle) — no endpoint, no UI.
- [ ] **SKR / Seeker Genesis Token tier** for the separate $10,000 SKR prize. Nothing built.
- [ ] Rotate the spend identity per send via a **pre-funded identity pool** (§3.1).
      *Requires moving note ownership; a fresh X cannot spend X's notes.*
- [ ] `buildMergeTransaction` / `buildSplitTransaction` UTXO hygiene.
- [ ] `.vanta` handle UX polish (release/transfer, SKR pricing).

### P3 — cut / do not do
- ❌ Jupiter swap (cuttable per spec)
- ❌ Mainnet / real-money custody build
- ❌ Any "anonymous / untraceable / sender hidden" claim
- ❌ Shipping an unaudited custody app for real user funds
- ❌ Volume bots / fabricated pool activity

---

## 7. SUGGESTIONS / STRATEGY

### 7.1 Reframe the product (unchanged, still right)
> **Vanta — a privacy wallet that tells you exactly what leaks.**
> Every send renders a per-leg receipt (shielded amount ✓, hidden recipient ✓, visible
> sender fee-payer ⚠️, public deposit edge ⚠️), each backed by a real tx hash.

### 7.2 Judge-shape risk
**Mert Mumtaz (CEO, Helius) is a judge and you run on Helius's rails.** His public framing
is *"anonymous except for the to and from"* — which **matches your findings**. Being precise
aligns you with the vendor; overclaiming is the one way to lose the room. Two other judges
are security researchers and will read the repo.

### 7.3 Helius relationship (offer as feedback, not a pitch)
- npm `0.2.0-alpha` is broken vs devnet — you must clone + build `v0.3.0-alpha` from the tag.
- `feePayer == shielded owner` structurally rules out relayer-paid spends.
- Registry accepts owner *or* shielded address; silent fall-through to Ghost if unregistered.
- `maxSupportedTransactionVersion` **must be 1** or every Zolana tx reads as unverified.
- Indexer-cursor behaviour after the 2026-09-24 redeploy; `syncWallet` after every tx is load-bearing.

### 7.4 Differentiation reality check
Rings is **private beta**; the install path is hostile. Very few — likely zero — other
CLOCK IN teams will have a working Rings integration. Caveat: differentiation from
*difficulty*, not a moat, and it must be verifiable. ⚠️ Confirm a public client is
permitted under the private-beta terms.

### 7.5 Honest claims language
✅ *"In a Shadow send, the amount and the recipient are not derivable from on-chain data."*
🚫 *"anonymous" · "untraceable" · "sender hidden" · "end-to-end encrypted" · "trustless"*
⚠️ Disclose residuals: public Shield edge, reused spend identity, timing/amount correlation
at low depth, shared-vault custody + live upgrade authority, device wallet is the public
depositor on the MWA path.

---

## 8. HACKATHON FACTS (CLOCK IN — Solana Mobile × RadiantsDAO)

- **Window:** submissions open Sep 8, **close Oct 8 2026**, winners early Nov.
- **Prizes:** $125k USDC (10 teams; 1st $30k) + **$10k SKR integration prize** (separate).
- **Submit:** functional **Android APK** + GitHub repo + demo video + pitch deck.
- **Winners must publish to the Solana dApp Store** (prepare a devnet/demo build).
- **Judging:** stickiness & PMF · UX · innovation · presentation/demo.
- **Judges:** Anatoly Yakovenko · **Mert Mumtaz (Helius CEO)** · Chase Barker · Akshay Rajan
  · Beeman · Voynich & A2nkF (**EthelSec**).
- **Time remaining from 2026-09-26: ~12 days.** Keep ~2 days buffer.

**Suggested split:** D1 Shield amount UX + claim-name UI · D2–3 honesty receipt UI +
first-run intro · D3–5 sign APK + deploy relayer + public URL · D5–7 demo video · D7–9
README/deck/license · D9–10 dApp Store prep · D10–12 buffer.

---

## 9. ADDRESSABLES (devnet)

### Contracts & pool
| Thing | Address |
|---|---|
| Shielded-pool program | `sppU489D7A4U1exNo1oeMGZtLEofq3a6o2fR7UeoWB6` |
| User registry program | `regyS5rkAcw2YzDJCmTwCTHs2s246FXxbmuRZ42u2PD` |
| Pool **vault** (holds deposits) | `2iAazE9tAWcUJhNhfscRzX17Gb32Km9jJYZlGy1AnkVP` |
| Pool state / rent account | `33KVhbT4QtdQDrrrGwwThqD47Dh4Q6tA443t9jMNcWFN` |
| Programdata account | `ACEAhi1f3WaD49cTN5yUAULmwytoQjp6MTVfaWaQAqKw` |
| ⚠️ Upgrade authority | `2kgbLowvCQuMWxDKbHUZAURycziuRrvmtTuDEYMGMRsj` |

### Keys in play
| Role | Address |
|---|---|
| Relayer | `FhV7cyfVAC8gyQqSRYiw5oKdC95GVw83ukvxhhu7uRk7` |
| Device wallet (MWA) | `6NrEzXoaEzpxUuHERCtW46xKa3j41B2AAMG4R8a1zhDt` |
| User's sender identity (X) | `9j7fG9xeaaU6g7wAvYenGs1gu942vwwPNLykr1HJqeWb` |
| User's recipient identity | `6vckYW2KRbu9YNRUQkkRCjAKPksgkLMo94ibrrYvDDPF` |
| Test funder | `4TVn2daE5vc5neAbxhwmaWAUnezs3j7YRUQ3dYd3CCj5` |
| Test Vanta A | `CmPCvP42XqsBU6vMuDUgwzqVxcj26Gt73iiYKzWrhHQT` |
| Test Vanta B | `8zawwLjdL2VJb169jzWyfatsrL3nqbKH5qC1D3aQtTBB` |

### Key signatures
| Purpose | Sig |
|---|---|
| MWA Shield ×3 | `21sFAdV2…` · `5HgkVeT8…` · `3Z2zK765…` |
| User send 0.1 (01:52:02Z) | `5cTevV1CB4eBpWnX59z8Zvo918ZMoAq6Q16d4fgN6oGZDnSeTCHGdpNJ6hfkx2jsvfd8VT5FmpNGcy8um41gqWrc` |
| Test Shield 0.3 | `3f2UWBXyb4suw7Bx4sHCJQuZeyVFyzMqAMMcsq9Lf8NjvP51DBWFs84wiBn5MmRi6ZyX9A7cpAnU87bomw29iwsN` |
| Test Shadow 0.1 A→B | `26JSzUqjsXsedNJRbULKRTGvSgwp6hmp5G4MJhS2DY1aTAqPU8wJRJ4mT2BdYPXw7HUWmh3u2npquW5EiJM72w8B` |
| Test Ghost withdraw 0.3 | `Q5o9soTu8Yf7U7iwgoj9WeLKgkDS6CSdoZHyZPjQgNJon1nQ27GMa3RUVzThBEWxBsLxjT4LUPMH8CSrQcwm4QA` |

Full reconciled phone-session timeline lives in `docs/live-test-evidence.md`.

---

## 10. OPEN QUESTIONS / NOT YET VERIFIED

- Who holds the **upgrade authority** `2kgbLowv…`? Is renouncing it on Helius's roadmap?
- Are consumer clients permitted under the **Rings private-beta** terms?
- Is a **local prover** possible, or is the Helius prover service hard-required to spend?
- Are **note-account addresses** derivable from the recipient's shielded address?
- Is a stale pending MWA session approvable into a duplicate spend? (§4.6)
- Does a public relayer deploy rate-limit correctly under real abuse? (Not exercised.)

---

## 11. DOCS CHANGED THIS SESSION

- `PLAN.md` — this file; **fully reconciled** with the working tree (relayer hardening,
  Neon, `.vanta` registry, Android, landing, config, sync fix all now recorded as done).
- `HANDOFF.md` — reconciled to the same state; phase table and blocker list rewritten.
- `docs/zolana-integration.md` — stale header / 0.2.0-alpha API / "zero on-chain sender
  trace" overclaim removed; TODO section replaced with current status.
- `docs/vanta-privacy-architecture.md` — §8 live evidence (earlier session).
- `.gitignore` — exhaustive secret/build-output coverage (§3.6).
- `src/index.css` + `android/.../colors.xml`, `themes.xml`, `ui/theme/Color.kt`,
  `Theme.kt` — the amethyst theme pass (§13.1).

---

## 12. QUICK REFERENCE — reproduce any claim

```bash
cd ~/vanta-mobile

# rebuild what the server serves (MUST do after any src/ change)
npx vite build

# lint
npx oxlint src/

# is a tx indexed by the Photon indexer?
node scripts/check-indexed.mjs <SIG>

# full headless E2E (relayer → fund → register → shield → sync → ghost → shadow)
node scripts/e2e-zolana.mjs

# relayer health + Postgres
curl -s http://localhost:3001/status

# Postgres + .vanta registry harness
node relayer/test-db.mjs

# receipt PDF: render 4 receipts -> PDF -> PNG, then pixel-probe them
# (asserts dark canvas, type, accent, waves, no right-margin overflow, footer gap)
node scripts/pdf-receipt-check.mjs
python3 scripts/pdf-receipt-analyze.py /tmp/vanta-receipt-check/*.png

# name resolution checks
node scripts/test-name-resolution.mjs

# Android: install debug APK + v1 wallet on a USB phone, wire adb reverse
./scripts/device-test.sh --wallet
```

---

## 13. SESSION CHRONOLOGY (most recent work first)

0. **Receipt PDF export finished** (2026-09-26). `src/lib/receiptPdf.js` was picked up
   **mid-migration and would have crashed on first use** — `AMBER` was still referenced
   after its constant had been deleted, a `ReferenceError` that `vite build` and `oxlint`
   both missed because neither evaluates the function. Completed:
   - **Two typefaces, both deliberate.** Space Grotesk (variable TTF, subset ~4.5KB) is
     the **display** face for masthead / amount / title, embedded through
     `@pdf-lib/fontkit`; **Helvetica** stays the **text** face (it gives a real bold at
     9px, which a single-weight variable instance cannot) and is the offline fallback.
     ⚠️ **WOFF does not parse** ("beyond buffer length") — the TTF is the only working
     source. Any CDN/CORS/parse failure logs a warning and degrades to Helvetica rather
     than throwing, so an export never fails because a CDN blinked.
   - **TopoWaves drawn as vectors** — `drawSvgPath` over the same 13 cubic beziers as
     `App.jsx`, so the receipt wears the app's wallpaper instead of a raster. pdf-lib
     negates the SVG Y axis (`scale(s, -s)`), which is why the field anchors at the top
     of the page and sweeps downward.
   - **Measurement-based amount sizing** replaced `length > 16 ? 26 : 38`, a character
     rule that hard-coded one font's metrics and would mis-size against Grotesk. The
     transaction title now wraps instead of running off the edge.
   - **Explorer link no longer overflows.** It was drawn inline after its label, so the
     ~140-char URL ran off the right margin on **Ghost and Shield** — the only two modes
     where `onChain.linkable` is true. Now: label on its own line, URL wrapped. This is
     the same class of bug the `chunk()` hard-break already fixed for the Reference.
   - **Verification is automated, not asserted.** `scripts/pdf-receipt-check.mjs`
     renders Shadow / Ghost / Shield **plus an offline-fallback** receipt, rasterises
     them with `sips`; `scripts/pdf-receipt-analyze.py` pixel-probes the PNGs.
     **Result: 20/20 probes pass** (dark canvas, type present, accent present,
     waves present and in the upper band), **0 px of text at the right margin**, and a
     54–81pt gap above the footer with all three residuals intact. Reproduce with
     `node scripts/pdf-receipt-check.mjs`.

0b. **`verified_on_chain` wired end-to-end** (2026-09-26, same thread). The backend had
   the flag, the endpoint and the column — **nothing in `src/` called either endpoint**
   (`grep` for `/tx` in `src/` matched only the explorer URL in `honesty.js`).
   - **New `src/lib/txHistory.js`** — `reportTx` (POST `/tx/report`, 5s ceiling),
     `refreshVerified` (GET `/tx/:address`), and `recordSend` as the single entry point.
     Every path returns a proof key instead of throwing: **the transfer is already
     confirmed by the time this runs, so history must never fail a send.**
   - **Four proof levels**, in `lib/honesty.js` (not txHistory) because `receiptPdf.js`
     needs the labels and txHistory pulls in `import.meta.env`, which breaks the Node
     PDF harness: `verified` (ok) · `observed` (ok) · `reported` (warn) · `unchecked`
     (mute) · plus `pending`.
   - **Shield is deliberately NOT re-posted.** `recordTransaction` upserts
     `flow_source = excluded.flow_source`, so POSTing a Shield signature would rewrite
     it from `'relayer'` back to `'client'` and erase the fact that the relayer observed
     it. Shields are re-read only. Shadow/Ghost/Public are reported, because the relayer
     is absent from those transactions entirely (X pays its own fee) — **before this,
     those signatures never reached the history at all.**
   - **Surfaces:** `ReceiptDrawer` gained an "On-chain check" block (dot + label + the
     `detail` sentence); the PDF gained a right-aligned **"On chain"** meta row in the
     tone of its proof, deliberately *separate from Status* because a tx can be
     `Confirmed` locally while never having been checked.
   - **Live DB read (Neon):** 6 rows, **all `flow_source='relayer'`, all
     `verified_on_chain=false`, all `status=confirmed`** — 5 shield + 1 fund. This
     confirms the prediction above: relayer-observed rows never get the flag set, so
     they read `observed`, not `verified`. Actors were earlier-session wallets
     (`GtSh95As…`, `EWMBZEpP…`, `5i5Kpbx2…`), which is why probing the four current
     addresses returned `count=0`.
   - ⚠️ **`RELAYER_TOKEN` is unset locally** → `requireToken` short-circuits
     (`server.js:232 if (!TOKEN) return next()`) and `/tx/:address` answers **200 with
     no token**. This is the documented *dev mode*, not a broken gate — but §3.4's
     "relayer auth resolved" is code-true, not configuration-true. `.env.local` has
     `VITE_HELIUS_API_KEY` / `VITE_RELAYER_URL` / `DATABASE_URL` and **no token on
     either side**. Both `RELAYER_TOKEN` (server) and `VITE_RELAYER_TOKEN` (client)
     must be set before B2, or the server exits (`server.js:671`).
1. **Claim-name UI shipped.** New `src/lib/names.js` (availability, owned, claim +
   Ed25519 proof) and `src/components/ProfileDrawer.jsx`. Header "V" now opens Profile;
   Settings ↔ Profile linked both ways (`onOpenProfile`). Proof is signed client-side with
   the identity seed from `vanta-ephemeral` — no wallet prompt, nothing published on-chain.
   Verified against the live relayer: `vanta.vanta` → reserved, `maxx.vanta` → available,
   `ab` → valid, `owned/9j7fG9xe…` → `[]`.
2. **Theme dial-back (2nd pass).** Feedback: "starting to feel too purple." Cause was
   violet tinting **every surface** plus violet spotlights/glows — purple as the room
   instead of as the accent. Surfaces reverted to neutral (`#0a0a0c` / `#060608` /
   `#141417` / `#0c0c0f` / `#222226` / `#17171a`), spotlights back to neutral white at lower
   alpha, glows reduced to 0.16/0.2. **Accent stays amethyst.**
3. **Action row fixed.** The text column had ~55px (40px well + gap-3.5 + pr-2 in a ~129px
   button) while "Choose amount" needed ~78px in 10px mono, so it wrapped and read as the
   icon shoving the label aside. Now: 32px well, `gap-2.5`, `px-3`, `pr-2` dropped,
   non-mono sub-labels with `truncate`, and a **shield-with-keyhole** glyph replacing the
   stock shield outline.
4. **Theme retune (1st pass)** — green accent → amethyst. Web: `index.css` tokens (`#8b79f0` / hi
   `#7a66e6` / new deep `#4c3a9e`), surfaces nudged violet, rose danger, violet spotlights
   + glows, `.asset-card { transition: all }` → named properties, SendDrawer emerald chip →
   accent, asset wells neutral. Android: splash + launcher background **`#3DDC84` Android
   green → `#060509` ink / `#2A2150` deep violet**; `Theme.WebShell` parent Light → dark
   (killed the white flash behind the WebView); **`dynamicColor` removed** (it was pulling
   the scheme from the user's wallpaper). Verified: oxlint 0 errors, vite build clean,
   `:app:compileDebugKotlin` BUILD SUCCESSFUL.

2. **Shield amount picker** — `ShieldDrawer.jsx`, fee-aware Max, shared
   `SHIELD_FEE_RESERVE`; `shieldNow(amt)` wired; build + lint clean (§4.4).
2. Relayer hardening landed: token auth, `/fund` caps, program allowlist, CORS.
2. Neon Postgres wired: `transactions` + `vanta_names` + `reserved_names`, `/tx/*`,
   `verified_on_chain`; `test-db.mjs` harness green.
3. `.vanta` handle registry + client-side resolution in `SendDrawer`.
4. Post-send stale-balance fix (poll until the note set changes).
5. Android: webshell project, `bundle-android.mjs`, debug APK built, release keystore
   created, release APK still unsigned.
6. Landing page scaffolded and built (`landing/`).
7. Env-drive `App.jsx` config; keypair untracked; `.gitignore` hardened.
8. MWA v1 signing bug fixed and verified on a physical phone (§2.8).
9. Rails verified: A/B Shadow, Ghost redemption, Shadow forensic diff, relayer scope (§2).
10. SDK↔program drift diagnosed and resolved by building `v0.3.0-alpha` from the tag.
11. Umbra → Zolana pivot; PLAN.md / HANDOFF.md established.

---

## 14. CONCEPTS EXPLAINED (Q&A)

**Q: Why does the block explorer "show nothing" for my private balance?**
Because a private balance is **not an account**. It is an encrypted note (a bearer claim)
inside a *shared* pool vault. There is no per-user account for an explorer to render.

**Q: Is Vanta anonymous?**
No — **confidential**, deliberately. A Shadow send hides **amount** and **recipient**. It
does **not** hide the **sender**: identity X is the fee payer on every spend and is reused
(§3.1). Target: *confidential*, never *anonymous*.

**Q: What does "rotate the spend identity" mean?**
Use a fresh X per send. A fresh X cannot spend old X's notes, so it needs (a) a pre-funded
identity pool or (b) a private hop. Rotation buys **unlinkability between spends**; it does
**not** buy anonymity, because the public deposit edge remains. → P2.

**Q: Why can't the relayer pay the fees for spends?**
Because the SDK requires `feePayer == shielded owner` — the signature that pays also
authorizes the spend. Structurally impossible, not a config flag (§3.1).

---

## 15. SDK / RAILS API REFERENCE (0.3.0-alpha)

**Identity**
```js
ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(seed))
await zk.initializePoseidon()   // MUST run before any shieldedAddress() call
```
- `shieldedAddress()` returns a Poseidon-derived object, **not** the owner signer address.
- `zk.SOL_MINT` is the **system program id** (`1111…1111`), *not* wrapped SOL. `App.jsx` is
  corrected to this; `bootstrap.js`/App normalises against `zk.SOL_MINT` so it can't drift.

**Transactions**
```js
buildRegistrationTransaction({ client, owner, address, payer })   // 0.3.0: `payer` (was `feePayer`)
buildTransferTransaction({ client, wallet, keys, feePayer, recipient, amount, asset?, approve? })
buildWithdrawalTransaction({ client, wallet, keys, feePayer, recipient, amount })
```
- Registration signers = **relayer + owner**; `payer` sponsors rent.
- `recipient` accepts a plain owner `Address` (resolved through the registry) **or** a `ShieldedAddress`.
- **Approval hook** (how we capture intent for receipts):
  ```js
  approve: (req) => intentMod.approveIntent(req.intent)   // from dist/transaction/wallet/intent.js
  ```
  ⚠️ `zk.approveIntent` exists but is **NOT** exported — import the intent module directly.
- **`syncWallet` after every confirmed tx** is load-bearing before the next spend.
- `Wallet` exposes `.utxos()`, `.balances()`, `.identity`.

**Relayer wire format**
- POST `{ messageBytes, signatures: { <addr>: <sig|null> } }`.
- Client signs only its own slots (`@noble/curves/ed25519.js`); relayer fills its slot.
- v1 layout: `[message][sig0][sig1]…`.
- `PrivateTransactionParams` doc: *"The fee payer is also the shielded owner, so its
  signature authorizes the spend."*

---

## 16. HELIUS × RINGS CONTEXT (external research, 2026-09-25)

- Helius **acquired Light Protocol** (Jun 2026) to build **Rings**; private beta ~Aug 2026.
  Vanta is a **consumer client for Rings**.
- Helius docs: *"One **Private Wallet** can hold balances in multiple Rings at the same
  time."* → a "Vanta private balance" is a note in a shared pool (no per-user account).
- **Mert's public framing: "everything is anonymous except for the to and from."** That
  **matches** our findings and is the safest line to echo (§7.2).
- Private beta + hostile install path ⇒ likely zero other CLOCK IN teams have a working
  Rings integration (§7.4). ⚠️ Confirm public clients are permitted.

---

## 17. NEXT ACTION (pick this up here)

1. ✅ **Shield amount picker** (§4.4) — shipped. `ShieldDrawer.jsx`, presets, fee-aware Max.
2. ✅ **Claim-name UI** (§13.1) — shipped: `ProfileDrawer.jsx` + `src/lib/names.js`.
   Wire contract for future reference: `POST /names/claim { name, ownerAddress, signature }`,
   signature = base58 Ed25519 over `vanta-name-claim:<name>`; `/names/available/:name` and
   `/names/owned/:address` are public; **one handle per owner**.
3. ✅ **Honest receipt UI** — per-leg public/hidden/linkable + `verified_on_chain`.
4. ✅ **Audit remediation** — every finding in `docs/AUDIT-2026-09-27.md` (C1→L5) is
   fixed or disclosed. Full table + device evidence in **§19**.
5. **3-page first-run intro** (P1) — still open.
6. Then packaging: ~~sign APK~~ ✅ (§18.1), deploy relayer → **Northflank** (B2),
   README/deck/video (B3–B6).
7. **Rebuild the APK after the relayer URL exists** — one `npm run build:android` +
   `gradlew assembleRelease` (the command is in §18.1).

⚠️ **Before the repo or the APK goes public:** the `VITE_RELAYER_TOKEN` build arg no
longer unlocks history (C1 is closed — history reads are identity-signed), but the
Northflank deploy in `.env.local` still holds the **live** token. Rotate it, and rotate
the old keypair reachable in git history (`028544f`).

> Rebuild before any demo: `npx vite build` — the server serves `dist/`, not `src/`.

---

## 18. SESSION LOG — 2026-09-26 (evening): onboarding + packaging + hosting

### 18.1 ✅ Signed release APK — and why it needed no public host

**Toolchain gotcha first:** `gradlew` fails with *"Unable to locate a Java Runtime"* because
no JDK is on `PATH`. Two are installed; use either:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"   # or /opt/homebrew/opt/openjdk@17/...
export PATH="$JAVA_HOME/bin:$PATH"
```

Signing props are read from Gradle properties (passwords also from env), so **no secrets go
into `android/gradle.properties`** — they are passed per-invocation:

```bash
cd android && KS_PW=$(cat ../deploy/.keystore-password) && ./gradlew assembleRelease \
  -PWEB_SHELL_SIGNING_STORE_FILE=/Users/mac/vanta-mobile/deploy/vanta-release.jks \
  -PWEB_SHELL_SIGNING_STORE_PASSWORD="$KS_PW" \
  -PWEB_SHELL_SIGNING_KEY_ALIAS=vanta \
  -PWEB_SHELL_SIGNING_KEY_PASSWORD="$KS_PW"
```

Result: `android/app/build/outputs/apk/release/app-release.apk`, **4.1 MB**,
`apksigner verify` → *Verified using v2 scheme: true*,
`CN=Vanta, OU=Privacy, O=Vanta, L=Lagos, ST=Lagos, C=NG`.

**Two suspected blockers that were NOT real** — both checked rather than assumed:

1. **"The zolana wasm is missing from the bundle."** `find` for `*.wasm` under `dist/` and
the SDK returns nothing, and the built chunk contains
`new URL('hasher_wasm_simd_bg.wasm', import.meta.url)`, which looked like a runtime fetch that
would 404 under `appassets`. **It is dead code.** The SDK resolves `@lightprotocol/hasher.rs`
to its **`browser-fat`** build, which inlines the wasm as base64:
`Ga(e){return Wa(0,null,"AGFzbQEAAAAB…")}` → `atob` → `WebAssembly.instantiate`. The base64
is the 2.65 MB literal inside `dist-*.js`. No `fetch`, no MIME problem, works offline.
2. **"The APK loads the app over HTTP."** Wrong — see §4.7. It bundles `dist/` and boots
from `appassets.androidplatform.net` with zero network.

**Confirmed in the shipped APK:** `assets/www/index.html` + `assets/www/assets/*.js`, the
`verified_on_chain` strings (`Client-reported`, `Not checked`), and the onboarding copy.

**Storage:** APKs are gitignored (`*.apk`) — a 4 MB binary does not belong in the repo push.
`deploy/.keystore-password` and `deploy/vanta-release.jks` are gitignored too. Losing the
keystore means never being able to update the dApp Store listing.

### 18.2 ✅ First-run onboarding — ported, not just recoloured

Source was a standalone mock at `~/Desktop/onboardingflow (2).html` (Tailwind CDN + GSAP CDN,
royal blue `#2b6eff` on `#03070f`, a **FLUX VISA card**, and "secured by your biometrics").
It was **not** a Vanta design and could not be dropped into a bundled React SPA as-is, so it
was rebuilt as `src/components/Onboarding.jsx` + `Onboarding.css` with Tailwind utilities and
plain CSS keyframes (the app has **no GSAP and no framer-motion** — see `package.json`).

**Three things in the source were wrong, and all three are fixed:**

| Source | Why it was wrong | Now |
|---|---|---|
| Royal blue `#2b6eff` | A *different product's* brand | Amethyst `#8b79f0` on canvas `#0a0a0c`, per `index.css` |
| The `FŁUX` VISA card | Vanta has no card, and VISA is a trademark we can't use | Vanta's own primitive: the **private note** with a redacted amount |
| "Secured by your biometrics" | Vanta has **no biometric unlock** — the claim was simply false | "No email, no phone, no server holding your keys" |

**Where the card came from:** the `FŁUX` neobank-card idiom is a stock fintech/Framer
template motif, not something modelled from scratch. Targeted searches for the exact asset
were inconclusive, so this is stated as an observation rather than a citation: it is a generic
Neobank-card composition (contactless-chip rectangle, `•••• 8495`, italic VISA lockup,
`rotateY/rotateX/rotateZ` float), and the Polish `Ł` reads like an AI-plausible brand garnish
rather than a real mark. **The composition was the valuable part and is kept; the branded
object is gone.**

**How each step was made relevant while keeping the design:**

- **Step 1** — kept the crosshair grid, the floating panel and the shimmer. The panel is now
a *private note*: `VANTA` mark, a shield glyph, a **redaction bar** where the amount would be,
and "amount not on chain". Says what Shadow actually does, and nothing more.
- **Step 2** — kept the portrait, the lighting and the animated **scanner line** (the part the
owner specifically liked). Reframed from *biometric KYC* to **no account**: "No sign-up /
You are the account". The face now stands for "there is nothing to hand over", which is both
true of Vanta and a deliberate inversion of the identity-verification trope.
- **Step 3** — kept the exact 3D composition (same rotate values) and the **hand** graphic,
but the two credit cards became two **notes**: an `UNSPENT` dormant note behind, the private
note in front. Copy nudges the real first action: *"Add a little SOL to cover fees, shield
it, then send privately."*

**Gating:** `localStorage['vanta-onboarded']`, read at `App.jsx` state init; `onDone` writes it.
Deliberately localStorage and **not** the encrypted wallet store — it must be readable before
any wallet exists, and it is about the *browser*, not the identity. It renders *instead of*
the wallet while all the wallet effects keep running, so the engine warms up behind the intro.
An early return is safe here: **no hooks are declared after the main `return`** (checked).

**Verification — `scripts/ob-ssr-check.jsx`.** Headless Chrome is unusable on this machine
(it crashes before paint; `--screenshot` and `--dump-dom` both return a crash page, which is
what produced the "white page" red herring in an earlier session). So the component is
**server-rendered** with `react-dom/server` and asserted instead:

```bash
npx vite build --ssr scripts/ob-ssr-check.jsx --outDir .ob-ssr && node .ob-ssr/ob-ssr-check.js
```

37 checks, all passing — each step mounts without throwing, the copy is right, exactly one
step is mounted per render, and the source template's artefacts are **absent**: no `#2b6eff`,
no `#1e60ff`, no `VISA`, no `FLUX`, no `biometric`, no "Save. Earn. Invest. Send", no
"Not a bank". (`.ob-ssr/` is a build artefact — delete it.)

⚠️ This verifies structure and copy, **not pixels**. Nobody has looked at a rendered frame yet.

### 18.3 Hosting — Northflank, verified from the vendor's own pricing page

The plan previously targeted Fly.io. **That was wrong on cost**, and the owner's recollection
of Northflank is correct. Checked 2026-09-26:

| Provider | Free tier | Sleeps? |
|---|---|---|
| **Northflank Sandbox** | ✅ **2 services, 1 database, 2 cron jobs** | **No** — "Always-on-compute – no sleeping :)" (northflank.com/pricing) |
| Fly.io | ❌ none since 2024-10-07 | n/a — trial machines stop after 5 min |
| Render | ✅ web service | **Yes — 15 min**, cold start on next request |

Northflank is the only one of the three that is *free* **and** *always-on*, which is exactly
the requirement for a judging window of **Oct 9 → Nov 11 or longer**. `relayer/fly.toml` is
superseded; `relayer/Dockerfile` ports over as-is.

**Correction to "it's just a relayer."** Mostly true, but the process is not stateless — it
is three things behind one port:

1. **The relayer** — pays fees/rent on Registration + Shield, serves `/fund` gas floats, and
   holds `relayer-keypair.json` (real money).
2. **The `.vanta` name registry** — `/names/*`, backed by Postgres.
3. **Tx history + `verified_on_chain`** — `/tx/:address`, `/tx/report`, backed by Postgres.

So keeping the *container* warm is necessary but **not sufficient**: Neon's **free tier
suspends compute after 5 minutes idle** and cannot be opted out of on free (paid Launch
removes it). Cold start is ~300–800 ms on the first query. Impact is bounded — the fee path
(`/relay`) does not need the DB, so no send is blocked — but the first `.vanta` lookup or
activity load after an idle period will be slow. Options: (a) accept it and say so,
(b) point Northflank's free database at it instead of Neon, or (c) a keep-warm ping.

### 18.4 Rechecked, still open

- 🔴 **Spend identity reuse** (§3.1) — unchanged. The fee payer is publicly visible and reused.
- 🟠 **Git history still holds the old secrets** (§3.3) — in-tree is clean; rotate the Helius
  key (`.env.local` comment says it is still live and baked into every bundle) before the
  repo goes public.
- 🟡 **Sumsub** (§6 P2) — schema-only (`sumsub_verified`, reserved handle); no endpoint, no UI.
  It appears **nowhere** in `src/`, so it is genuinely unstarted.

### 18.5 ✅ The Vanta mark — placed, and the Android icon was still the robot

Source: `~/Desktop/vantalogo.png`, **1254×1254 RGBA**. Two things about it drove every
decision below, and both were measured rather than assumed:

- **Pure monochrome** — the only saturated colour is none. Top opaque buckets are
  `(240,240,240)`, `(255,255,255)`, plus a dark element (`(0,0,0)`, ~2k px). It is a
  white mark with dark negative space, which means it needs **no tint or filter** on
  Vanta's near-black canvas.
- **Mostly padding** — the visible mark is `(464,362)–(882,803)` = only **418×441** of the
  1254px canvas. Copied raw it would render 3× too small at every call site.

Trimmed to the alpha bbox, padded 8% and squared, then saved as **luminance+alpha** at
256px → **16.6 KB** (vs 99 KB as 512px RGBA). LA is lossless for a monochrome mark and
roughly halves the pixels; 256px covers an 80px render at 3× with room to spare.

Shipped at `src/assets/vanta-logo.png` (imported, so Vite hashes it and rewrites the URL
**relatively** — that is what keeps it loadable inside the APK's `appassets` sandbox).

**Placed in three surfaces:**

| Surface | Before | Now |
|---|---|---|
| First-boot (connect-wallet) screen | A bare letter **"V"** in an `w-20 h-20` tile | The real mark, `h-12 w-12`, inside the same tile |
| Onboarding step 1 | no brand mark at all | Mark leads the cascade above the eyebrow; steps 2–3 deliberately skip it |
| **Android launcher + splash** | 🔴 **the stock Android robot** | generated Vanta icon set |

**The launcher icon was the real find.** `drawable/ic_launcher_foreground.xml` was still
the webshell template's Android robot vector, and every `mipmap-*dpi/ic_launcher*.webp`
was the template bitmap — so the app installed showing the robot on a judge's home screen.
Someone had already fixed the *colours* (`launcher_icon_background` = `#2A2150` violet,
`splash_background` = `#060509`) but not the artwork.

`scripts/gen-launcher-icons.py` generates the set from the master:

- `mipmap-*/ic_launcher_foreground.png` — adaptive foreground at **108dp**, mark at 60% of
  the canvas so it sits inside the 72dp safe zone (0.54 was tried first and read small;
the mark is a sparse thin-line design, so it needs more room than a solid glyph).
- `mipmap-*/ic_launcher.webp` / `ic_launcher_round.webp` — legacy violet tile, rounded and
  circular, mark at 62%.

`mipmap-anydpi/ic_launcher{,_round}.xml` now point `foreground` **and** `monochrome` at
`@mipmap/ic_launcher_foreground` — monochrome reuses the same art because Android 13+ tints
the **alpha silhouette** for themed icons, which is exactly why a monochrome mark is the
right asset.

**Splash screen:** `values/themes.xml` also referenced the robot
(`windowSplashScreenAnimatedIcon`). It now points at the same adaptive foreground — reused
**deliberately**, because 60% of 108dp *is* the safe area Android 12+ expects for a splash
icon, so no separate asset was needed.

**Verified in the shipped APK** (not in the source):

```
aapt2 dump badging → application-icon-{160,240,320,480,640}:'res/E4.xml'   (the adaptive icon)
res/-6.webp        → 5990 bytes, byte-identical to our ic_launcher_round.webp
assets/www/assets/vanta-logo-CNa0XRG2.png → 16633 bytes (matches dist/)
grep 'M65.3,45.828' . → NO MATCH  (the robot's path data is gone from the whole APK)
signature          → still verifies, CN=Vanta, OU=Privacy, C=NG
```

⚠️ Release builds **shorten resource paths** (`drawable/ic_launcher_foreground.xml` becomes
`res/E4.xml`), so grepping the APK for resource *names* returns nothing. Use `aapt2 dump
badging` / `dump resources`, or grep for asset *content* as above. An earlier check of mine
concluded "no launcher icons in the APK" for exactly this reason and was wrong.

Also note `unzip` on this APK collides on a duplicate `res/hq.xml` and will hang on an
interactive prompt — always use `unzip -oq`.

---

## 19. SESSION LOG — 2026-09-28: full audit remediation

Every finding in `docs/AUDIT-2026-09-27.md` was worked, in the audit's own order.
A snapshot was taken first (`~/vanta-pre-audit-fix-*.tar`, plus commit `2f3f110`), so the
pre-fix tree is recoverable.

### 19.1 Finding-by-finding

| ID | Finding | Status | Where |
|---|---|---|---|
| **C1** | Relayer token in the APK unlocks the private payment graph | ✅ **Fixed** | History reads/writes are now **identity-signed** (`src/lib/identityProof.js`), not shared-token. The token no longer unlocks `/tx/:address`. The token still ships — it gates `/relay`/`/fund` only. |
| **C2** | Server stores the linkage the pool hides | ✅ **Fixed** | `amount_atomic` + `counterparty` **dropped** from `relayer/schema.sql` / `db.js`; live DB columns dropped and old `client_report` scrubbed. Harness asserts `amount is NOT stored` / `counterparty is NOT stored`. |
| **C3** | Spend key plaintext in `localStorage` | ⚠️ **Disclosed, not eliminated** | The prover needs the seed readable, so it stays plaintext. Settings now states the *how*, not just the *where*: the seed is plaintext, and the note/history stores are encrypted with a key **derived from it** — so their encryption defends against a storage dump, not a device compromise. Backup (H4) is the actual answer; Seed Vault is the real fix. |
| **H1** | All history/receipts vanish on restart | ✅ **Fixed + device-verified** | `src/lib/localHistory.js` — XChaCha20-Poly1305 under `sha256(seed ‖ "vanta-history-v1")`, capped at 500 rows, **preserved untouched** when it cannot be decrypted. |
| **H2** | "Download PDF receipt" reports success, writes nothing | ✅ **Fixed + device-verified** | New native `FileSaver.kt` + `saveBase64File` bridge (MediaStore `Downloads/Vanta/` on API 29+, legacy fallback, 20 MB cap). The toast now reports what actually happened. |
| **H3** | Advertised Ghost fallback never fires | ✅ **Fixed** | `SendDrawer.jsx` now **walks the error cause** — the SDK throws `WALLET_BUILD_TRANSFER` *over* `RECIPIENT_NOT_REGISTERED`, so matching `err.message` alone never matched. |
| **H4** | No backup path — `pm clear` destroys the balance | ✅ **Fixed + device-verified** | `src/lib/backup.js` (scrypt N=2¹⁴ → XChaCha20-Poly1305, one base64 line) + `BackupDrawer.jsx`, wired into Settings. |
| **H5** | Incoming funds never update the balance | ✅ **Fixed** | Public balance polls every 20 s, on `visibilitychange` and on a `vanta:refresh-public` event; private notes resync on foreground. |
| **H6** | MWA connect silently replaces the stranded wallet | ✅ **Fixed + device-verified** | `src/lib/walletStore.js` — two custody slots (`session` / `device`) + an active pointer + legacy migration. Switching now names the wallet it is about to replace **and reads its on-chain balance** to warn about stranded funds. |
| **M1** | Receive QR sends your address to `api.qrserver.com` | ✅ **Fixed + device-verified** | QR generated on-device via `qrcode` (data-URL PNG). Zero QR-related network requests; works offline. |
| **M2** | Claims vs behaviour (three lies) | ✅ **Fixed** | Activity copy now describes what the relayer actually keeps ("a receipt anchor — the signature, the flow and the time — never the amount or the recipient"); `lib/honesty.js` adapts the Ghost-to-self note; the Shadow fallback promise now matches H3's real behaviour. |
| **M3** | Raw internals shown to users | ✅ **Fixed** | Send/shield paths translate SDK codes into actionable text. |
| **M4** | Test data in the production database | ✅ **Fixed** | Audit-era harness rows purged from Neon; the harness now self-cleans (removes its own name + tx rows). |
| **M5** | Receipts unreachable without touch | ✅ **Fixed** | Activity rows are real `<button>`s — focusable, keyboard-operable, screen-reader labelled. |
| **M6** | Privacy toggle resets / public downgrade unconfirmed | ✅ **Fixed** | Ghost→public downgrade gets an explicit confirm card naming the consequence; toggle is guarded. |
| **L1** | `+0.000 / -0.000` header on empty history | ✅ **Fixed** | Zero-state header. |
| **L2** | `.vanta` handle absent from Receive | ✅ **Fixed** | ReceiveDrawer surfaces the claimed handle (this test identity has none registered, so the row is correctly absent). |
| **L3** | `navigator.vibrate` console noise | ✅ **Fixed** | `src/lib/haptic.js` guards the call. |
| **L4** | Unknown API paths return Express HTML 404 | ✅ **Fixed** | JSON 404 + JSON terminal error handler; verified `GET /etc/passwd` → `{"ok":false,"error":"Not found: GET /etc/passwd"}`. |
| **L5** | `autoShield` labelled "not wired yet" | ⚠️ **Left as-is, deliberately** | The label is true, and it errs toward disclosure. |

**Also closed from the audit's own footnote:** the MWA **connect** path had no timeout
(`withTimeout` wrapped only signing) — connect now has a 120 s timeout with the same
wallet-naming error treatment as signing.

### 19.2 Device evidence (emulator-5554, debug APK)

| Check | Result |
|---|---|
| Restart with a funded Shield in history | Row restored from the encrypted store — **exactly one** row, no phantom duplicate |
| Receive drawer offline | QR is `data:image/png;base64`; `performance.getEntriesByType('resource')` contains **no** QR/external request |
| PDF receipt | Toast ⇒ `Saved … to Download/Vanta/…`; file on disk = 5147 bytes, `%PDF-` magic |
| Backup export | 7480-char single-line blob produced |
| Backup restore | Blob opened → confirm screen (wallet + "cached notes · history") → **Reload** → same address, identity, private 0.050, history intact |
| Wallet slots | `vanta-wallet-session` / `vanta-wallet-device` + `vanta-wallet-active` pointer + legacy mirror all written correctly |
| **Ghost send** | Landed twice (private 0.050 → 0.030 → 0.020); both rows reached the relayer as **`verified_on_chain: true, flow_source: client`** |
| **Report + signed read** | Identity-signed `GET /tx/:id` → 200 `count=3`; identity-signed `POST /tx/report` → `{"ok":true,"stored":true,"verified_on_chain":true}` in 1366 ms; **shared token alone → 401** (C1); stored rows have **no `amount_atomic`, no `counterparty`** (C2) |
| Shadow → unregistered | Correctly detects the unregistered recipient and shows the downgrade-confirm card before any public send — **no raw `WALLET_BUILD_TRANSFER`** |
| Relayer harness | `relayer/test-db.mjs` **32/32** green, self-cleaning (live Neon) |
| Lint | `oxlint` — **0 errors** (28 pre-existing warnings, all in `scripts/` and old `App.jsx` code) |

> ⚠️ **A real bug was caught by this device pass, not by any harness.** `reportTx` declared
> the verdict as `const proof` inside the same block that builds the request body — and the
> body reads the **outer** `proof` (the signature). The inner declaration put that binding in
> its temporal dead zone, so **every report threw `ReferenceError: cannot access before
> initialization` and no send ever recorded `verified_on_chain`**. The harness could not see
> it (it tests the server, and the server was fine), the send still landed, and the failure
> was swallowed by the "never fail a send" catch — silently degrading every receipt to
> "Not checked". Renamed to `proofKey`. **Lesson: the `recordSend` path is only proven by a
> real send on a device.** Two more issues surfaced the same way: the 5 s report ceiling was
> too tight (the endpoint does an on-chain `getTransaction`; measured 1.4–2.0 s, and a
> just-confirmed signature may not be indexed yet) — raised to 12 s and named.

### 19.3 Still open

- **Shadow send (registered recipient) and public send re-test** — Ghost is verified, these two
  are the same `recordSend` path but were not re-run on the final build. Note the emulator did
  not have a registered `.vanta` handle to send to.
- **MWA connect + authorize re-test** — needs a wallet app installed on the emulator.
- **No automated test covers the client report path.** `scripts/` has round-trip checks for
  `localHistory` and `backup`, and the harness covers the relayer, but nothing exercises
  `reportTx` — which is exactly why the TDZ above survived to a device. A test would need
  `import.meta.env` stubbed (that is all `src/lib/config.js` blocks plain-node import).
- The emulator's network was **flaky** all session (≈50% packet loss to
  `api.devnet.solana.com`), surfacing as `Balance read error: TypeError: Failed to fetch`.
  Environmental, not code.

### 19.4 New/renamed files this pass

New: `src/lib/{walletStore,identityProof,localHistory,backup}.js`,
`src/components/BackupDrawer.jsx`,
`android/app/src/main/java/com/vanta/privacywallet/FileSaver.kt`,
`scripts/{history-store-check,backup-check}.mjs` (the last two are the promoted round-trip
tests — they ship as permanent checks, not temp files).
