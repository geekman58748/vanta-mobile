# Audits

> **Why this directory is at the top level.** A judge or a security researcher should not have to
> find the security work by reading the repository layout. The one audit Vanta has is here, in an
> index, with its status next to it — because a report that only lists open CRITICALs is worse than
> no report at all.

## What this is, and what it is not

- **It is** an **adversarial self-audit** of the live app on devnet, run by the project against
  itself on 2026-09-27: the debug APK driven over CDP, real devnet, the real relayer, every flow
  exercised. Report: [`AUDIT-2026-09-27.md`](AUDIT-2026-09-27.md).
- **It is not a third-party audit.** No external firm reviewed Vanta's code or program. The README
  says so plainly (*"This is not audited and should not hold real funds"*), and nothing in this
  directory changes that. Do not cite it as an audit by a third party.

The findings below are the ones a security judge will look for first. Every one of them has since
been **remediated** or **explicitly disclosed**; the remediation is recorded in
[`../PLAN.md`](../PLAN.md) and [`../HANDOFF.md`](../HANDOFF.md), and the code locations are listed
here so a reviewer can check them directly.

## Remediation status

| Finding | Subject | Status | Where to check |
|---|---|---|---|
| **C1** | Relayer token shipped in the APK unlocked the payment graph | ✅ Fixed — history is now **identity-signed**, not token-gated; a bundle no longer unlocks anything | `src/lib/identityProof.js`, `relayer/server.js` (`/tx/:address`, `/tx/report`) |
| **C2** | Server stored the counterparty and amount the pool hid | ✅ Fixed — the relayer stores a **receipt anchor only**: signature, flow, actor, time, `verified_on_chain`. No amount, no counterparty | `src/lib/txHistory.js`, `relayer/schema.sql` |
| **C3** | Shielded spend key plaintext in `localStorage` | ⚠️ **Disclosed, not fixed** — the key stays in WebView storage so the in-app prover can read it; Seed Vault custody is the stated direction | `src/components/SettingsDrawer.jsx`, `README.md` → *Known limitations* |
| **H1** | History and receipts vanished on every restart | ✅ Fixed — encrypted history at rest | `src/lib/localHistory.js` |
| **H2** | "Download PDF receipt" reported success and wrote nothing | ✅ Fixed — the shell writes through MediaStore; the web path may only say the download was *requested* | `src/lib/receiptPdf.js`, `android/.../FileSaver.kt` |
| **H3** | Advertised "falls back to a Ghost send" never fired | ✅ Fixed | `src/App.jsx`, `src/components/SendDrawer.jsx` |
| **H4** | Clearing app data destroyed the private balance permanently | ✅ Fixed — export/restore (scrypt + XChaCha20-Poly1305) | `src/lib/backup.js` |
| **H5** | Incoming funds never updated the displayed balance | ✅ Fixed | `src/App.jsx` (`fetchBalance`) |
| **H6** | MWA connect silently replaced the public wallet | ✅ Fixed | `src/App.jsx`, `src/lib/mwa.js` |
| **M1** | Receive sheet handed the address to a third-party QR service | ✅ Fixed — no third-party QR round-trip | `src/components/ReceiveDrawer.jsx` |
| **M2–M6** | Claims-vs-behaviour, raw internals shown, test row in the DB, receipt accessibility, privacy-mode semantics | ✅ Worked — see the remediation record | `PLAN.md`, `HANDOFF.md` |
| **L1–L5** | Cosmetic / empty-state / console noise | ✅ Worked | `PLAN.md`, `HANDOFF.md` |

**Open by design:** C3 above. It is disclosed in the app's own footer and in the README, and it is
the item the Seed Vault roadmap closes.

## What the audit also established (the "verified good" half)

The report's own `✅ Verified good` table is the part that matters for the product claim: 5× Shield
with exactly one transaction per click and no duplicate spend; a Ghost payout where the pool paid the
recipient and the fee payer stayed public; a Shadow resolved by `.vanta` name; `verified_on_chain =
true` for all three spend types; the full `shield → sync → ghost → shadow` harness green; relayer
auth, caps and rate limits holding; the name-registry proof checks rejecting replayed and mismatched
signatures.

That table is evidence with transaction signatures, not a summary.

## How to reproduce

The report states its own scope and method in its header (emulator over CDP, devnet, the deployed
relayer, throwaway identities). The headless companion is `scripts/e2e-zolana.mjs`. No funds beyond
devnet test SOL were used.
