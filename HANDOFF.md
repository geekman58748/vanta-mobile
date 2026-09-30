# VANTA — MASTER HANDOFF (2026-09-26)

> **Next agent: read this whole file before touching anything.** It supersedes the
> Umbra-era handoff, which is archived at `docs/handoff-umbra-era-2026-09-20.md`.
> The living action log is `PLAN.md`; the threat model is
> `docs/vanta-privacy-architecture.md`; the SDK notes are `docs/zolana-integration.md`.
>
> ⚠️ The archived handoff is **actively misleading** if read as current. See §1.
> This file was reconciled with the working tree on 2026-09-26 ~14:15 — if the tree is
> ahead of this table again, trust `git status`, not this doc.
>
> 🔧 **2026-09-28:** the whole of `audits/AUDIT-2026-09-27.md` (C1→L5) was remediated.
> The finding-by-finding table with device evidence is **PLAN.md §19**; §13 below is the
> short version of what changed and what it means for the next agent.

---

## 0. TL;DR — where we are

- **Repo**: `~/vanta-mobile` → `https://github.com/geekman58748/vanta-mobile.git`
- **Product**: **Vanta** — "Raise publicly, spend privately." A devnet privacy wallet:
  React 19 + Vite SPA, wrapped in the **official Solana Mobile webshell** as an Android APK.
- **Privacy rails**: **Helius Zolana "Privacy Rings"** (`@heliuslabs/zolana`).
  Pool program `sppU489D7A4U1exNo1oeMGZtLEofq3a6o2fR7UeoWB6`.
- **Three flows**: **Shield** (public → pool), **Shadow** (private → private, Vanta→Vanta),
  **Ghost** (pool → any public wallet).
- **MWA is integrated** (`src/lib/mwa.js`, `src/lib/wallets.js`) and **verified working
  end-to-end on device and on a physical phone** — see §4.
- **Relayer** (`relayer/`, `:3001`): token-authenticated, capped, program-allowlisted, and
  backed by **Neon Postgres** — transaction history + the `.vanta` handle registry.
- **App** (`:3000`, launchd `com.vanta.server`, serves `dist/`). **Rebuild after any
  `src/` change.**
- **Android**: package `com.vanta.privacywallet`. Debug APK ✅. Release APK **unsigned**.
- **Landing page**: separate Vite site in `landing/`.
- **Deadline**: **2026-10-08** (CLOCK IN, Solana Mobile × RadiantsDAO). Judging Oct 10–Nov 9.

## 1. ⚠️ Corrections to the archived Umbra-era handoff

The old file was written before the Zolana pivot. These instructions are now **wrong**:

| Archived instruction | Reality now |
|---|---|
| "we ARE the wallet, not an MWA client. **Do not add** `@solana-mobile/mobile-wallet-adapter-protocol`" | **Wrong.** MWA is integrated and is the custody layer. Do not remove it. |
| Umbra is the privacy rail; per-send burner wallets; `vanta-burner-*` localStorage | **Gone.** Umbra, burner flow, linker-PDA leak analysis and Arcium/MPC are all removed from the code. |
| "Private send" via stealth pool + relayer burn | **Replaced** by Zolana Shield / Shadow / Ghost. |
| `src/App.jsx` ~730 lines, single file | Now **1348 lines** plus `src/lib/` (7 modules) and `src/components/` (7 components). |

Still valid from that era: the launchd server rule (§3), the public-devnet-RPC throttling
lesson, the faucet-rate-limit lesson, and the **general** principle that a single
fresh-wallet hop is still a fully public graph (see §9).

## 2. What Vanta is now

- **Custody**: the user's *public* funds live in a device wallet (Seed Vault / Phantom /
  Solflare) and sign through **MWA**. Vanta never stores that key. There is also an in-app
  throwaway key path for dev convenience.
- **The shielded spending identity X** stays in the app (the ZK prover is JS-only).
- **Relayer** sponsors fees on the in-app path. On the MWA path the device wallet is both
  depositor *and* fee payer, so the relayer is not in the trust path.
- **Honest privacy statement** (this is the whole product claim):
  *Donors see the campaign receive and shield. They can't see where it pays out.
  The crowd makes the second part strong.*
  The pool hides the **link between funding and payout** and **who you pay**. It
  **cannot** hide that you funded the pool, and a near-empty pool makes
  amount+timing correlation trivial.
- **Backend**: the relayer is the authoritative observer of the txs it sponsors, so it
  records them itself rather than trusting the client. Shadow and Ghost spends never touch
  the relayer (X pays its own fee), so they arrive via `POST /tx/report` and stay
  `verified_on_chain = false` until an on-chain lookup confirms them.

## 3. Environment & commands

```bash
# Web app: MUST rebuild after any src/ change — the server serves dist/, not src/
cd ~/vanta-mobile && npx vite build
npx oxlint src/            # lint (expect 0 errors; a few pre-existing warnings)

# Servers (launchd, survives shell exit)
launchctl list | grep vanta
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000   # expect 200
curl -s http://localhost:3001/status                                  # relayer + db health

# Relayer / backend
node relayer/test-db.mjs            # Postgres + .vanta registry harness
node scripts/test-name-resolution.mjs

# Android
export ANDROID_HOME=/Users/mac/Library/Android/sdk
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$JAVA_HOME/bin:$PATH"
export ANDROID_SERIAL=emulator-5554      # pin this: >1 emulator gives "more than one device"
adb devices
```

**Config** — `src/lib/config.js` reads `VITE_RELAYER_URL` / `VITE_RELAYER_TOKEN`;
`App.jsx` reads `VITE_HELIUS_API_KEY` (falling back to the public devnet RPC). Copy
`.env.example` → `.env.local`. ⚠️ `VITE_*` is compiled into the client bundle: it keeps
secrets out of *git*, not out of the shipped app.

**Hard-won environment rules (do not relearn these):**

- **Background processes die when the tool/shell session ends** — `nohup`, `disown` and
  `setsid` (which does not exist on macOS) all failed. Background work must finish inside
  one shell invocation, or it must be a launchd service. launchd is the only thing that
  reliably survives.
- **Pin `ANDROID_SERIAL`.** A second emulator (`emulator-5566`) has appeared before.
- **WebView loads `http://localhost:3000`** — a restart is normally enough; if you ever see
  stale JS, force-stop the app and relaunch.
- **`adb forward` must be cleared before re-adding** — the devtools socket name carries the
  app pid. All `scripts/webview-*.mjs` now do `forward --remove-all` first.
- **CDP is only available on a DEBUG shell build** — `MainActivity` gates
  `WebContentsDebuggingEnabled` on `BuildConfig.DEBUG`.

## 4. ★ MWA integration — the hard-won knowledge

### 4.1 The bug that cost the most time (fix is in `src/lib/mwa.js`)

`serializeCompiledTx` originally emitted the **legacy** wire layout
`[sigCount][sigs][message]`. zolana compiles **every** builder to a **v1** transaction
(`interface/transaction-size.js`: *"a version 1 transaction, the format every builder here
compiles to"*). v1's version byte is `0x81` and its **signatures trail the message**.

Wallet parsers dispatch on byte 0, so the legacy prefix made the wallet take the legacy
branch, read `0x81` as a compact-u16 length, and die:

```
java.lang.ArrayIndexOutOfBoundsException: length=361; index=8258
  at SolanaSigningUseCase.getSignersForTransaction(…:97)   // 8258 = 2 + 64*129
```

**Correct encoding:**

```js
// message first, signatures last (v1)
const out = new Uint8Array(message.length + order.length * 64)
out.set(message, 0)
```

This presented as a **hang**, not a crash — the app showed a spinner forever, the wallet
looked like it was waiting for approval, and it was misdiagnosed as a websocket/port/
approval problem for hours. **The lesson: when MWA signing appears to hang, read the
wallet's own logcat before theorising.**

### 4.2 Other MWA facts

- Registration works via a **hand-rolled wallet-standard registry** in
  `src/lib/wallets.js` — `@wallet-standard/app` is unresolvable under pnpm's strict
  layout, and the handshake must pass an **API object** `{ get, on, register }` (not a
  bare `register` function) or you get `t is not a function`.
- `vite.config.js` sets `build.target: 'esnext'` so `@wallet-standard/wallet`'s
  private-field class helpers are not downleveled.
- The transport is: dapp picks a random port → sends it via a
  `solana-wallet:/v1/associate/local?...` intent → **the wallet binds
  `ws://localhost:<port>/solana-wallet`** → dapp connects. Early `ERR_CONNECTION_REFUSED`
  lines are normal retries while the wallet app launches; they are not the failure.
- The library only times out **association**. A wallet that never answers leaves the sign
  promise pending forever, which permanently disables the Shield button. `mwa.js` wraps
  sign calls in `withTimeout` (90s) with an actionable message, and translates the v1
  parse failure ("end of buffer" / "failed to process request") into a specific message.

### 4.3 Verified evidence (devnet, 2026-09-26)

Device wallet (MWA) `6NrEzXoaEzpxUuHERCtW46xKa3j41B2AAMG4R8a1zhDt`; all `err: null`:

| Leg | Signature |
|---|---|
| Relayer funding | `5HcLNQrecNBMrF7fX3EdQ4P8zcW6qsQpLNwWfN7U2cRfaNx9h69y5TRPjXi3x37quX5JC9dj5ndTuHcbpe3AmJUR` |
| Shield #1 | `21sFAdV2GMBzfDpEehcZ9mfHxCsQdWqgQMyT2Fccjtn9nERrRBpAfjwwy1MtFcru15woFi9moerqDNBb2NmZcuEA` |
| Shield #2 | `5HgkVeT8FaAgecmuLtPZCsuoBsV42zzrCXNop6BQcXtTPqDQhdwMsggyErRDwnFEmE9WuuXmbSUmxEASHGq8A9nT` |
| Shield #3 | `3Z2zK7658GRuJLKxjFQaKxGqekvGakmV6HTpdyG3RgRMJofLMgFptDyuRUTDHJxmaTAm9CXP6uFeNoYkxRD3pR6A` |

App reported **private balance 0.300 SOL** = 3 × 0.1 SOL Shield. Later the same day the
**full set** — Shield ×2, Ghost (to self), Shadow — was reproduced on a **physical phone**
(Xiaomi, store-installed wallet, USB + `adb reverse`). Full reconciled timeline in
`docs/live-test-evidence.md`.

## 5. ⚠️ Wallet v1 support is a real dependency

v1 transactions shipped with **Agave 4.2** (Sept 2026). solana.com states support
*"is per-wallet and may vary"*. Vanta cannot opt out — zolana always emits v1.

- The **stock `fakewallet` release APKs are the legacy flavor**, published under both
  the `fakewallet-legacy-*` and `fakewallet-v1-*` names (byte-identical). The legacy
  build **cannot sign a v1 payload at all**.
- A v1-capable wallet must be **built from source**. Procedure in §6.4.
- **Open risk:** Phantom / Solflare / Backpack v1 support is unconfirmed. `mwa.js`
  partially handles this by translating the error — finish it as a first-class,
  user-visible message (§7.1). This is a P0 follow-up.
- **RPC twin:** `maxSupportedTransactionVersion` **must be 1** or the RPC refuses to
  decode Zolana txs and every one reads as unverified forever. Same root cause, other
  side of the wire.

## 6. Diagnostic + test scripts

### 6.0 Real-device (USB) setup — the fast path

```bash
./scripts/device-test.sh --wallet   # installs Vanta debug APK + v1 fakewallet, wires adb reverse, launches
node scripts/device-clipboard.mjs "<text>"   # set the phone clipboard via the WebView
```

`device-test.sh` auto-finds the physical phone (ignores emulators), checks the app
server, sets `adb reverse tcp:3000/tcp:3001`, installs, and launches. Flags: `--release`
(release APK, no CDP), `--wallet` (also install the v1 fakewallet from
`deploy/apk-backup/fakewallet-v1-debug.apk`), `--app-only`.

Real-world notes from the first phone session (Xiaomi, MIUI, Android 16):
- MIUI blocks `adb install` (`INSTALL_FAILED_USER_RESTRICTED`) even with Install-via-USB
  enabled. Workaround that works: `adb push` the APKs to `/sdcard/Download/` and install
  by tapping them in Files.
- MIUI blocks simulated taps (`INJECT_EVENTS`) into apps other than ours — the user taps,
  the tooling reads the screen (`uiautomator dump`) and drives our own WebView over CDP.
- `adb reverse` tunnels die on unplug/reconnect — re-run the script or re-add them.
- Phone clipboard: Android blocks JS clipboard *reads*, so `device-clipboard.mjs` can
  write but not verify; long-press → Paste to confirm.

### 6.1 WebView diagnostics (require a debug shell build)

| Script | Purpose |
|---|---|
| `scripts/webview-inspect.mjs` | Evaluate JS in the WebView over CDP (default dump: UA, shell marker, secure context, localStorage keys) |
| `scripts/webview-console.mjs` | Stream console/uncaught errors; reloads by default (`RELOAD=0` to attach only) |
| `scripts/webview-ua.mjs` | CDP User-Agent override (note: the shell re-injects its UA, so this does not stick) |

### 6.2 MWA test harnesses (read these before writing another)

| Script | What it does | Why it exists |
|---|---|---|
| `scripts/mwa-wire-check.mjs` | Builds a real deposit and runs **fakewallet's own bounds checks** against both encodings | Fastest possible check of §4.1 with no device involved |
| `scripts/mwa-shield-test.mjs` | CDP watcher: clicks Shield and streams console + WebSocket + navigation events | Ground truth for *why* the app stalled |
| `scripts/mwa-v1-e2e.sh` | **The one to use.** Full end-to-end: connect → fund → Shield → approve → confirm balance moved | Locates the wallet's AUTHORIZE button from the a11y tree, so it survives fakewallet layout changes |
| `scripts/mwa-e2e-tap.sh` | Purely coordinate-driven variant | Kept for reference; coordinate taps are fragile (see below) |
| `scripts/mwa-shield-run.sh`, `mwa-shield-approve.sh`, `mwa-shield-e2e.sh` | Earlier, superseded attempts | Historical — prefer `mwa-v1-e2e.sh` |

**Harness pitfalls that cost real time (avoid repeating):**

- `uiautomator dump` **hangs for many seconds on Vanta's WebView** (the animated
  `TopoWaves` background defeats wait-for-idle). Only dump while **fakewallet** is in the
  foreground. Drive Vanta's own UI over CDP instead.
- **Hardcoded tap coordinates break between fakewallet flavors.** Legacy puts AUTHORIZE at
  `y≈672`; the v1 build puts it at `y≈1017`. Find it by resource id
  (`…:id/btn_authorize`) from the a11y tree.
- A CDP selector of `innerText.startsWith('Shield')` **also matches the header status
  badge** (`Shielded`). Match the action row concretely: `/^Shield\s+\d/`.
- `adb shell dumpsys window | grep mCurrentFocus` is the cheap foreground check.

### 6.3 Headless rails test

```bash
node scripts/e2e-zolana.mjs     # shield → shadow → ghost against real devnet, fresh identities
```

Passed on 2026-09-26. It signs client-side and submits raw wire bytes via
`sendTransaction`, so it validates the **rails and wire format** but says nothing about
wallet parsing — that is what the MWA harness covers.

### 6.4 Building a v1-capable fakewallet (~5 min, ~700 MB first time)

```bash
git clone --depth 1 https://github.com/solana-mobile/mobile-wallet-adapter.git /tmp/mwa-repo
cd /tmp/mwa-repo/android
export ANDROID_HOME=/Users/mac/Library/Android/sdk
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew :fakewallet:assembleDebug          # produces legacy/ AND v1/ flavors
adb uninstall com.solana.mobilewalletadapter.fakewallet   # release-signed APK will not update over debug
adb install /tmp/mwa-repo/android/fakewallet/build/outputs/apk/v1/debug/fakewallet-v1-debug.apk
```

Notes: the project needs Gradle ≥ 9.4.1 (AGP 9.2.1). Cached distributions live in
`/Users/mac/.gradle/wrapper/dists`. `HOME` in the agent shell is sandboxed, but Gradle
uses the real `/Users/mac/.gradle`.

### 6.5 Android packaging

```bash
npm run build:android     # vite build && node scripts/bundle-android.mjs
                          # stages dist/ → android/app/src/main/assets/www/
cd android && ./gradlew assembleDebug     # → app/build/outputs/apk/debug/app-debug.apk
```

`android/app/src/main/assets/www/` is **generated** and gitignored — never edit it by hand.
Release signing uses `deploy/vanta-release.jks` (+ `deploy/.keystore-password`, both
gitignored). **The release APK is currently unsigned** and still needs a public URL before
it will render on a real phone.

## 7. Known bugs / open questions

| # | Item | Severity |
|---|---|---|
| 7.1 | ✅ **Resolved** — v1 parse failures are matched explicitly (`V1_UNSUPPORTED`) and named the wallet, and **connect** now has a 120 s timeout to match signing's. | done |
| 7.2 | **Stale-session duplicate spend:** on the emulator, two Shields landed 66s apart against one harness click — most plausibly a leftover pending sign session being approved by later AUTHORIZE taps. Phone timeline reconciles with nothing unexplained. Mitigations: Shield disables while `loading`, sign calls time out after 90s. Verify, and add a visible "retry association" affordance. | P0 — verify |
| 7.3 | ✅ **Resolved** — Shield amount comes from `ShieldDrawer.jsx` (presets, fee-aware Max, keypad); `SHIELD_FEE_RESERVE` is shared with `shieldNow`'s guard. | done |
| 7.4 | ✅ **Resolved** — `ProfileDrawer.jsx` claims a handle with a client-side Ed25519 proof over `vanta-name-claim:<name>`, signed by the identity seed. Linked Settings ↔ Profile. | done |
| 7.5 | **Receipt UI** — ✅ per-leg breakdown shipped: `lib/honesty.js` is the single source of truth, rendered by `HonestyRows.jsx` from both `ReceiptDrawer` and `PrivacySheet`. ✅ PDF export shipped: `lib/receiptPdf.js` (Space Grotesk display face via `@pdf-lib/fontkit` + Helvetica text face, vector TopoWaves, offline fallback), pixel-verified by `scripts/pdf-receipt-check.mjs` + `pdf-receipt-analyze.py`. ✅ `verified_on_chain` reaches the client via `lib/txHistory.js` (7.13). | done |
| 7.6 | **3-page first-run intro does not exist** (no `onboarding`/`intro`/`slide` code). | P1 |
| 7.7 | Release APK is ~2 MB and loads a remote URL — blank on a real phone without a public URL. | P1 |
| 7.8 | **Git history still holds the old secrets** — `relayer-keypair.json` and the Helius key are removed from the tree and gitignored, but `028544f` carries them. Rotate + scrub before the repo goes public. | P1 (§8) |
| 7.9 | `autoShield` toggle in Settings is UI-only, explicitly labelled "not wired yet". | P2 |
| 7.10 | Sumsub is **schema-only** (`sumsub_verified`, reserved handle) — no token endpoint, no UI. | P2 |
| 7.11 | SKR / Seeker Genesis tier: not started. Separate $10k prize. | P2 |
| 7.12 | Root `README.md` is still the Sep-20 stub; no LICENSE. | P1 |
| 7.13 | ✅ **Resolved** — `verified_on_chain` reaches the client via new `lib/txHistory.js`: Shadow/Ghost/Public are `POST /tx/report`-ed (the relayer is absent from those txs, so before this they never reached the history at all), Shield is re-read only because re-posting would overwrite `flow_source='relayer'` with `'client'`. Renders in ReceiptDrawer + as an "On chain" PDF row. **Write path still needs a live in-app send to confirm.** | done / verify |

## 8. Audit blockers — the repo is going public

**Resolved in-tree (verified 2026-09-26):**
- ✅ Helius key moved to `VITE_HELIUS_API_KEY` (`App.jsx`), no literal in `src/`.
- ✅ `relayer/relayer-keypair.json` staged for deletion, gitignored.
- ✅ `RELAYER_URL` / token read from `src/lib/config.js`.
- ✅ Relayer `/relay` `/fund` `/tx/*` `/names/claim` require a token; `/fund` is capped
  per-request and per-window; `/relay` refuses non-allowlisted programs; CORS is
  origin-listed. See `relayer/README.md`.
- ✅ `.gitignore` covers test identities, `.env*`, keystores, APKs, build output.
- ✅ **(2026-09-28, audit C1/C2)** history reads/writes are **identity-signed**
  (`src/lib/identityProof.js`), so the shipped `VITE_RELAYER_TOKEN` **no longer unlocks the
  payment graph**, and the relayer stores **no amount and no counterparty** — those columns
  are dropped from `schema.sql`, `db.js` and the live Neon database. The token is now a
  relay/faucet credential only.

**Still open:**
- ❌ **Git history** still contains the old keypair + Helius key (`028544f`).
- ❌ **No public deploy yet** — Dockerfile/`fly.toml`/README exist, the deploy does not.
  A distributable build needs public HTTPS (mixed content is blocked, and on a phone
  `localhost` is the phone).
- ❌ **Rotate the keys** regardless of history scrubbing — the old relayer keypair and the
  Helius key. (The relayer **token** is lower-stakes now that it no longer unlocks history,
  but `.env.local` still holds the live one and it still funds `/fund`.)

## 9. Claims language — hard rules

✅ **Claim:** the pool hides the **link between funding and payout** and **who you pay**.
*"Donors see the campaign receive and shield. They can't see where it pays out."*

🚫 **Never claim:** "anonymous", "untraceable", "sender hidden", "invisible", or that
the deposit is private. The Shield deposit is **fully public** (`depositor`, `amount`);
the payout recipient is absent.

⚠️ **State these residuals out loud** — it reads as competence:
1. The Shield deposit is public and ties the depositor to the pool inflow.
2. A single fresh-wallet hop (main → burner → pool) is **not** privacy; it is a fully
   public, unbroken graph. Spreading timing/amounts over a long crowdfund *is* useful.
3. On every Shadow/Ghost send the **spend identity X is the fee payer and is reused**
   (`PLAN.md` §3.1). Anyone you've paid can chart your send count and timing.
4. With a small anonymity set, amount+timing correlation is trivial. Pool depth is the fix.
5. On the MWA path the **device wallet is the public depositor**, so the user's real
   address is on-chain linked to their shielding. Disclose this.
6. Custody is a **shared program vault** with a live upgrade authority — the notes are
   bearer claims; lose the seed, lose the funds.

**On "volume bots" (raised by the owner, not approved):** fabricating pool activity is
deceptive to users, judges and the Helius team. Address the real concern — a near-empty
pool weakens the privacy claim — with real seeded volume plus honest wording, not bots.

## 10. Phase status / priority queue

| Phase | Status |
|---|---|
| Wallet core, balance, airdrop, plain send | ✅ |
| Zolana rails (Shield / Shadow / Ghost) | ✅ devnet, verified |
| MWA connect + sign on device **and physical phone** | ✅ verified 2026-09-26 (§4.3) |
| Relayer auth + caps + program allowlist | ✅ |
| Neon Postgres: tx history + `verified_on_chain` | ✅ (harness green) |
| `.vanta` registry backend + client resolution | ✅ backend / 🟡 UI |
| Android webshell + debug APK | ✅ |
| Landing page | 🟡 built, not deployed |
| Shield amount UX + fee-inclusive guard | ✅ `ShieldDrawer.jsx`, fee-aware Max |
| Theme / skin | ✅ amethyst on near-black; green accent + Android-green splash gone; `dynamicColor` off |
| Claim-name UI (Profile tab) | ✅ `ProfileDrawer.jsx` + `src/lib/names.js` |
| Honest receipt UI (per-leg public/hidden/linkable) | ✅ `lib/honesty.js` + `HonestyRows.jsx` + PDF export (`lib/receiptPdf.js`) + `verified_on_chain` (`lib/txHistory.js`) |
| First-run intro | ⬜ |
| Release-signed APK + public URL | ⬜ |
| Sumsub / SKR tiers | ⬜ schema only |
| Submission packaging (README, LICENSE, video, deck) | ⬜ |

Priority queue:
1. ~~Receipt / honesty UI (7.5)~~ — per-leg breakdown, PDF export and
   `verified_on_chain` **all done**. Confirm the write path on the next in-app send.
2. v1 capability detection + clear error (7.1); verify 7.2.
3. First-run intro (7.6).
4. Packaging: sign APK, deploy relayer, README/LICENSE, video, deck (7.7, 7.8, 7.12).
   ⚠️ Deploying needs `RELAYER_TOKEN` set server-side **and** `VITE_RELAYER_TOKEN`
   client-side — neither is in `.env.local` today, so the relayer is in dev mode.

## 11. DO NOT list

- **DO NOT** remove or bypass MWA — it is the custody layer, not a cosmetic add-on.
- **DO NOT** "fix" `serializeCompiledTx` back to a legacy `[sigCount][sigs][message]`
  layout (§4.1). v1 is message-first.
- **DO NOT** claim anonymity/untraceability (§9).
- **DO NOT** assume a wallet supports v1 (§5) — check. And send
  `maxSupportedTransactionVersion: 1` or every Zolana tx reads as unverified.
- **DO NOT** build a Zolana spend without `syncWallet` after the previous confirmed tx.
- **DO NOT** run long jobs with `nohup`/`disown`/`setsid` and expect them to survive; use
  launchd (§3).
- **DO NOT** edit `android/app/src/main/assets/www/` by hand — it is generated by
  `npm run build:android`.
- **DO NOT** hardcode tap coordinates for fakewallet prompts (§6.2).
- **DO NOT** dump the Vanta WebView with `uiautomator` — it hangs (§6.2).
- **DO NOT** reintroduce a second accent hue. One amethyst accent; the Solana and USDC
  marks keep their own colours because they are brand marks, not chrome.
- **DO NOT** re-enable `dynamicColor` in `ui/theme/Theme.kt` — it takes the scheme from
  the user's wallpaper.
- **DO NOT** build volume bots (§9).
- **DO NOT** commit anything from `deploy/` (`*.jks`, `.keystore-password`) or any `.env`.
- **DO NOT** rebuild the APK with `WEB_SHELL_URL=http://localhost:3000/` uncommented — that
  is the dev live-reload mode and it turns the shipped APK into a blank wrapper.

---

## 12. UPDATE LOG — 2026-09-26 (evening)

Three things changed that contradict earlier text in this handoff. Details + commands in
**`PLAN.md` §18**.

### 12.1 The release APK is signed ✅ — and it never needed a public host
`deploy/vanta-release.jks` signs it; `apksigner verify` passes (v2 scheme). The Java runtime
is not on `PATH` — export `JAVA_HOME` to Android Studio's bundled JBR or brew's `openjdk@17`
first, or `gradlew` fails with *"Unable to locate a Java Runtime"*.

The APK **bundles `dist/` and boots offline** through `WebViewAssetLoader` at
`https://appassets.androidplatform.net/assets/www/index.html`. Any note (including earlier
revisions of §6.5 and `PLAN` §4.7) saying the release APK "loads a remote URL" is wrong.
What still needs a public URL is the **relayer**, because `VITE_RELAYER_URL` is compiled into
the bundle.

### 12.2 Hosting target is Northflank, not Fly.io
`relayer/fly.toml` is superseded. Fly has had **no free tier since 2024-10-07** and bills from
the first machine; Render's free tier **sleeps after 15 min**. **Northflank's free Sandbox**
is the only free *always-on* option — verified from their pricing page 2026-09-26: *"Always-on
compute – no sleeping :)"*, 2 free services, 1 free database, 2 free cron jobs. The judging
window runs Oct 9 → Nov 11 or longer, so "no sleeping" is the deciding property.

⚠️ Keeping the container warm is necessary but not sufficient: **Neon's free tier suspends
after 5 min idle** (~300–800 ms cold start). The fee path does not touch the DB, so no send
breaks — but the first `.vanta` lookup or activity load after idle is slow.

### 12.3 First-run onboarding shipped ✅
`src/components/Onboarding.jsx` + `Onboarding.css`, gated on `localStorage['vanta-onboarded']`,
mounted as an early return in `App.jsx`. Ported from a neobank mock (`onboardingflow (2).html`)
and **re-skinned and rewritten**, not merely recoloured: blue → amethyst, the `FŁUX` VISA card
→ a Vanta **private note**, and the false "secured by your biometrics" claim → "no account,
keys stay on this device". GSAP is not used (the app has no animation library).
New harness: `scripts/ob-ssr-check.jsx` (41 server-render assertions). See `PLAN` §18.2.

### 12.4 The brand mark landed — and the launcher icon was still the Android robot
`vantalogo.png` (Desktop) is **pure monochrome white on transparency**, so it needs no
tint on the dark canvas, but it is **mostly padding** — the visible mark is only 418×441 of
a 1254px canvas, so it must be trimmed before use or it renders 3× too small.

Shipped at `src/assets/vanta-logo.png` — trimmed to the alpha bbox, 256px, saved
**luminance+alpha** (16.6 KB vs 99 KB as 512px RGBA; LA is lossless for monochrome).
Placed on the first-boot screen (replacing a bare letter "V") and leading onboarding step 1.

**The bigger find: the Android launcher icon was the webshell template's stock Android
robot**, and so was the splash icon. The colours had been fixed earlier
(`launcher_icon_background` `#2A2150`, `splash_background` `#060509`) but not the artwork —
so the app installed showing a green robot on the home screen of every judge's device.

Fixed by `scripts/gen-launcher-icons.py` (generates all 5 densities + adaptive foreground),
repointing `mipmap-anydpi/ic_launcher{,_round}.xml` at `@mipmap/ic_launcher_foreground` for
both `foreground` and `monochrome`, and **deleting `drawable/ic_launcher_foreground.xml`**.
`values/themes.xml`'s `windowSplashScreenAnimatedIcon` was the other hidden reference to
the robot — catch it with a grep for the drawable name, not just the mipmap XMLs.

⚠️ **`unzip` the release APK with `-oq`.** It contains a duplicate `res/hq.xml` and plain
`unzip` hangs on an interactive overwrite prompt. Release builds also shorten resource
paths (`ic_launcher_foreground.xml` → `res/E4.xml`), so never grep the APK for resource
names — use `aapt2 dump badging`, or grep for asset *content*.

---

## 13. UPDATE LOG — 2026-09-28: audit remediation

`audits/AUDIT-2026-09-27.md` was an adversarial pass over the live app. **All of it was
worked.** Full table + device evidence: **`PLAN.md` §19**. The parts a next agent must know:

### 13.1 The trust boundary moved off the shared token

The audit's three critical findings were all the same story: the app promised the server
could not see payments, and the server could. Both halves are now real.

- **Reads and writes are identity-signed.** `src/lib/identityProof.js` builds an Ed25519
  proof over a domain-separated message; `txHistory.js` sends **no amount and no
  counterparty**; `relayer/server.js` verifies the proof against the address it is filed
  under, with a 5-minute freshness window and a refusal to accept a report for a tx the
  actor is not part of. **The shipped `VITE_RELAYER_TOKEN` no longer unlocks history.**
- **The columns are gone**, not just unread: `amount_atomic` and `counterparty` were dropped
  from `schema.sql`, `db.js` and the live Neon database, and the old `client_report` JSON
  was scrubbed. `relayer/test-db.mjs` asserts both facts and self-cleans.
- **MWA cannot sign history proofs, deliberately.** Only the identity or the in-app session
  wallet can. Do not "fix" that — it is what keeps a device wallet from becoming a second
  way to mint history under someone else's identity.

### 13.2 Receipts and history now survive a restart

`src/lib/localHistory.js`: XChaCha20-Poly1305 under `sha256(seed ‖ "vanta-history-v1")`,
500-row cap, and — the important bit — **a blob that will not decrypt is left untouched on
disk** and reads back as empty. (Losing rows is bad; silently overwriting the only copy of
someone's receipts is worse.) Verified on-device: restart restores the row. `App.jsx`
guards persistence behind `historyLoaded` so the empty initial state can never overwrite it.

⚠️ `@noble/ciphers` **v2 takes the nonce at the factory**: `xchacha20poly1305(key, nonce)`,
then `.encrypt(data)`. The v1 per-call form fails with `"nonce" expected Uint8Array`.

### 13.3 PDF receipts actually write now

`android/app/src/main/java/com/vanta/privacywallet/FileSaver.kt` + the `saveBase64File`
bridge in `MainActivity.kt`. The WebView **silently drops** a data-URL anchor download, so
the old toast was a lie. The bridge writes through MediaStore to `Downloads/Vanta/` on
API 29+ (legacy fallback otherwise, 20 MB cap, sanitised names) and returns a JSON result
that the toast now tells the truth about. Device-verified: 5147-byte `%PDF-`.

### 13.4 Backup/restore and two-slot custody

- `src/lib/backup.js` — scrypt (N=2¹⁴) → XChaCha20-Poly1305, one base64 line, carrying the
  identity, the session wallet, the note snapshot **and history**. Device-verified export +
  restore (reload rebuilds the same identity, private balance and history).
- `src/lib/walletStore.js` — **two slots** (`vanta-wallet-session`, `vanta-wallet-device`)
  plus a `vanta-wallet-active` pointer and a legacy migration. Connecting MWA used to
  silently overwrite `vanta-wallet` and strand the old balance (audit H6); switching now
  names the wallet it replaces **and reads its on-chain balance first**.

### 13.5 Small but user-visible

QR is generated **on-device** (`qrcode`) — the address is no longer sent to
`api.qrserver.com` and the sheet now works offline. Activity rows are real `<button>`s.
Send errors walk the **error cause** (the SDK throws `WALLET_BUILD_TRANSFER` *over*
`RECIPIENT_NOT_REGISTERED`, which is why the documented Ghost fallback never fired). Unknown
relayer paths return JSON, not Express HTML. The Settings footer now discloses *how* the
seed is stored, not just *where*.

### 13.6 ⚠️ The bug that only a real send could find

**Read this before touching `txHistory.js`.** `reportTx` declared its verdict as
`const proof` inside the same block whose request body reads the **outer** `proof` (the
signature). The inner declaration put that outer binding in its **temporal dead zone**, so
building the body threw `ReferenceError: cannot access 'proof' before initialization` on
**every single report** — the send landed, the report never did, and because the catch is
deliberately silent ("nothing here may ever fail a send") every receipt quietly sat at
"Not checked". Renamed to `proofKey`.

Why nothing caught it: the relayer harness tests the *server* and the server was correct;
the minifier just renamed the two bindings, so the bundle looked plausible; and the failure
is swallowed by design. **The `recordSend` path is only proven by a real send on a device.**

Two more things surfaced the same way: the report ceiling was **5 s**, but
`POST /tx/report` does an on-chain `getTransaction` to decide `verified_on_chain` and a
just-confirmed signature is often not indexed yet (measured 1366–1946 ms, cold) — raised to
**12 s** as `REPORT_TIMEOUT_MS`. And a client-side abort **does not cancel the server's
work**: the row still landed with `verified_on_chain: true`.

### 13.7 Verification state when the session ended

`oxlint` **0 errors**; `relayer/test-db.mjs` **32/32** green against live Neon;
`scripts/{history-store-check,backup-check}.mjs` green. **Device-verified on the final build:**
history survives a restart, QR is local/offline, PDF writes a real `%PDF-`, backup
export + restore, wallet slots, and **Ghost sends that reach the relayer as
`verified_on_chain: true, flow_source: client`**. Also confirmed directly: an
**identity-signed** `GET /tx/:id` returns rows while the **shared token alone returns 401**
(C1), and the stored rows contain **no `amount_atomic` and no `counterparty`** (C2).

**Not re-verified on this build:** Shadow to a *registered* recipient, public send, MWA
connect (no wallet app on the emulator), name resolution. The emulator's network was flaky
(~50% packet loss) all session.

### 13.8 Recommended next actions

1. Finish the send-path re-tests: Shadow (needs a registered handle) and public send.
2. **Add a test for `reportTx`** — it is the one path with real logic and no coverage, and
   its failure mode is silent. Stub `import.meta.env` and the fetch, and assert the body
   carries the signature proof.
3. Rotate the token + old keypair before anything goes public (§8).
4. First-run intro (still the biggest untouched P1), then packaging: deploy → README/LICENSE
   → video → deck.
