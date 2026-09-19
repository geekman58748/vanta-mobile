# VANTA — Engineering Handoff

**Date:** 2026-09-19 · **Deadline:** submissions close Oct 8, internal target Oct 3
**Repo:** github.com/geekman58748/vanta-mobile (branch `main`)
**Live:** web `https://vanta-web-2whu.onrender.com` · relayer `https://vanta-mobile-8ee4.onrender.com`

---

## 0. The question you keep asking: why does a standalone wallet need Phantom?

This is the single most important thing to understand before touching anything.

**Vanta never holds your money's source. It generates a second, disposable wallet and stands between that wallet and the world.**

When you open Vanta, it derives a fresh session keypair — a real Solana wallet that exists only for this session. That session wallet is what pays recipients, what merchants see, what block explorers index. Your Phantom address appears in none of it.

But the session wallet has to get funds from somewhere. That somewhere is your main wallet (Phantom/Backpack/Solflare). The connect is used for exactly three things:

1. **Consent proof** — one signature (free, no funds move) proving you voluntarily tied this session key to your main address. It's what keeps Vanta a defensible product instead of a malware keygen: every session is *opted into* by a real keyholder.
2. **Funding** — when you tap "Fund private wallet", Phantom signs the transaction that moves SOL from you to the session wallet. A non-custodial app cannot move your money without your wallet signing. That's the whole point of non-custodial.
3. **Sweep-back on Burn** — leftovers return to your main wallet; the app needs to know where "back" is.

The alternatives are all worse:

- **Ask Vanta for a private key** → then Vanta is custodial, holds everyone's keys, and is a $30k hackathon liability.
- **A standalone wallet with no source** → the funds in it came from somewhere public. Whatever funded it is already linkable to it. You'd have reinvented the funding edge, just worse.

So the honest framing: **Vanta is not "a wallet that connects to Phantom." It's a privacy layer for spending, and Phantom is where the money comes from.** The one-time connect is the entry toll of that model. Every later open is silent (trusted reconnect) — no popups, no re-approval.

The thing that made this confusing for weeks: an earlier version framed itself as a VPN-style "shield toggle" over transactions. That model is **dead** (see §2). What remains is the wallet model above.

---

## 1. What Vanta is (final form)

A **mobile-first privacy wallet**: your spending is always shielded, by default, with no toggle.

- Open the app → a session wallet is provisioned (or restored) automatically.
- **Receive** → one-time ephemeral address, rotates on every reveal; optionally bound to your `name.vanta` (off-chain registry).
- **Send** → session key signs and pays; fee-payer = signer = session key. Main wallet absent from the transaction.
- **Burn** (drawer) → sweeps everything back to main, revokes the session, advances the rotation so the next session address is fresh. This is disposal, not a privacy switch.
- **Refresh-safe** — session keys derive deterministically from your main wallet address (+ a rotation salt), so a page refresh restores the same key and never strands funds.

Chain: Solana devnet for now (mainnet is a config change + funding policy decision).

---

## 2. Pivot history — every direction this took, in order

Documented because the code carries fossils of each era and so nobody re-litigates closed doors.

### Era 1 — VPN-style transaction interceptor (DEAD, technically impossible)
Original idea: toggle ON, and transactions from Phantom get "intercepted" and shielded while you keep using Phantom/Jupiter normally. **This cannot be built.** Browser extensions inject providers; mobile wallets don't route their transaction signing through third-party web pages. Non-custodial wallets sign locally in their own secure storage; there is no interception point. Roughly 1.5 days were spent before this was confronted directly. Nothing salvageable survived except the session-key engine, which was originally built for this.

### Era 2 — Session-key utility with explicit shield toggle (SUPERSEDED)
What got built: provision session key on toggle-ON, kill-switch on toggle-OFF. Fully works, all tests green. Killed because the product framing was wrong — a privacy wallet that asks you to "enable privacy" is admitting it isn't one. The toggle UI is gone; the engine survived under new management.

### Era 3 — Identity layer bolt-on (SHIPPED, kept)
`.vanta` name registry on the relayer: claim a name with a real wallet signature, bind ephemeral receive addresses to it, KYC attestation *slot* (digest-only storage; no documents ever touch the server; Persona integration planned, not built). **Deliberately off-chain** — zero blockchain footprint for the social layer. 39 relayer tests cover this.

### Era 4 — "Untraceable money" ambitions (PRUNED, honest limits documented)
A two-hop ephemeral sweep (session → fresh intermediate → recipient) was built and demonstrated on devnet. Then the user tracked both hops on the explorer by hand in 30 seconds and correctly concluded: **hopping is obfuscation, not privacy** — the chain is a public graph and any script follows it. Decision (Path A): keep the honest scope — counterparty privacy + hidden amounts via Solana Confidential Token Extensions — and *never market* anything as "untraceable." The hop tool survives in `web/test/hop-sweep.js` as a labeled obfuscation utility, not a privacy claim. EthelSec is on the judging panel; the README's language stays on the defensible side of that line.

### Era 5 — Private-by-default wallet (CURRENT)
Toggle removed entirely (Era 2's fossil), wake-on-open, deterministic refresh-safe keys, Burn replaces kill-switch, Receive promoted to a first-class button. This is the model in §1.

---

## 3. Architecture

```
web/vanta-app.html      ← the app (design: user's fintech dashboard replica)
web/index.html          ← copy of vanta-app.html (Render serves this; keep in sync)
web/vanta-engine.js     ← session lifecycle: derive/restore/rotate keys, consent,
                          relayer protocol signing, revoke. Browser + Node loadable.
web/vanta-chain.js      ← chain ops: balances, sendSol/sendSpl (session-signed),
                          topUp (main-signed), sweepBack, faucet
relayer/src/server.js   ← HTTP API: session create/cosign/revoke, name registry routes
relayer/src/store.js    ← in-memory session store (TTL, IP rate limits, spend caps)
relayer/src/names.js    ← .vanta registry (in-memory Map, sig-verified writes)
relayer/src/config.js   ← env-driven hard caps (MAX_SESSION_SPEND_LAMPORTS etc.)
src/session/engine.js   ← Node twin of the browser engine (tests use this)
web/test/               ← localnet/devnet E2E rigs (chain, hop-sweep, web-engine)
```

**Key trust invariants (do not break):**
- Session private keys never leave the client. The relayer only ever sees pubkeys + signatures.
- Every relayer write is signature-verified server-side; the client is never trusted.
- Consent signature is optional-but-verified: a *bad* mainSignature fails closed (401), absence just marks `consentVerified: false`.
- Spend caps are enforced relayer-side (`MAX_SESSION_SPEND_LAMPORTS`, `MAX_TX_LAMPORTS`) — the brief's hard requirement for fee-payer liability.

**Deterministic session keys (Era 5's load-bearing change):**
`seed = SHA-256( mainPubkey ‖ "vanta-session-v1\0" ‖ salt )` → `nacl.sign.keyPair.fromSeed(seed)`.
Salt lives in `localStorage.vanta_salt`, bumps **only** on Burn. Consequences: refresh-safe restore, per-burn rotation, and a hard rule — **do not rotate the salt anywhere except after a successful sweep+revoke**, or you strand user funds.

---

## 4. Bugs introduced, found, fixed (the honest list)

| Bug | Root cause | Fix |
|---|---|---|
| Keypad completely dead | `keypadVal` used but never declared — first tap threw and killed the handler; UI wiring shipped with zombie duplicate `renderTransactions()` referencing a dead `transactions` array | Declared state, deleted corpse functions, added an "all onclick handlers defined" check to the QA script |
| Copy button silently failed | Clipboard was called *after* network awaits — browser clipboard permission expires when the user gesture ends | Copy FIRST inside the gesture, `navigator.clipboard` + execCommand fallback, tap-to-copy on the address card itself |
| "Backpack summoned" instead of Phantom | Silent reconnect scanned every installed wallet and grabbed whoever trusted the site | Reconnect only the wallet saved in `localStorage.vanta_wallet`; zero wallet scanning exists now |
| **The 401 loop** (worst one) | WebCrypto `importKey('raw', <32-byte seed>)` does NOT create a signing key from a seed — it imports the bytes as a **public key**. Published pubkey ≠ signing key → every signature failed relayer verification | Derive via tweetnacl `fromSeed` instead; added `web/test/web-engine.e2e.js` which loads the real browser engine against a real relayer and would have caught it immediately |
| (Caught by the new test) salt rotated on every wake | `_rotateOnBurn()` was called in `shieldOn` success — every refresh would have derived a NEW key and stranded funds | Rotation only inside `shieldOff` (i.e., after Burn's sweep+revoke) |
| Stale "Shield is OFF — power on first" toasts | Era-2 strings survived the Era-5 rebuild | All replaced with "connect once to activate" messaging; grep shows zero shield-toggle strings left |
| Test process hang | undici keep-alive sockets held the event loop open after `server.close()` | `closeAllConnections()` + explicit `process.exit(0)` in the E2E |

**Process lesson (put here so it sticks):** every one of these was shipped by a validation script that checked *syntax and element IDs* but not *behavior*. The web-engine E2E (real relayer, real nacl, real derivation) is the minimum bar now — no UI wiring ships without it.

---

## 5. What is actually verified (don't over-claim these, they're strong enough)

- **Relayer suite: 39/39 green** — session lifecycle, caps, rate limits, name registry, forged-signature rejection, fail-closed after revoke.
- **Web engine E2E: green** — the actual browser file, real nacl derivation, consent verified end-to-end against a real relayer, deterministic restore proven (same wallet+salt → same pubkey).
- **Real devnet money pipeline** — user-funded 0.5 SOL: session wallet received, two shielded sends landed (recipient paid exactly the amount, session paid its own fees), atomic two-hop sweep delivered to the user's chosen wallet, session drained to zero. Explorer-verifiable signatures from that session (Sep 19, 2026).
- **Localnet rigs** — `web/test/localnet-e2e.sh` and `run-hop-localnet.sh` boot a validator and run the full pipeline; faucet-optional via `VANTA_E2E_SEED`.

## 6. Honest privacy limits (say it exactly this way in the demo/deck)

1. **The funding edge is public.** main → session is visible on-chain. Always. Physics of a public ledger unless you go full ZK. Vanta's privacy begins *after* the door.
2. **Session activity is linkable while it lives.** A session pubkey accumulates history until Burn. Rotation frequency is the tuning knob.
3. **Amounts are public** — until the Confidential Token Extensions phase (see §8), which encrypts transfer amounts at the protocol level. That's the next real privacy upgrade and the Path-A headline.
4. **The two-hop sweep is obfuscation**, not privacy. Keep it labeled that way or cut it from the demo.
5. Never use the words "untraceable/anonymity/mixer." The vocabulary is "private-by-default spending," "ephemeral session keys," "disclosed relayer, auditable."

---

## 7. Deployment state

- **Render (web):** static service serving `web/` — `https://vanta-web-2whu.onrender.com`. Publish directory `web`, no build command.
- **Render (relayer):** node service from repo root — `https://vanta-mobile-8ee4.onrender.com`, start command `node relayer/src/index.js` (or equivalent; check service settings). Free tier sleeps: first request after idle is slow (~30s) — mention it if demoing.
- **URL wiring:** `web/vanta-app.html` picks relayer by hostname (localhost → `http://localhost:8787`, else the Render relayer). RPC defaults to devnet; override with `window.VANTA_SOLANA_RPC`.
- **CORS:** relayer allows the web origin; if you add a new frontend host, add it to the relayer's allowlist or every POST 401s/preflights-fails.
- Git rule honored throughout: **no co-author/contributor lines anywhere.**

## 8. Remaining work before Oct 3 (priority order)

1. **Confidential Token Extensions (the Path-A headline)** — demo mint on devnet, encrypted-amount transfers end-to-end via `@solana/spl-token` confidential-transfer instructions; client-side ZK proof generation (ElGamal + range proofs) in the page — budget 2s/tx and load the wasm proof libs early. Days 4–7 of the plan.
2. **Names store durability** — registry is in-memory; a Render redeploy wipes claims. It's a sig-verified cache so any dumb durable box works — free-tier Postgres (Neon/Supabase) behind a tiny adapter, ~30 min, one env var. Do this before judges touch it.
3. **MWA / mobile wrap** — the agreed path is Solana Mobile's `webshell` (native WebView shell, NOT Bubblewrap/TWA — that guidance changed; verify against docs.solanamobile.com before building). Hosted frontend + MWA handshake for the Seed Vault.
4. **Persona sandbox** — KYC attestation hash written via the existing `/kyc` endpoint; relayer gate flips fail-closed. ~1 day.
5. **Demo video (2 min)** — open with the before/after: explorer showing a main-wallet tx vs. a session-wallet tx. No logo intro. Every claim must be tappable on screen.
6. **Pitch deck** — identity + privacy framing per §6's vocabulary.
7. **Cut list if time runs out:** chat feature (never built — fine), hop-sweep in the demo (labeled obfuscation; cut freely), KYC (ship the slot, gate the demo wording).

## 9. File-by-file quick reference for the next engineer (or future-you)

- `web/vanta-app.html` — all UI + app logic in one inline script. `wakeWallet()` is the entry point; `provisionSession()` → `engine.shieldOn`; `burnWallet()` is the only caller of sweep+rotate. Note `index.html` is a **build artifact copy** — edit `vanta-app.html`, re-copy.
- `web/vanta-engine.js` — `shieldOn` has two paths: deterministic (nacl, main wallet present) and random fallback (no nacl). The deterministic path is the one that matters; the fallback exists for test runners.
- `relayer/src/server.js` — routes are plain if-chains on `path`; add new endpoints following the same verify-then-act pattern.
- `relayer/src/names.js` + `web/test/web-engine.e2e.js` + `relayer/test/names.test.js` — the trust-chain reference: how signatures bind names, receive addresses, and live sessions together.

---

*Handoff ends here. The engine underneath is sound and tested. The product question — "why does a standalone wallet connect to Phantom" — is answered in §0, and every claim in §5 has a test or an explorer link behind it. Everything else is down the priority list in §8.*
