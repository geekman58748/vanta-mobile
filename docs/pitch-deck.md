# Vanta — pitch deck (CLOCK IN)

> **Why this file exists.** `docs/pmf-narrative.md` holds the argument, `docs/vanta-privacy-architecture.md`
> holds the mechanics and `docs/pitch-deck-native-android-slide.md` holds the one slide that answers the
> "WebView wrapper" objection. Nothing assembled them into a deck. This is that assembly — twelve slides,
> paste-ready into Slides/Canva/Figma, in the order they should be presented.
>
> **Claims discipline.** Every number and hash below is either code in this repository or a transaction
> confirmed on devnet. Nothing here is a roadmap item presented as shipped; §11 labels direction as
> direction. Language rules from `pmf-narrative.md` §6 are enforced: "confidential", never "anonymous";
> never "untraceable"; never "no server".

---

## Deck at a glance

| # | Slide | Job it does | Time |
|---|---|---|---|
| 1 | Title | Say what it is in one line | 10s |
| 2 | The problem | Make the pain land | 25s |
| 3 | Why now | Justify the moment | 20s |
| 4 | The product | Four modes, one table | 30s |
| 5 | The receipt | The differentiator | 40s |
| 6 | Live proof | Remove all doubt | 40s |
| 7 | Not a wrapper | Kill the PWA objection | 45s |
| 8 | How it works | Credibility | 30s |
| 9 | Who it's for / why they return | PMF + stickiness | 35s |
| 10 | What we don't hide | Trust through disclosure | 30s |
| 11 | Roadmap | Honest direction | 20s |
| 12 | Close | The ask | 15s |

**Total: ~5:40.** For a 3-minute slot cut slides 8 and 11 and compress 7 to 25 seconds.

---

## Slide 1 — Title

> # Vanta
> ### Raise publicly. Spend privately.
>
> A Solana wallet that tells you what each payment leaks.
>
> Devnet privacy wallet for Android · Mobile Wallet Adapter custody · Solana Mobile

**Speaker note:** "Vanta is a wallet for the specific moment when money coming *in* should be public and money going *out* should not be."

---

## Slide 2 — The problem

> ## Raising money in public means *staying* public
>
> Every donor, every amount, every payout in a fundraiser is permanently visible — to
> competitors, to harassers, to anyone with a block explorer.
>
> People either accept permanent exposure, or they don't crowdfund at all.

**Speaker note:** "Publish a campaign address and you have published your payroll. The donors deserve to see the pool fill. The recipients didn't sign up to be searchable."

---

## Slide 3 — Why now

> ## The privacy rails shipped. Nobody built the client.
>
> Helius **Privacy Rings** (Zolana) went into private beta **August 2026**.
>
> It is infrastructure for shielded transfers with a real SDK — and it has **no consumer
> client on a phone.**
>
> Vanta is that client, running on-device through the Mobile Wallet Adapter.

**Speaker note:** "This is a timing slide. The technology landed five weeks ago. There is a wallet-shaped hole on top of it, and that hole is on Solana Mobile hardware."

---

## Slide 4 — The product

> ## Four payment modes. One of them is boring on purpose.
>
> | Mode | What it does | Amount | Recipient |
> |---|---|---|---|
> | **Shield** | Public balance → private balance | public | it's you |
> | **Shadow** | Private → another Vanta user | **hidden** | **hidden** |
> | **Ghost** | Private → any Solana address | public | public, link severed |
> | **Public** | An ordinary SOL transfer | public | public |
>
> No new chain, no new token, no wrapping. Same devnet SOL and dUSDC you already hold.

**Speaker note:** "Public mode exists so the contrast is visible inside one app. Every mode is a different honest answer to 'what does this leak?'"

---

## Slide 5 — The receipt (the actual differentiator)

> ## Every send ships a receipt that names what leaked
>
> The copy is not written per screen. It lives in **one table** (`src/lib/honesty.js`) that
> both the "what leaks" sheet and every receipt read from — so a receipt **cannot** claim
> something the disclosure sheet contradicts.
>
> ```
> SHIELDED  ✓ amount hidden   ✓ recipient hidden
>           ⚠ fee-payer visible (3Lew…Vx1u)   hash 24QLsSqc…
> ```
>
> Receipts export to a real PDF through a native **MediaStore** bridge into `Downloads/Vanta/`.

**Speaker note:** "Privacy products overclaim, and overclaiming is how they lose trust. Our receipts are the product saying the quiet part out loud. You get a paper trail that states exactly which byte leaked — no other wallet produces that."

---

## Slide 6 — Live proof

> ## This happened on devnet. Here is the hash.
>
> **Shield: 10 dUSDC public → private, confirmed from inside the app**
>
> | Field | Value |
> |---|---|
> | Signature | `24QLsSqcnvtaNKpAoHyg4H47QbtPFndRSigG1BvSXbGVEtUZjDLPFF45DATsn49T5t1Td8CL6GumP1J1aT4cxbRe` |
> | Slot | `505745892` · `err: None` · fee `10,000` lamports |
> | Program | `sppU489D7A4U1exNo1oeMGZtLEofq3a6o2fR7UeoWB6` — the only program invoked |
> | Your public ATA | **50 → 40 dUSDC** |
> | Pool vault | **49 → 59 dUSDC** |
> | Fee payer | relayer `FhV7cyfV…` · depositor `3Lew…Vx1u` signed |
>
> After the send the app itself reads: `public 40.00 dUSDC` / `10.00 private`.
>
> Both backends are live and public: relayer `p01--vanta-mobile--9ymc8tqmdxvj.code.run`,
> faucet `p01--vanta-faucet--9ymc8tqmdxvj.code.run`.

**Speaker note:** "Not a mockup — open the explorer. One program, one deposit, the vault went up exactly ten, the public balance went down exactly ten, and the app's own private balance reads ten. Wallets and fees are gasless for the user because the relayer sponsors them."

---

## Slide 7 — "It's a WebView, isn't it?"

> ## The UI is HTML for velocity. Everything the OS has to say yes to is Kotlin.
>
> **1,333 lines of hand-written Kotlin across 7 files** — none generated by the web build,
> none reachable from a browser.
>
> | Capability | Why the web layer cannot do it |
> |---|---|
> | **PDF receipts leave the app** — `MediaStore`, `IS_PENDING` until bytes are whole, then the system share sheet | No web API takes a file *out* of a WebView; the naive version silently saved nothing |
> | **The phone asks for the person** — platform `BiometricPrompt` before signing, biometrics *or* device credential | Not a permission the web layer can request. Zero added dependencies, no user-facing toggle |
> | **Nothing is filmed without permission** — `FLAG_SECURE` on the window in release | Belongs to the window, not the page |
> | **Notifications + haptics** — real channel, real status-bar icon, foreground-suppressed | `navigator.vibrate` is not a haptic API and has no notification surface |
> | **Pull-to-refresh arbitrated natively** — `SwipeRefreshLayout` silenced by a ref-counted lock while a sheet is open | A drag inside a sheet would otherwise reload the app |
> | **MWA signing** — `solana-wallet:` handoff, local websocket, v1 wire format, signed on device | MWA is the Android-native signing path; there is no desktop equivalent, which is the point |

**Speaker note:** "We're going to say the thing you're thinking. Yes, the UI is a WebView, and it's what made 83 commits in fourteen days possible. But look at what isn't in the WebView. Rewriting the UI in Compose would not make the wallet more private by one byte — every OS boundary we actually need is already native."

---

## Slide 8 — How it works

> ```
> ┌──────────── Android APK ────────────┐
> │  Compose shell                      │
> │   ├─ FLAG_SECURE · insets · pull-to-refresh
> │   ├─ BiometricGate.kt               │
> │   ├─ FileSaver.kt  → MediaStore + share sheet
> │   ├─ Notifications.kt · Haptics.kt  │
> │   └─ WebView ── https://appassets.androidplatform.net
> │                  (served out of the APK by WebViewAssetLoader)
> │                       │
> │                       ├── MWA ──▶ wallet app signs (key never enters Vanta)
> │                       └── relayer ──▶ fees sponsored · .vanta handles
> └──────────────────────────────┬──────┘
>                                ▼
>                    Zolana shielded pool (sppU489…)
> ```
>
> Assets load from `https://appassets.androidplatform.net` out of the APK — **not** the
> network and **not** `file://`. Off-origin navigation leaves for the system browser.
> JS→native is a single interface, `window.VantaShell`.

---

## Slide 9 — Who it's for, and why they come back

> ## Day-30 Vanta is a wallet with your history and your name in it
>
> **Who:** crowdfunders, DAOs and grant recipients — anyone whose *fact* of payment is
> legitimate but whose *details* shouldn't be public.
>
> **Why they return:**
> 1. **The `.vanta` handle persists** — get paid by name (`maxx.vanta`), not by address
> 2. **Receipts accumulate** — expense proof for a campaign, evidence for a DAO
> 3. **Campaigns recur** — every grant round is a fresh raise → shield → pay-out cycle
> 4. **Seed Vault custody** on a Seeker makes the security story real, not `localStorage`
>
> **The reframe:** Vanta is not a trick you perform once. It's a wallet you keep money in.

**Speaker note:** "The honest caveat: at hackathon scale the two-party loop is thin, and the deck should say so — item 4 is the roadmap, not the current state."

---

## Slide 10 — What we don't hide

> ## A privacy product that overclaims is worse than none
>
> 1. **The Shield deposit is public.** It ties your wallet to a pool inflow.
> 2. **The spend identity is reused.** `account[0]` pays the fee — an SDK invariant, so anyone you paid can count and time your sends.
> 3. **A small pool makes amount and timing correlatable.** Depth is the fix; faking it with bots would be lying.
> 4. **One fresh-wallet hop is not privacy.** Main wallet → burner → pool is an unbroken public graph.
> 5. **Custody is a shared program vault** with a live upgrade authority. Your private balance is an encrypted bearer claim — lose the seed, lose the funds.
> 6. **On the MWA path your device wallet is the public depositor.**

**Speaker note:** "This slide is the pitch. Anyone can claim privacy. We'll tell you the six ways ours is imperfect, because that's the only way the other four claims are believable."

---

## Slide 11 — Roadmap (labelled as direction)

> ## What we'd build next — none of this is shipped
>
> - **Seed Vault custody on Seeker** — moves the signing key out of `localStorage`
> - **`.vanta` handle in the Receive sheet** — the handle exists; it just isn't surfaced yet
> - **Pool depth** — real seeded demo volume, never synthetic
> - **Handle release/transfer + a second campaign flow** — makes the two-party loop a demo instead of a plan
> - **Production cluster** — devnet is deliberate for this submission; `DEVNET` is printed on the dashboard

---

## Slide 12 — Close

> # Vanta
> ### The pool hides the link between funding and payout. We'll tell you exactly what it doesn't.
>
> APK `com.vanta.privacywallet` · 4.4 MB · signed · Android 9+
> Source: the repository you are reading
> Runtime: on-device MWA custody, Zolana (`sppU489…`) on devnet

---

## Appendix A — Claim → file map

| Claim | Where it lives |
|---|---|
| Receipt copy table (single source of truth) | `src/lib/honesty.js` (160 lines) |
| MWA transport, `solana-wallet:` v1 wire format | `src/lib/mwa.js` (296), `src/lib/wallets.js` (77) |
| MediaStore write, `IS_PENDING`, 20 MB cap, `ACTION_SEND` | `android/.../FileSaver.kt` (231) |
| BiometricPrompt gate, device-credential fallback | `android/.../BiometricGate.kt` (229) |
| FLAG_SECURE, insets, pull-to-refresh lock, viewport probe, bridge | `android/.../MainActivity.kt` (612) |
| Notification channel, monochrome status icon, permission | `android/.../Notifications.kt` (129) |
| haptic mapping (CONFIRM/REJECT, API 30+) | `android/.../Haptics.kt` (48) |
| Asset loader, `solana-wallet:`/`intent:` routing, off-origin hand-off | `android/.../WebShellViewClient.kt` (106), `.../WebShellChromeClient.kt` (71) |
| FLAG_SECURE build flags | `android/app/build.gradle.kts` (`WEB_SHELL_FLAG_SECURE`) |
| Receipt PDF generation | `src/lib/receiptPdf.js` |

Line counts are `wc -l` on **2026-09-30**. Kotlin total is 1,426 across 7 product files plus
93 lines of Compose theme scaffolding → **1,333 lines of product Kotlin**.

---

## Appendix B — Recording the demo without lying

`FLAG_SECURE` is **on** in the release APK — deliberately. That means screenshots and screen
recording of the release build are black, including `adb exec-out screencap`.

To film the demo, build the release variant with the flag off:

```
./gradlew :app:assembleRelease -PWEB_SHELL_FLAG_SECURE=false
```

Use that for the demo video and the QR/download build only. The **published** APK keeps
`FLAG_SECURE=true`. Say both facts in the video; don't present the filmable build as
shipped hardening when it isn't the one you ship.
