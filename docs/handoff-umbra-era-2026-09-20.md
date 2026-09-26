# VANTA — MASTER HANDOFF (2026-09-20)

> **Next agent: read this entire file before touching anything.** It encodes ~10 hours
> of debugging, two full architecture pivots, and one critical privacy discovery that
> changed the design. Do not re-learn these lessons the hard way. The full narrative
> chat log lives at `docs/chat-log-2026-09-20.md` — read it after this file if you
> need the raw history.

---

## 0. TL;DR — Current state

- **Repo**: `~/vanta-mobile` → `https://github.com/geekman58748/vanta-mobile.git` (branch `main`)
- **App**: React 19 + Vite + Tailwind SPA = "Vanta" privacy wallet (neobank-style UI, mobile-frame, 440px)
- **Working right now**:
  - Real Solana devnet wallet (create/import via localStorage `vanta-wallet`)
  - Balance display, devnet airdrop, plain SOL send (Phase 1 & 2 of the spec: ✅)
  - **Umbra private send end-to-end on devnet** (Phase 4: ✅ with a known caveat, see §4)
    - Flow: per-send **burner wallet** → register → shield into stealth pool →
      scan → burn into **recipient's public wallet** via relayer + ephemeral signer.
    - Recipient does **NOTHING**: uses any wallet (Phantom/Solflare), funds just arrive.
  - "Claim Private Funds" fallback button (for indexer-lag edge case)
  - Transaction history, toasts, haptics, receipt/analytics/menu drawers (Apex Pay UI port)
- **Dev server**: `http://localhost:3000` — kept alive by macOS **launchd** (see §7).
  Serve the **built** `dist/`, never `vite dev` (dev server dies when shells close).
- **Known-wrong / next up**: funding-edge trace (§4.5), Phase 5 "what's shielded" UI,
  dUSDC full-shield mode, error/loading/empty states, Android webshell packaging.

---

## 1. What this project IS / IS NOT (from the build spec — still binding)

- Self-custody Solana wallet (we ARE the wallet, not an MWA client). **Do not add**
  `@solana-mobile/mobile-wallet-adapter-protocol` as a client dependency.
- Devnet-first. Mainnet only for the final demo with a small disposable wallet (Phase 8).
- Core differentiator = **private send** via Umbra (built on Arcium MPC). Everything
  else (swaps, multi-token) is secondary and cuttable (cut order: Jupiter → mainnet
  demo → polish; **never cut Phases 1–5**).
- **Never** claim "audited", **never** describe swaps as private, be precise about
  what's shielded (§4). Precision reads as competence to judges; overclaiming kills.
- Android packaging (Phase 6) = `@solana-mobile/wallet-standard-mobile` (v0.5.1+) in
  the web app + `solana-mobile webshell init` against a deployed URL + `webshell build`.

## 2. Repository / file map

```
~/vanta-mobile/
├── index.html                  # Vite entry (has deprecated apple meta tag — harmless warning)
├── vite.config.js              # React plugin, dev port 5173, allow .wasm/.wasm?init assets
├── package.json                # deps in §8; scripts: dev/build/lint(oxlint)/preview
├── src/
│   ├── main.jsx                # React root
│   ├── index.css               # Tailwind + @theme + keyframes (blur-rollup, card-glow, toast-anim)
│   ├── App.css                 # a few leftover styles (harmless)
│   └── App.jsx                 # ★ EVERYTHING: wallet core, Umbra client, burner private send,
│                               #   plain send, airdrop, all UI (onboarding/main/drawers), tx history
├── public/                     # static assets
├── dist/                       # BUILD OUTPUT — this is what the launchd server serves
├── HANDOFF.md                  # ← you are here
├── docs/chat-log-2026-09-20.md # full session narrative + evidence signatures
└── deploy/com.vanta.server.plist  # copy of the launchd plist (see §7 to install)
```

Single-file app (`src/App.jsx`, ~730 lines). Yes it's a monolith — that was a
deliberate speed decision under hackathon time pressure. Refactor only if you must.

## 3. Environment & commands

```bash
# Build (MUST run after any src change — the server serves dist/, not src/)
cd ~/vanta-mobile && npx vite build

# Server: launchd keeps a python http.server alive on :3000 rooted at dist/
launchctl list | grep vanta            # check it's loaded (label: com.vanta.server)
launchctl unload ~/Library/LaunchAgents/com.vanta.server.plist
launchctl load   ~/Library/LaunchAgents/com.vanta.server.plist
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000   # expect 200

# If the plist is missing entirely, reinstall from repo copy:
cp deploy/com.vanta.server.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.vanta.server.plist

# Open in Chrome
open -a "Google Chrome" http://localhost:3000
```

**War story (do not repeat)**: `vite`/`serve`/`nohup`/`tmux`/`setsid` background
servers ALL died when our shell sessions closed — burned ~30 min. launchd was the
only thing that stuck. Also: `npx vite --host` in foreground dies with the session.

**RPC notes**: public devnet RPC throttles **WebSocket subscriptions**. That's why
every Umbra client uses `getPollingTransactionForwarder` + `getPollingComputationMonitor`
(HTTP polling). Don't "fix" this back to websockets.

Devnet faucet is rate-limited; when `conn.requestAirdrop` fails, wait ~30 min or use
`https://faucet.solana.com`. UI keeps a `+` airdrop button in the header.

## 4. UMBRA INTEGRATION — the hard-won knowledge

### 4.1 Constants (real, verified on devnet)

| Thing | Value |
|---|---|
| Umbra SDK | `@umbra-privacy/sdk@5.0.0-rc.10` (public on npm; subpath imports, needs bundler — no CDN) |
| Umbra devnet program | `DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ` |
| Arcium program (MPC) | `Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ` |
| Umbra mainnet program | `UMBRAD2ishebJTcgCLkTkNUx1v3GyoAgpTRPeWoLykh` |
| Indexer | `https://utxo-indexer.api-devnet.umbraprivacy.com` |
| Relayer | `https://relayer.api-devnet.umbraprivacy.com` |
| dUSDC devnet mint | `4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7` |
| SDK docs | https://sdk.umbraprivacy.com/quickstart |

### 4.2 API surface we use (all verified working)

```js
// Client (polling transport for devnet!)
import { createSignerFromPrivateKeyBytes, getUmbraClient, getUmbraRelayer } from '@umbra-privacy/sdk'
import { getPollingComputationMonitor } from '@umbra-privacy/sdk/arcium'
import { getPollingTransactionForwarder } from '@umbra-privacy/sdk/solana'

// Registration — confidential:true, anonymous:false. WORKS. ~2-5s.
// anonymous:true hangs/needs ZK CDN — WE SKIP IT (see §4.4).
import { getUserRegistrationFunction } from '@umbra-privacy/sdk/registration'

// Shield: ATA → stealth pool note (needs local Groth16 prover, bundled fine)
import { getATAIntoSelfBurnableStealthPoolNoteCreatorFunction } from '@umbra-privacy/sdk/deposit'
import { getATAIntoStealthPoolNoteCreatorProver } from '@umbra-privacy/sdk/zk-prover'

// Scan + burn note into ANY public wallet (the magic: recipient does nothing)
import { getBurnableStealthPoolNoteScannerFunction,
         getSelfBurnableStealthPoolNoteIntoATABurnerFunction } from '@umbra-privacy/sdk/burn'
import { getClaimSelfClaimableUtxoIntoPublicBalanceProver } from '@umbra-privacy/sdk/zk-prover'
// Burn goes through relayer: { submitBurn: r.submitClaim, pollBurnStatus: r.pollClaimStatus, getRelayerAddress }

// ETA→ATA unshield (own funds back), ETA→ETA transfer (needs receiver registered):
import { getETAIntoATAWithdrawerFunction } from '@umbra-privacy/sdk/withdrawal'
// transfer variants in '@umbra-privacy/sdk/transfer' (getTransferorFunction...) — NOT used anymore
```

### 4.3 Cost structure (measured on devnet)

- Confidential registration: 1 tx, ~0.000011 SOL
- One full private send ≈ **amount + ~0.02–0.03 SOL overhead** (stealth-pool rent,
  MPC `QueueComputation` needs ~0.00565 SOL, claim/rent-reclaim, fees).
- Failed-tx evidence: `Transfer: insufficient lamports 3770744, need 5654040` ←
  QueueComputation ran out of lamports. **Always leave the buffer.**
- Indexer lag: after the shield tx, the note may take seconds–minutes to appear in
  scan results. Code retries scan 10× with 3s sleeps; if still empty, funds are SAFE
  in the pool — recover via burner key (see §4.5 + `vanta-burner-*` localStorage).

### 4.4 Two dead ends we hit — don't go back

1. **`anonymous:true` registration hangs** (ZK proof / CDN / MXE wiring). Error was
   Solana `-32002` → decoded `#7050003` with `unitsConsumed=0`. Program IS deployed;
   problem was the anonymous path. `confidential:true, anonymous:false` works.
2. **ETA-to-ETA transfer** (`getTransferorFunction`) requires the RECEIVER to be
   registered with Umbra — violates our "recipient does nothing" requirement. Abandoned.

### 4.5 ★ THE PRIVACY DISCOVERY (most important section in this file)

**User caught a real deanonymization vector. Understand it before changing any flow.**

Original flow used the USER's main wallet as the Umbra depositor. Verified on-chain:

- Deposit tx `3dAemEoE...` (`DepositIntoStealthPoolFromPublicBalance`):
  sender `EWMB...CeoN` −0.097363, pool `8hVkwJ7a...` +0.100000. Recipient absent ✓
- Claim tx into recipient `xNHZaCLY...` (`ClaimIntoPublicBalanceToMxeV18Callback`):
  pool −0.099652 → `DCRMX...` (recipient) +0.099652, signed by ephemeral
  `3kbpT5Em...` ✓ … **BUT the tx account list contains
  `3n1MVbXiHpkweM8RZebYcgKWv44pVhfynzwPtvFvYWoc`** — the sender's PERSISTENT
  Umbra **linker PDA** (`PopulatePublicNullifierAndLinkerBuffer`), deterministically
  derived from the sender wallet and reused across all their transfers.

So the attack was: recipient sees funds from "unknown" → clicks the tx → sees
`3n1MVbXi...` in the account list → its history is all the sender's deposits →
**sender deanonymized in one click.** The forward direction looked private; the
reverse click-through wasn't. Always check BOTH directions.

**Fix implemented (current `privateSend` in App.jsx) — per-send burner wallet:**

```
1. Generate fresh Keypair (burner), persist to localStorage 'vanta-burner-<fundSig>'
2. Main wallet funds burner: amount + 0.02 SOL buffer (plain transfer)
3. BURNER (not us) gets its own Umbra client + confidential registration
4. BURNER shields amount into stealth pool (from burner's ATA)
5. Scan (10 retries) → burn note into recipient's PUBLIC wallet via relayer
```

Now the recipient's tx contains only **single-use burner accounts** — the sender's
persistent linker never appears. Verified live: recipient `DCRMX...` received from
an ephemeral address with zero recipient-side action.

**Residual traces (document honestly in pitch/README):**
- Burner's one funding edge points back to sender's wallet (one hop, not one click).
- Native SOL lamport deltas are **public at L1** — pool inflow/outflow amounts are
  correlatable (0.1 in → 0.0996 out, ~2 min window). NO protocol can hide native SOL
  amounts; this is exactly why Umbra's full-shield uses SPL tokens in Encrypted
  Token Accounts (encrypted account data) and ships dUSDC for devnet.

**Hardening queue (next agent — highest privacy value first):**
1. **Pre-funded burner pool**: app maintains a stockpile of aged, funded burners;
   sends draw from it so the funding edge is not fresh and not user-linked.
2. **dUSDC full-shield mode**: ETA-based amounts are encrypted; make it the default
   "Private Send" and label SOL mode as "hidden from recipient only".
3. Vary timing/batch burn legs to break amount+timing correlation.

### 4.6 Burner recovery procedure (if a send dies mid-flow)

The burner key is persisted (`vanta-burner-<fundSig>` in localStorage — NEVER delete
these). Recovery: rebuild a burner Umbra client from the stored secretKey, run the
same scan → `getSelfBurnableStealthPoolNoteIntoATABurnerFunction` with
`destinationAddress` = original recipient (or your own wallet), burn. Funds are not
lost; they sit in the stealth pool until burned.

---

## 5. LocalStorage schema (user state)

| Key | Contents | Note |
|---|---|---|
| `vanta-wallet` | `{ publicKey, secretKey[64] }` | main wallet; deleting it loses funds |
| `vanta-burner-<fundSig>` | `{ publicKey, secretKey, recipient, amount, createdAt }` | per-send burner — **never delete**, recovery keys (§4.6) |

## 6. Test ledger — on-chain evidence (devnet, use these in the demo/README)

| Purpose | Signature (short) | What it proves |
|---|---|---|
| Plain transfer in | `xAWA...` | Solflare("vanta") → EWMB 1 SOL (public leg baseline) |
| Confidential registration | `5yoetWR9...` | Umbra registration works (was the -32002 battle) |
| First private deposit | `yvrUtqM...` + callback `tBjRWh...` + rentClaim `2RT8uQ...` | ATA→ETA shield via MPC works |
| Stealth note (first) | populate `3vsod6k...`, createUtxo `3FVFh71...` | self-burnable note creation works |
| Deposit (leak evidence) | `3dAemEoE...` and `5F6B8yAe...` | sender+amount visible on deposit leg; recipient absent |
| Claim into recipient | `xNHZaCLY...` | pool→recipient 0.099652; ephemeral signer; **contained linker PDA `3n1MVbXi` = THE LEAK** |
| Queue computation | `qFMx7H3P...` | `ClaimIntoPublicBalanceToMxeV18` + `QueueComputation` |
| Linker populator | `2kceadRR...` / `5xJLQZwt...` | `PopulatePublicNullifierAndLinkerBuffer` |
| Failed (insufficient) | `2T2foxi...` | cost lesson: keep the 0.02 buffer |

Key addresses in tests: main wallet `EWMBZEpPVobt3oQh7ZZak7irpoyrFmiENbBGEEYrCeoN`,
recipient/Solflare `DCRMXTKGScMuzSRPN1GGwigdA19xESsoeLMKdG1buc74`,
sender linker PDA `3n1MVbXiHpkweM8RZebYcgKWv44pVhfynzwPtvFvYWoc`,
pool account `8hVkwJ7a5Y5hvgscpY5DQX7nFsnWQYpg8wXiA5Ftfzfv`.

**E2E verify script for the burner flow** (do this after any change to `privateSend`):
private-send 0.05 to a fresh Solflare/Phantom address → funds arrive with NO claim →
open the inbound tx on explorer.solana.com?cluster=devnet → assert NO `EWMB...` and
NO `3n1MVbXi...` in account keys → only burner-derived + pool + relayer accounts.

## 7. Known bugs / quirks / warnings

- Deprecated meta warning in console (`apple-mobile-web-app-capable`) — cosmetic.
- Don't nest `WalletProvider` inside itself (an early stuck-at-"wallet created" bug).
- If port 3000 dead: §3 launchctl dance; if 403/connection refused check dist/ exists.
- After every `src/` edit you MUST `npx vite build` (server serves dist/).
- Devnet faucet rate limits are real; plan airdrops ahead of demos.
- `getSignaturesForAddress` then `getTransaction` is how we forensicated everything —
  keep doing this instead of trusting explorer UI summaries.

## 8. Dependencies (pinned-ish, all working together)

`@umbra-privacy/sdk@5.0.0-rc.10` (brings `@solana/kit@6.x`), `@solana/web3.js@1.99`,
`@solana/spl-token@0.4.15`, `@noble/{curves,ciphers,hashes}@2.4.0`, `snarkjs@0.7.6`,
React 19 + Vite (rolldown-vite) + Tailwind 4. Bundling the ZK prover works — do not
try to CDN-load SDK subpath modules (we proved it breaks).

## 9. Spec phase status & next steps (priority order)

| Phase | Status |
|---|---|
| 1 wallet core | ✅ |
| 2 plain transfer | ✅ |
| 3 verify Umbra access | ✅ |
| 4 private send (devnet) | ✅ SOL (recipient-anonymous; amounts correlatable — be honest) / ⬜ dUSDC full-shield |
| 5 "what's shielded" UI | ⬜ **next up** — receipt must state: hidden-from-recipient ✓, on-chain amounts visible (SOL mode), etc. |
| 6 Android webshell | ⬜ |
| 7 Jupiter swap | ⬜ cuttable |
| 8 mainnet demo wallet | ⬜ cuttable |
| 9 polish (error/empty/loading) | ⬜ partial (toasts exist; edge cases remain) |
| 10 submission packaging | ⬜ README/architecture diagram/demo video/license |

Priority queue for next agent:
1. Re-verify burner flow E2E (§6 script) and fix whatever regressed.
2. Pre-funded burner pool (§4.5 hardening #1).
3. Phase 5 honesty indicators in the send receipt.
4. dUSDC full-shield as flagship private flow.
5. Deploy publicly (the spec wants a live URL for webshell).
6. README rewrite for submission (§1 rules) + architecture diagram + license.

## 10. DO NOT list (hard rules from this session)

- **DO NOT** make the user's main wallet the Umbra depositor. Burner only.
- **DO NOT** delete `vanta-burner-*` localStorage entries (recovery keys).
- **DO NOT** use `vite dev` / any foreground backgrounded server for the user; use launchd.
- **DO NOT** re-enable `anonymous:true` registration or ETA-transfer flows (dead ends).
- **DO NOT** claim audited / claim swaps are private / conflate MagicBlock (TEE) with
  Arcium (MPC) in any copy.
- **DO NOT** require the recipient to register/claim/connect anything — that was
  explicitly rejected by the user. Burn-into-public-wallet or nothing.
