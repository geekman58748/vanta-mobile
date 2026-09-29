# Vanta

**A Solana wallet that tells you what each payment leaks.**

Devnet privacy wallet for Android. You raise in public and spend in private: the pool
hides the link between funding and payout, and it hides who you pay. It does not hide
that you funded the pool, and every receipt the app renders says so in plain words.

Built for the Solana Mobile stack. Android APK, Mobile Wallet Adapter custody, live on
devnet, deployed end to end.

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
- Not audited. The custody model is disclosed in [Known limitations](#known-limitations).
- Not a PWA. It is a React bundle inside the official **Solana Mobile webshell**, with a
  native Kotlin layer for the things a WebView cannot do. Details in
  [How it works](#how-it-works).

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

The release APK is 4.4 MB and signed:

```
deploy/releases/vanta-1.0.0-ux10.apk
```

Package `com.vanta.privacywallet`. Android 9 (API 28) and newer.

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
adb install deploy/releases/vanta-1.0.0-ux10.apk
```

On Xiaomi / Redmi / POCO (HyperOS or MIUI), `adb install` is refused with
`INSTALL_FAILED_USER_RESTRICTED`. Two things that work: enable **Developer options >
Install via USB**, or push the file and tap it in Files:

```bash
adb push deploy/releases/vanta-1.0.0-ux10.apk /sdcard/Download/
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
  FileSaver.kt             MediaStore bridge for PDF receipts
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

Three design decisions worth calling out:

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
| `test2-anonymity.mjs` | The controlled two-identity A/B in the table in `PLAN.md` |
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

**The Helius API key ships inside the APK.** This is deliberate. `VITE_HELIUS_API_KEY` is
compiled into the bundle so that anyone who installs the release APK can run it against
devnet without signing up for anything. Treat that key as public and rate limited, and
bring your own key for anything beyond trying the app. The same applies to
`VITE_RELAYER_TOKEN`, which is abuse deterrence, not authentication: history reads and
writes are identity-signed precisely because that token is readable in the bundle.

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
docs/                 architecture, audit, evidence, integration notes
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
