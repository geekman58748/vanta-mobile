# Vanta

**A Solana wallet that tells you what each payment leaks.**

Devnet privacy wallet for Android. You raise in public and spend in private: the pool
hides the link between funding and payout, and it hides who you pay. It does not hide
that you funded the pool, and every receipt the app renders says so in plain words.

Built for the Solana Mobile stack. Android APK, Mobile Wallet Adapter custody, live on
devnet, deployed end to end.

> **Submission artifacts**
> - 📱 **APK** — [Releases → latest](https://github.com/geekman58748/vanta-mobile/releases/latest)
>   (`vanta-1.0.0-ux12.apk`, signed, Android 9+)
> - 📊 **Pitch deck** — [`docs/pitch-deck.md`](docs/pitch-deck.md)
> - 🔍 **Security self-audit** — [`audits/`](audits/), with finding-by-finding status
> - 🛡️ **Reply to an external automated review** — [`audits/RESPONSE-2026-10-02.md`](audits/RESPONSE-2026-10-02.md), accepted-vs-disputed line by line
> - 🔐 **Relayer / fee-payer findings** — [`docs/pitch-deck-relayer-fee-payer-section.md`](docs/pitch-deck-relayer-fee-payer-section.md)

---

## What Vanta is

A working Android wallet with four payment modes. One of them is a plain transfer. The
other three move money through the Zolana shielded pool (`@heliuslabs/zolana`, Helius
Privacy Rings) so that the amount and the recipient of a payment are not derivable from
chain data.

The product claim, stated exactly:

> Donors see the campaign receive and shield. They cannot see where it pays out.

Everything below is either a fact about the code in this repository or a transaction we
have confirmed on devnet. Nothing here is a roadmap item dressed up as a feature.

## What Vanta is not

- Not anonymous. It never claims to be, and `src/lib/honesty.js` exists to stop it.
- Not mainnet. Devnet only, and the app says `DEVNET` on the dashboard.
- **Not third-party audited.** An adversarial self-audit was run and every finding is remediated
  or disclosed — see [`audits/`](audits/). The custody model is disclosed in
  [Known limitations](#known-limitations).
- Not a PWA. It is a React bundle inside the official **Solana Mobile webshell**, with a
  native Kotlin layer for the things a WebView cannot do. Details in
  [How it works](#how-it-works).

---

## Built for Seeker

Vanta is a Seeker app in the sense that matters: **the custody story closes on that
device.**

- **Signing never leaves the phone.** The full Mobile Wallet Adapter client
  (`src/lib/mwa.js`) does the `solana-wallet:` handoff and the v1 wire format, and the key
  is signed with inside your wallet app. Vanta never holds it. That path exists only on
  Android, which is why this is a phone app and not a website.
- **The shell is the documented way to keep MWA working.** Solana Mobile's own docs
  recommend the WebView shell over a Trusted Web Activity, because browsers' Local Network
  Access restrictions break wallet connections in Bubblewrap/TWA APKs while the shell
  handles wallet intents natively. Vanta pins
  `@solana-mobile/wallet-standard-mobile@0.6.0`, above the `0.5.1` that doc requires.
- **On a Seeker the signing key is already in hardware, and we wrote no Seed Vault code to
  get that.** Connect **Seed Vault Wallet** over the Mobile Wallet Adapter and the key lives
  in the Seed Vault and is used there — Vanta never receives it. This is the correct shape,
  not a shortcut: `com.solanamobile:seedvault-wallet-sdk` is a **wallet-provider** API, and
  a dApp is meant to reach it through MWA rather than call it directly. Hardware custody on
  a Seeker is therefore shipped today, with zero Seed Vault code in this repository.
- **The `localStorage` key is the fallback wallet, not the MWA path.** The plaintext key in
  [Known limitations](#known-limitations) belongs to the *throwaway in-app wallet* you can
  generate when no wallet app is installed. On the MWA path there is no key of yours inside
  Vanta at all. Removing the fallback — rather than adding Seed Vault code — is the roadmap
  item.
- **Distribution is the Seeker dApp Store**, the Seeker-native channel, and the reason
  winning teams are required to publish there.

Scope, stated plainly because the rest of this file does not overclaim either: **the Mobile
Wallet Adapter path is real today, and it is what carries Seed Vault custody on a Seeker.**
There is deliberately **no Seed Vault code in this repository** — calling that SDK from a
dApp would be the wrong shape. **Seeker Genesis Token gating and SKR are not implemented**;
there is no code for either.

> One ecosystem detail that *is* shipped: `seeker`, `helius`, `solana`, `phantom` and
> `solflare` are on the relayer's reserved `.vanta` handle list (`relayer/db.js`), so
> nobody can register an impersonating handle.

---

## The receipt

This is the part we have not seen anywhere else, and it is why the rest of the claims
here are believable.

Every send renders a per-transaction receipt that states, leg by leg, what was hidden
and what was exposed. The copy is not written per screen; it lives in one table
(`src/lib/honesty.js`) that both the "what leaks" sheet and every receipt read from, so
a receipt cannot claim something the disclosure sheet contradicts.

| Mode | Verdict | Amount | Recipient | Initiator | Link to where it lands |
|---|---|---|---|---|---|
| **Shield** | Public by design | public | n/a, it is you | your wallet, on chain | not revealed |
| **Shadow** | Confidential, not anonymous | hidden | hidden | visible (fee payer) | severed |
| **Ghost** | Link severed, amount public | public | public | visible (fee payer) | severed |
| **Public** | Fully public | public | public | public | visible |

Receipts export to a real PDF through a native `MediaStore` bridge
(`android/.../FileSaver.kt`) into `Downloads/Vanta/`. The web layer cannot do this: a
WebView silently drops a data-URL download, which is why that code is native.

---

## The four modes

**Shield** moves SOL or dUSDC from your public balance into your private balance.
It is a deposit into the pool, and it is fully public: your wallet and the amount are on
chain. The app says this on the Shield screen before you confirm.

**Shadow** sends from your private balance to another Vanta user. The recipient must be
registered, either as a wallet address or as a `.vanta` handle. The amount and the
recipient do not appear on chain.

**Ghost** sends from your private balance to any Solana address, with no registration
required. The link between you and the recipient is severed, but the payout, meaning the
amount and the recipient, is public by definition.

**Public** is a plain SOL transfer, included so the contrast is visible in one app.

---

## What Vanta does not hide

Stated here, on the receipt, and in the pitch. These are the residuals, and they are the
reason the claims above can be specific.

1. **The Shield deposit is public.** It ties your wallet to a pool inflow. Spreading
   deposits over time is what blurs that link, and the crowd is what makes it strong.
2. **The spend identity is reused.** On every Shadow and Ghost send, the spend identity is
   `account[0]` and pays the fee. It is visible, and anyone you have paid can count and
   time your sends. This is an SDK invariant: the fee payer is also the shielded owner, so
   the relayer cannot pay for a spend.
3. **A small pool makes amount and timing correlatable.** Pool depth is the fix, and
   fabricating that depth with bots would be lying to users. We do not.
4. **A single fresh-wallet hop is not privacy.** Sending main wallet, then burner, then
   pool is one unbroken public graph.
5. **Custody is a shared program vault** with a live upgrade authority. Your private
   balance is an encrypted bearer claim. Lose the seed and you lose the funds.
6. **On the Mobile Wallet Adapter path, your device wallet is the public depositor.**
   Your real address is on chain, linked to your shielding.

---

## Try it

The release APK is 4.4 MB and signed. **Download: [Releases → latest](https://github.com/geekman58748/vanta-mobile/releases/latest)** — asset `vanta-1.0.0-ux12.apk`.

Package `com.vanta.privacywallet`. Android 9 (API 28) and newer.

> Release binaries are deliberately **not** committed to this repository: `.gitignore`
> excludes `*.apk`, because a 4.4 MB binary in git history is permanent and the APK
> rebuilds from source in one command. If the Releases page has no asset, build it
> yourself ([Build from source](#build-from-source)) — the signed artifact lands in
> `deploy/releases/`.

Endpoints it talks to, both live and both public:

| Service | URL | What it does |
|---|---|---|
| Relayer | `https://p01--vanta-mobile--9ymc8tqmdxvj.code.run` | Sponsor fees, keep history, serve `.vanta` handles |
| Faucet | `https://p01--vanta-faucet--9ymc8tqmdxvj.code.run` | Send a new wallet 0.2 SOL so it can Shield |

The APK needs no host. It bundles its own web assets and boots offline, and both backend
URLs are compiled in, so it works unplugged.

**An empty wallet can try the whole flow.** The devnet faucet button in Settings, and the
one on the Shield screen, calls our own faucet service: 0.2 SOL per address, once per
address. That is enough to Shield 0.05 or 0.1 SOL and pay the fee.

### Installing the APK on a phone

```bash
# USB debugging on, phone unlocked, then:
APK=vanta-1.0.0-ux12.apk      # from Releases, or your own build in deploy/releases/
adb install "$APK"
```

On Xiaomi / Redmi / POCO (HyperOS or MIUI), `adb install` is refused with
`INSTALL_FAILED_USER_RESTRICTED`. Two things that work: enable **Developer options >
Install via USB**, or push the file and tap it in Files:

```bash
APK=vanta-1.0.0-ux12.apk      # from Releases, or your own build in deploy/releases/
adb push "$APK" /sdcard/Download/
# then open Files > Downloads and tap the APK
```

`scripts/device-test.sh` automates the USB path: it finds the phone, wires the tunnels,
installs, and launches.

---

## How it works

```
Phone (Android)
  MainActivity.kt          webshell host, WebViewAssetLoader serves the bundle offline
  WebShellChrome/ViewClient  console relay, media, file chooser
  FileSaver.kt             MediaStore bridge for PDF receipts, open + share
  BiometricGate.kt         fingerprint / device-credential prompt before a spend
  Notifications.kt         system notifications for deposits that land off-screen
  Haptics.kt               the platform haptic engine, not a WebView motor buzz
        |
        |  React 19 + Vite bundle (built here, bundled into the APK)
        |  Mobile Wallet Adapter over @solana-mobile/wallet-standard-mobile
        v
Device wallet (Seed Vault / Phantom / Solflare)
        |   your custody. Vanta never stores this key.
        v
Zolana shielded pool  sppU489D7A4U1exNo1oeMGZtLEofq3a6o2fR7UeoWB6
  registry            regyS5rkAcw2YzDJCmTwCTHs2s246FXxbmuRZ42u2PD
        ^
        |   deposits and spends
Vanta relayer (Node + Express, Neon Postgres)
  sponsors network fees, refuses to co-sign anything that does not touch an
  allowlisted program, and stores no amount and no counterparty
```

**What we build on, and what we add.** The shielded pool, the ZK circuits, the
prover and the indexer are **Helius Zolana** (Privacy Rings) — we did not write
the cryptography, and we don't claim to. What Vanta adds is the client: a mobile
wallet where privacy is a mode rather than a setting, custody that stays in the
Mobile Wallet Adapter, and a receipt that names what each send still leaks. The
default-ring spend identity is visible as the fee payer; that is the SDK's
invariant, and the receipts say so.

Four design decisions worth calling out:

- **Every OS-level surface is native, not simulated.** The biometric prompt
  (`BiometricGate.kt`), the receipt file and system share sheet (`FileSaver.kt`), system
  notifications (`Notifications.kt`), haptics (`Haptics.kt`) and `FLAG_SECURE` all run in
  Kotlin, because a WebView cannot reach any of them. The HTML is for layout velocity only.

- **The relayer is not in the trust path for spends.** On the Mobile Wallet Adapter path
  your device wallet is both the depositor and the fee payer. The relayer only ever got
  involved for a Shield fee and a small gas float for the in-app identity.
- **History reads and writes are identity-signed.** The relayer verifies an Ed25519 proof
  over a domain-separated message before it files a row under your address, with a five
  minute freshness window. The shared token that ships in the APK does not unlock the
  payment graph.
- **The relayer stores no amount and no counterparty.** Those columns were dropped from
  the schema. A server that cannot see payments cannot leak them.

**The spend identity stays on the device.** The ZK prover is JavaScript, so the shielded
spending identity lives in the app, not on the server. It is stored encrypted, as is your
transaction history (`XChaCha20-Poly1305`, key derived from your seed). Backup and restore
use `scrypt` then `XChaCha20-Poly1305` and produce a single portable line.

There are **two different secrets at rest**, and only one of them is encrypted. Stated
separately because the difference matters:

| At rest | Where | Protection |
|---|---|---|
| Shielded spend identity, transaction history, backups | app storage | `XChaCha20-Poly1305`, key derived from your seed |
| **The wallet's own Ed25519 `secretKey`** | `vanta-wallet` in WebView `localStorage` | **none — plaintext JSON** |

The second row is the same trust model as any browser wallet that keeps a key in
`localStorage`, and on this devnet build the key is not encrypted. It is called out in
[Known limitations](#known-limitations) alongside `android:allowBackup`, which is what
makes it recoverable from a device.

---

## Engineering notes: eight bugs a device found

Every item below is a bug that a desktop browser cannot reproduce, that no unit test
caught, and whose fix is a handful of lines. The useful part is the diagnosis, so each
one is written up as symptom, cause, fix. A privacy wallet's hard problems are not on
the screen; they are in the places where the platform quietly disagrees with you.

### 1. Zolana compiles v1 transactions, and v1 puts the signatures last

**File:** `src/lib/mwa.js`, `serializeCompiledTx`.

**Symptom:** every Shield from the device wallet hung. No crash in the app, no error
in the UI. A spinner that never resolved.

**Cause:** Zolana's builders emit a **v1** transaction. The version byte is `0x81`, the
signature count sits at index 1, and the signatures **trail** the message. Wallet
parsers dispatch on byte 0, so a payload written in the legacy
`[sigCount][sigs][message]` order sends `0x01` first, the wallet takes its legacy
branch, reads `0x81` as a compact-u16 length, computes an absurd offset and dies:

```
java.lang.ArrayIndexOutOfBoundsException: length=361; index=8258
  at SolanaSigningUseCase.getSignersForTransaction(…:97)
  // 8258 = 2 + 64*129, and 129 is the compact-u16 read of [0x81, 0x01]
```

That throw happens inside the wallet process, so the app never sees it. It looks like a
session or approval problem, and was misdiagnosed as one for a long time. Sending
`[message][sigs]` fixes it. `scripts/mwa-wire-check.mjs` reproduces both encodings and
runs the wallet's own bounds checks against them, so this can be re-tested without a
phone.

### 2. Never trust a position to find a signature

**File:** `src/lib/mwa.js`, `verifiedSignatureFromSignedTx`.

**Symptom:** the relayer rejected deposits with `Transaction did not pass signature
verification`, naming no one.

**Cause:** the signature the wallet returned was located by **arithmetic**: read the
count from byte 1, take `count * 64` bytes off the tail, index into that block. That is
the exact inverse of what a well-behaved wallet writes and nothing else. A wallet that
fills the slot of its choosing, re-serialises in legacy order, or hands the payload back
unsigned yields 64 bytes of not-a-signature. It is still 64 bytes, so it passed the
client's own check and the relayer's `length !== 64` check, and failed only at the RPC,
which does not say which signer it rejected.

**Fix:** decode the returned bytes with kit's own codec, which dispatches on the envelope
it is actually given, then keep only the signature that **verifies** against this account
over this message under `ed25519.verify`. Everything else is refused before the deposit
is submitted. This path is deliberately off the app's route today (a device-wallet Shield
has the wallet pay its own fee and broadcast, so there is a single signer) and is kept
because it is the correct way to do the relayer-funded variant, and because the harness
alongside it is what proves a wallet's reply is usable before anyone trusts one again.
Solflare's reply was not.

### 3. `maxSupportedTransactionVersion: 1` is not optional

**File:** `relayer/server.js`, `lookupSignature`; `src/lib/pendingShield.js`.

**Symptom:** none. That is the problem. Every Zolana transaction read as unverified
forever, and nothing failed loudly.

**Cause:** the usual value is `0`. Against a v1 transaction the RPC refuses to decode it
at all:

```
Transaction version (1) is not supported by the requesting client.
```

That error is indistinguishable from "signature not found", so `lookupSignature`
returned `null`, and the caller is written to treat `null` as **unverified, never as
valid**. The receipts were simply wrong, in the safe direction, permanently. This is the
RPC-client twin of item 1: same v1 wire format, different process, different silent
failure. The `curl` example under [Verify the claims yourself](#verify-the-claims-yourself)
carries the same flag for the same reason.

### 4. Older Android WebViews have no Ed25519 in WebCrypto

**File:** `src/polyfills.js`, imported as the first line of `src/main.jsx`.

**Symptom:** the app died at launch with `Privacy init failed: … Algorithm: Unrecognized
name` on a real device.

**Cause:** Ed25519 landed in Chrome's WebCrypto only in 2025, and Android WebViews older
than roughly 137 reject `importKey('raw', …, 'Ed25519', …)` with
`NotSupportedError`. `@solana/kit` builds its browser signers on WebCrypto Ed25519, so
with no shim no Shield, Shadow or Ghost can be constructed on that device.

**Fix:** probe first, then install `@solana/webcrypto-ed25519-polyfill` only if the probe
throws. The probe matters: a WebView that already implements Ed25519 keeps its native
implementation, whose keys are non-exportable and structured-cloneable into IndexedDB.
`polyfills.js` uses a top-level `await`, which makes module evaluation of `App.jsx` and
its dependencies wait for the probe, so nothing can touch a signer before the shim has
settled. **The import order in `main.jsx` is load-bearing.**

### 5. History is identity-signed, because the shipped token is not authentication

**Files:** `src/lib/identityProof.js`, `src/lib/txHistory.js`, `relayer/server.js`.

**Cause:** the app is a PWA inside a WebView, and its relayer token is compiled into the
bundle. Anybody who unzips the APK can read it. The first version of history reporting
used that token as the only thing standing between a request and a database write, and
sent the amount and the recipient along with it, so the server held exactly the payment
graph the pool had hidden (AUDIT-2026-09-27 C1/C2). This is the one item on this list
that is a design defect rather than a platform defect.

**Fix, in three parts.** Reports and reads are signed by the address they concern: the
server verifies an Ed25519 proof over a domain-separated message (`vanta-report:…`,
`vanta-history:…`) before it files anything, with a five minute freshness window
(`PROOF_MAX_AGE_MS`), so a report cannot be filed under someone else's identity. The
shared token is demoted to abuse deterrence and the README says so out loud. And
`amount_atomic` and `counterparty` were **dropped from the schema**, so the server is no
longer capable of leaking them rather than merely instructed not to.

### 6. A shadowed binding meant every receipt said "Not checked"

**File:** `src/lib/txHistory.js`, `reportTx`.

**Symptom:** every receipt sat at "Not checked" forever, on every send, on every device.

**Cause:** a `const proof` in the inner scope shadowed the `proof` the request body
reads, putting the inner binding in its temporal dead zone at exactly the moment the
body was built:

```
ReferenceError: cannot access 'proof' before initialization
```

The call sat inside a deliberately silent `catch`, because this whole path runs **after**
the transfer is already confirmed and must never be able to fail a send. Correct policy,
which is precisely why the bug was invisible: nothing anywhere printed. The binding is
now `proofKey`.

**Same file, same bug hunt:** the report timeout was raised from 5s to 12s
(`REPORT_TIMEOUT_MS`). `POST /tx/report` is not a database write, it does a
`getTransaction` against the RPC to decide `verified_on_chain`, and a signature confirmed
seconds ago is often not indexed yet. Measured: 1946 ms cold for a signed read, 1366 ms
warm for a report. At 5s the client was aborting real reports mid-flight on a slow
network and the row stayed unchecked forever.

### 7. A WebView silently drops a data-URL download

**File:** `android/app/src/main/java/com/vanta/privacywallet/FileSaver.kt`, plus the
`saveBase64File` bridge in `MainActivity.kt`.

**Symptom:** the receipt sheet toasted "Saved" and no file existed anywhere on the
device (AUDIT-2026-09-27 H2).

**Cause:** the web layer handed a `data:` URL to the WebView and relied on a
`DownloadListener` that was never installed in this shell. The navigation went nowhere.
This is a class of bug the web platform will not tell you about: the navigation is
accepted, and nothing reports that it was dropped.

**Fix:** export through native code. `FileSaver` writes via `MediaStore` on API 29+
(scoped storage, no permission needed, visible in the Files app) to
`Downloads/Vanta/`, and **returns a result**, so the UI can only claim what actually
happened. The base64 bridge is reachable from any script in the WebView, so it is capped
at 20 MB, because an unbounded payload is otherwise a free way to fill a user's storage.

### 8. A flex child with `min-height: auto` collapsed the drawer

**File:** `src/components/Drawer.jsx`.

**Symptom:** on a short phone, the filter rail and the activity list were squashed to
nothing under the pool totals instead of the sheet scrolling.

**Cause:** the sheet was one `max-h-[92vh] overflow-y-auto` flex column holding
everything, handle and title included. A child of a flex column with `overflow-*` has a
`min-height` of 0, so the two blocks that already scrolled on their own traded their
height away first. The sheet looked like it scrolled and did the opposite.

**Fix:** handle and title are pinned and `shrink-0` outside the scroller, the body is the
single scroll container, and every direct child is pinned to its natural height with
`[&>*]:shrink-0`. A sheet can be too tall; it just cannot compress its contents. The app
hides `::-webkit-scrollbar` globally, which is why there is also a "Scroll for more" pill:
without it, a sheet whose content ran past the fold read as a sheet that had ended.

---

## Build from source

### Prerequisites

| Requirement | Version | Why |
|---|---|---|
| Node.js | **24 or newer** | The Zolana SDK declares `engines: node >=24` |
| pnpm | 11 or newer | `pnpm-lock.yaml` is the lockfile. Do not use `npm install` |
| JDK | 17 or newer | Only for the Android build. Android Studio's bundled JBR is 25 and works |
| Android SDK | API 36 platform, matching build-tools | Only for the Android build. AGP 9.0, `compileSdk` and `targetSdk` are both 36 |

### 1. Install and configure

```bash
git clone https://github.com/geekman58748/vanta-mobile.git
cd vanta-mobile
pnpm install
cp .env.example .env.local
```

The app builds with an empty `.env.local`. To get a fully working local app, fill in:

```bash
VITE_HELIUS_API_KEY=      # free at dashboard.helius.dev; blank falls back to the
                          # public devnet RPC, which is slower and rate limited
VITE_RELAYER_URL=http://localhost:3001
VITE_RELAYER_TOKEN=       # must match the relayer's RELAYER_TOKEN
VITE_FAUCET_URL=http://localhost:3003
```

`VITE_*` values are compiled into the client bundle. They are kept out of git, not out of
the shipped app.

### 2. Run the web app

```bash
pnpm dev            # http://localhost:5173
pnpm lint           # oxlint
```

### 3. Run the backends locally (optional)

```bash
pnpm relayer        # :3001, needs DATABASE_URL for history and .vanta handles
pnpm faucet         # :3003, needs a funded faucet/faucet-keypair.json
```

### 4. Build the Android APK

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

pnpm build:android          # vite build, then stages dist/ into the Android assets
cd android
./gradlew assembleDebug     # -> app/build/outputs/apk/debug/app-debug.apk
```

`android/app/src/main/assets/www/` is generated. Do not edit it by hand; it is
overwritten by `pnpm build:android`.

For a signed release build, pass your own keystore in:

```bash
./gradlew assembleRelease \
  -PWEB_SHELL_SIGNING_STORE_FILE=/path/to/your.jks \
  -PWEB_SHELL_SIGNING_STORE_PASSWORD="$KS_PW" \
  -PWEB_SHELL_SIGNING_KEY_ALIAS=youralias \
  -PWEB_SHELL_SIGNING_KEY_PASSWORD="$KS_PW"
```

The debug APK is about 34 MB and the release APK about 4.4 MB. The difference is Java
bytecode: 29 MB of unminified, multidexed classes against 1.4 MB after R8. The web assets
are identical in both.

---

## Verify the claims yourself

Do not take the table above on faith. Every row is checkable.

```bash
RPC=https://api.devnet.solana.com
SIG=21sFAdV2GMBzfDpEehcZ9mfHxCsQdWqgQMyT2Fccjtn9nERrRBpAfjwwy1MtFcru15woFi9moerqDNBb2NmZcuEA
curl -s "$RPC" -H 'Content-Type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getTransaction\",\"params\":[\"$SIG\",{\"encoding\":\"json\",\"maxSupportedTransactionVersion\":1}]}"
```

Note the `maxSupportedTransactionVersion: 1`. Zolana compiles every builder to a v1
transaction, and a client that does not ask for v1 cannot decode them at all.

Four transactions from a single device session, all confirmed on devnet:

| What it proves | Signature | Slot |
|---|---|---|
| Relayer funded the spend identity | `5HcLNQrecNBMrF7fX3EdQ4P8zcW6qsQpLNwWfN7U2cRfaNx9h69y5TRPjXi3x37quX5JC9dj5ndTuHcbpe3AmJUR` | 504239706 |
| Shield 1 of 3 | `21sFAdV2GMBzfDpEehcZ9mfHxCsQdWqgQMyT2Fccjtn9nERrRBpAfjwwy1MtFcru15woFi9moerqDNBb2NmZcuEA` | 504241480 |
| Shield 2 of 3 | `5HgkVeT8FaAgecmuLtPZCsuoBsV42zzrCXNop6BQcXtTPqDQhdwMsggyErRDwnFEmE9WuuXmbSUmxEASHGq8A9nT` | 504241659 |
| Shield 3 of 3 | `3Z2zK7658GRuJLKxjFQaKxGqekvGakmV6HTpdyG3RgRMJofLMgFptDyuRUTDHJxmaTAm9CXP6uFeNoYkxRD3pR6A` | 504241947 |

Each Shield is 5,000 lamports of fee and 5 accounts. Open one on
[explorer.solana.com](https://explorer.solana.com/?cluster=devnet) and you will see the
depositor and the pool, and no spend identity.

Scripts in `scripts/` that produce the harder evidence:

| Script | What it does |
|---|---|
| `e2e-zolana.mjs` | Full shield, shadow, ghost cycle against devnet with fresh identities |
| `linkability-report.mjs` | What a Shadow transaction exposes to an observer |
| `forensic-x.mjs` | Traces the spend identity across sends, which is how residual 2 was found |
| `test2-anonymity.mjs` | The controlled two-identity A/B of a Shadow send, both keys held |
| `pdf-receipt-check.mjs` | Renders a receipt PDF and probes the pixels |
| `backup-check.mjs`, `history-store-check.mjs` | Encrypted backup round trip and history at rest |
| `mwa-v1-e2e.sh` | Mobile Wallet Adapter end to end on a device, including v1 signing |

---

## Known limitations

**Devnet only.** No mainnet path, no real money. The custody model below is why.

**Custody is a shared program vault with a live upgrade authority.** Deposits leave your
wallet into a pool vault and your private balance is an encrypted bearer claim. Whoever
holds the upgrade authority can change the program.

**Pool depth is thin.** With a small anonymity set, amount and timing correlation is
trivial. This is the single biggest limit on the privacy claim, and it is a function of
usage, not code.

**Mobile Wallet Adapter support for v1 transactions varies by wallet.** v1 shipped with
Agave 4.2. The stock `fakewallet` releases are legacy-only and cannot sign a Zolana
payload, so a v1-capable wallet must be built from source for testing. The app detects the
failure and names it instead of hanging.

Solana Mobile's documented emulator target is the **Mock MWA Wallet**, which supports
`authorize`, `signIn`, `signAndSendTransactions` and `signMessage`, does bottom-sheet
approval with biometrics, and **simulates Seed Vault Wallet behaviour** — so the MWA path
can be exercised without a Seeker. Two things to know before relying on it: it **requires a
secure lock screen** (PIN, pattern or biometric; it keeps key material behind device
authentication and fails without one), and **its v1 support has not been checked here**.
That check is the first thing to do before treating it as a Zolana test target.

**The Helius API key ships inside the APK.** This is deliberate, and it is a devnet key.
`VITE_HELIUS_API_KEY` is compiled into the bundle so that anyone who installs the release
APK can run it against devnet without signing up for anything. The endpoint it feeds is
`https://devnet.helius-rpc.com`, never mainnet, and devnet SOL has no value — so the key
buys an attacker nothing but a read quota, and it is revocable if that quota is ever
abused. It is not shared with any backend: the relayer runs its own RPC
(`SOLANA_RPC_URL`, defaulting to the public devnet endpoint), so server traffic cannot
burn it, and leaving the variable blank is also valid — the app falls back to the public
devnet RPC. Treat the key as public and rate limited, and bring your own for anything
beyond trying the app. The same applies to `VITE_RELAYER_TOKEN`, which is abuse
deterrence, not authentication: history reads and writes are identity-signed precisely
because that token is readable in the bundle.

**The wallet key is plaintext in `localStorage`, and `allowBackup` is on.** The
`vanta-wallet` entry holds the wallet's Ed25519 `secretKey` as unencrypted JSON in WebView
`localStorage` (see [How it works](#how-it-works)). The manifest also sets
`android:allowBackup="true"`, so `adb backup` can copy the WebView data directory off a
device with USB debugging enabled and recover that key from it. On devnet this protects
nothing worth taking. Before this holds real funds the fixes are **not** to add Seed Vault
code — the MWA path already routes to hardware on a Seeker — but to stop generating a
fallback wallet whose key has to live somewhere untrusted, and to set
`allowBackup="false"`.

**This is not audited and should not hold real funds.**

---

## Repository layout

```
src/                  React app
  App.jsx             the wallet: balance, flows, persistence
  components/         drawers and sheets, one per surface
  lib/
    honesty.js        the single source of truth for what leaks. Start here.
    mwa.js            Mobile Wallet Adapter: association, v1 serialization, timeouts
    wallets.js        hand-rolled wallet-standard registry
    tokens.js         SOL and dUSDC, shared constants
    backup.js         scrypt + XChaCha20-Poly1305 export and restore
    localHistory.js   encrypted transaction history at rest
    receiptPdf.js     PDF receipts
    txHistory.js      identity-signed history reporting
relayer/              Node relayer service, its own Dockerfile
faucet/               devnet faucet service, its own Dockerfile and wallet
android/              Solana Mobile webshell host, Kotlin
landing/              the marketing site
vendor/               vendored @heliuslabs/zolana tarball. See vendor/README.md
scripts/              verification harnesses, listed above
licenses/             GPL-3.0 and LGPL-3.0 texts, required by a bundled dependency
NOTICE                attribution for everything third-party. Read this if you fork.
docs/                 architecture, evidence, integration notes
audits/               the 2026-09-27 adversarial self-audit and its status. Start there.
```

Start with `src/lib/honesty.js` and `docs/vanta-privacy-architecture.md`. Between them
they explain what the product claims and why it is allowed to claim it.

---

## Credits

Built on **Helius Zolana** Privacy Rings, and on the **Solana Mobile** webshell and Mobile
Wallet Adapter. The Zolana SDK is vendored in `vendor/` under Apache-2.0, with its license
and third-party notices alongside it, because the registry's published `0.2.0-alpha` is
broken against devnet and the working version lives on a source tag. `vendor/README.md`
records the exact provenance and how to regenerate it.

---

## License

Vanta's own code is **Apache-2.0**. See `LICENSE`.

`NOTICE` carries the attribution for everything third-party, and it is worth one line
here because one entry is not boilerplate. Vanta's RPC traffic is plain HTTPS and never
opens a websocket, but `@solana/web3.js` imports `rpc-websockets` at module scope, so that
library is compiled into the release APK and it is **LGPL-3.0-only**, not permissive.
This was measured, not assumed:

```bash
grep -rl max_reconnects_reached dist/assets/*.js
# dist/assets/index.browser.esm-CqbKqh0d.js
```

That chunk ships inside the APK, and the library is unmodified. `NOTICE` section 2 records
the prominent notice and how the relink and source requirements are met, and
`licenses/` holds the GPL-3.0 and LGPL-3.0 texts that have to travel with it. Aliasing the
dependency away in `vite.config.js` would retire the obligation, and that change is
recorded there as a known cleanup rather than quietly skipped: it cannot be verified on
a device from this repository's current state.

The Android shell in `android/` was generated from the Solana Mobile webshell CLI
template. That upstream template declares **no license at all**, so this repository does
not claim it is Apache-2.0. `android/NOTICE` states the provenance, and what Vanta
changed.
