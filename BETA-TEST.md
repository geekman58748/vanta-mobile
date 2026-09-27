# Vanta — device beta test

APK: `deploy/releases/vanta-1.0.0-ux.apk` (4.25 MB, sha256 `fa690f75…a1801ac`)
Relayer: `https://p01--vanta-mobile--9ymc8tqmdxvj.code.run`
Signer: `CN=Vanta, O=Vanta, L=Lagos, C=NG` · minSdk 28 (Android 9+) · targetSdk 36

---

## Read this before you tap install

**1. Uninstall the old build first — the install will fail otherwise.**
A previously installed Vanta is debug-signed. This APK is release-signed, so
Android refuses it with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. This is exactly
what happened on the emulator. Uninstalling **wipes app data** — a fresh
install starts from onboarding with a brand-new session wallet. If you try to
install over the top and it bounces, this is why, not a broken APK.

**2. You need a real wallet app on the device.**
Vanta signs through MWA — it never holds your keys. With no wallet installed,
the connect step spins forever. Install Phantom or Solflare first; on a Seeker
the Seed Vault drives this and needs no wallet app. (Verified working on the
emulator, which had a wallet provider present.)

**3. "Relayer could not fund session fees" on repeat testing is a rate limit,
not a bug.** `/fund` is capped server-side at **0.05 SOL/request, 10
requests/hour and 0.5 SOL/hour per IP**. Every fresh install funds a new
session wallet with 0.01 SOL, so ~10 reinstalls inside an hour trips it and
returns `429`. Wait out the window, or tell me and I'll raise the cap for the
test window.

**4. This phone blocks `adb install` — MIUI/HyperOS, not a bad APK.**
`adb install` fails with `INSTALL_FAILED_USER_RESTRICTED: Install canceled by
user`. Either tap-install from the device (copy the APK to `/sdcard/Download/`
and open it from Files), or turn on Developer options → **Install via USB**
(on MIUI this often also wants a signed-in Mi account and a SIM). `adb push`
is unaffected, so pushing the file always works.

**5. Uninstalling destroys the shielded wallet with no recovery.**
The shielded spending key lives in `localStorage` (`vanta-zwallet`) and there
is no export or backup path in the app. Wiping app data burns it permanently.
Back it up first with `deploy/device-backup/` (gitignored — it is a private
key). **This is a real gap for the audit list: a user who clears app data or
reinstalls loses access to their shielded funds, silently.**

---

## Flows

Mark each: ✅ works · ⚠️ works but rough · ❌ broken

| # | Flow | Entry point | What "working" looks like | Result |
|---|------|-------------|---------------------------|--------|
| 1 | Onboarding | first boot | brand mark leads the cascade; wallet connects; no dead end | |
| 2 | Connect wallet | connect screen | MWA sheet appears, returns an address | |
| 3 | Shield (deposit → shielded) | `ShieldDrawer` | public → shielded, tx confirms, receipt shows a hash | |
| 4 | Send — public | `SendDrawer`, `Public` | recipient receives, hash in `ReceiptDrawer` | |
| 5 | Send — shielded | `SendDrawer`, `Shielded` | leaves and arrives; amount not visible on explorer | |
| 6 | Ghost send | `Ghost` mode | relayed via `X` session signer; fee float stays off user wallet | |
| 7 | Receive | `ReceiveDrawer` | QR + address; address matches the connected wallet | |
| 8 | Activity / history | `ActivityDrawer` | every tx above is listed and matches the chain | |
| 9 | `.vanta` handle resolve | send field, `name.vanta` | resolves to an owner address; bad handle fails clearly | |
| 10 | Name registration | (registry) | registration relays and persists in Postgres | |
| 11 | Profile / Settings | `ProfileDrawer`, `SettingsDrawer` | open, persist across app restart | |
| 12 | Receipt details | `ReceiptDrawer` | hash opens/copies; explorer payload matches | |

### Specifically look at
- **Onboarding copy** — does it still say "install Phantom or Solflare, or use a
  Seeker"? Is that true on this device?
- **The honesty rows** (`HonestyRows.jsx`) — these make claims about privacy. Any
  claim that overstates what's on-chain is the one thing worth fixing before
  publishing.
- **Session float visibility** — the 0.01 SOL `X` float is relayer-funded. Does
  the UI ever imply that float is the user's money?
- **Failure states** — kill wifi mid-flow. Does it fail honestly or hang?
- **Rotation / small screens** — drawers on a real viewport, not the emulator's.

---

## UX defects found on device — fixed in `vanta-1.0.0-ux.apk`

All five are in this build and were verified on `emulator-5554` against the exact
code that ships (debug build for the CDP probes; identical source and assets).

| # | Defect | Root cause | Fix | Verified |
|---|--------|-----------|-----|----------|
| 1 | Sheet could only scroll down; dragging it back up reloaded the whole app | The Android host wraps the WebView in a native `SwipeRefreshLayout`. Its guard, `webView.canScrollVertically(-1)`, is always false while a sheet is open (the WebView sits at scroll 0), so any downward drag was claimed by pull-to-refresh → `webView.reload()`. CSS can't touch a native gesture. | `MainActivity.kt` exposes a `VantaShell` JS bridge; `Drawer.jsx` calls `setPullToRefresh(false)` on mount and `true` on unmount. | ✅ two real downward swipes with a sheet open: **no reload**, sheet stayed open. Control: same swipe on the dashboard **still reloads** (pull-to-refresh intact). |
| 2 | Reload flashed the connect-wallet screen before landing on the dashboard | `wallet` initialised to `null`; the boot effect restored it from `localStorage` one frame later. | `wallet` now lazy-initialises synchronously from `localStorage` in `useState`. | ✅ pre-`reload` frame observer (`sessionStorage` flag, 10 ms sampling): `sawConnect: null`, `sawDashboard: "1"`. |
| 3 | Flow order wrong — connect wallet came *before* onboarding | `if (!wallet)` (connect) was rendered above `if (!onboarded)`. On a fresh install both are false, so connect won. | Onboarding gate moved above the connect gate in `App.jsx`. | ✅ fresh install (`pm clear`) opens on onboarding; `hasConnect: false`. |
| 4 | No confirmation moment after Shield / send | Success was a toast that slid past as the sheet closed. | New `SuccessOverlay.jsx`: drawn ring + tick, amount, explorer proof only when a link tells the truth; auto-dismisses, tap or **Done** closes. Wired from `shieldNow` and both send paths. | ⚠️ code + bundle verified (copy and keyframes present); not yet run with real funds on the test device. |
| 5 | General "flaky web page" feel | Root cause was mostly #1–#4. Also: inner scrolls could drag the page behind them. | `overscroll-behavior: none` on `html, body`; `overscroll-contain` on the drawer sheet and the activity list. | ✅ shipped in CSS |

---

## Mechanisms to re-examine

- [ ] Session float (`X`) lifecycle — funded by relayer, never the user's wallet
- [ ] Shielding key storage — `localStorage` is the weakest link; Seeker Seed Vault is the fix
- [ ] Relayer `ALLOWED_PROGRAMS` allowlist — confirm it still matches the shipped programs
- [ ] `/fund` limits as anti-drain protection, and whether 10/hour is right for a demo
- [ ] Anything the app claims but does not do — the one unforced error in a product
      whose whole thesis is "every claim has a tx hash"

---

## Known, accepted for the beta

- Helius API key is baked into the client bundle — **rotate before public
  release**; rotating after distribution breaks Shield on installed devices.
- No USD price anywhere. Devnet has no market, so any dollar figure would be
  invented. Deliberate.
- Seeker Genesis Token tier: not built (higher limits + Sybil resistance).

---

## If something breaks

Capture `adb logcat` while it happens, or tell me the time and what you pressed —
I can read the relayer's logs directly and tell you whether the request even
reached the server, which splits "app bug" from "network/relayer" immediately.
