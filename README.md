# VANTA

A mobile privacy utility for Solana Seeker. One toggle shields your main
wallet: when ON, VANTA provisions a disposable session key so dApps and
merchants interact with a temporary pubkey — never your Seed Vault address,
balance, or history. When OFF (or on kill-switch), the session is revoked,
unspent headroom is reported, and local session state is wiped.

> Built for the Solana Mobile CLOCK IN hackathon. Status: work in progress.

VANTA is a **privacy / session-key utility** tied to a disclosed, auditable
relayer. It is not an anonymity or mixing service.

## Repo layout

```
web/                  Hosted web UI (HTML/CSS/Three.js) — wrapped via
                      solana-mobile webshell for the dApp Store build
src/session/          Client session engine: disposable keypair lifecycle,
                      signed session creation, kill-switch wipe
src/stealth/          Stealth-address crypto experiments (not yet wired)
relayer/              Session verification + fee-payer co-signing API.
                      Server-side only — never bundled into the client.
```

## Quickstart

### Relayer

```bash
cd relayer
node --test        # 25 tests
node src/index.js  # starts on :8787 in DRY RUN (co-sign disabled)
```

Dry run is the default and is fail-closed: the full session lifecycle and
every risk control are enforced, but co-signing refuses until a hot wallet
keypair is configured (`VANTA_HOT_WALLET_KEYPAIR_PATH`). See
[relayer/README.md](relayer/README.md) for the full API and the hard-cap
table (per-session spend, per-tx, global, per-IP rate limits, TTL).

### Web UI

Served from `web/index.html` (also deployed as a static site — see
`render.yaml`). The power button drives the real session engine against the
relayer: provision (with main-wallet consent signature, verified server-side)
→ shielded → revoke.

While a session is ACTIVE, the transfer panel runs the money pipeline through
the session key (`web/vanta-chain.js`):

- **Shielded send (SOL / USDC)** — built, signed and sent by the session key
  only. Fee-payer = signer = session pubkey. The recipient and any block
  explorer see only the session address; the main wallet is absent from the tx.
- **Top up** — main wallet funds the session wallet via an extension-signed
  transfer. The relayer is never a party to it.
- **Faucet** — devnet funding helper.
- **Sweep-back on kill** — pressing the power button OFF first returns the
  session wallet's remaining balance to the main wallet (session-key-signed),
  then the key is wiped. Best-effort and surfaced honestly if it fails.

### End-to-end proof

The full pipeline is exercised against a real Solana validator with the real
shipped code (no mocks in the money path):

```bash
bash web/test/localnet-e2e.sh   # boots solana-test-validator, runs the pipeline
# or: VANTA_E2E_RPC=<rpc-url> node web/test/chain.e2e.js
```

Covers: fund → shielded send (exact amount, session key as sole signer) →
sweep-back (main wallet receives remainder, session wallet drains to zero).

### Mobile shell

```bash
npm install
npm run android    # Expo dev build
```

## Security model

- Main-wallet secrets never leave the device. Anything requiring the main
  wallet is signed through the connected wallet (extension on desktop,
  Seed Vault / MWA on device).
- Session keys are generated in memory only. There is no persistence:
  app restart = key gone = session worthless. That is the safe failure mode.
- Session creation is signed by the session key itself and verified
  server-side before any state exists.
- Main-wallet consent for shielding is a signed, human-readable message;
  the relayer rejects sessions whose consent signature does not verify.
- In the current self-funded mode the session key pays its own fees, so the
  relayer holds no funds and takes no custody. The fee-fronting relayer
  (co-sign path) stays fail-closed (dry-run) until deliberately enabled,
  with hard server-side caps as specified in `relayer/README.md`.

## Scope, stated honestly

- Shielded sends through the session key work end-to-end (proven by the e2e
  above). This is distinct-pubkey privacy: counterparties see the session
  key, not you.
- Transactions you make directly inside your wallet app (outside Vanta) are
  signed by your main key and are NOT shieldable retroactively.
- The relayer co-sign path is dry-run by design: caps enforced, co-sign
  refuses until a funded hot wallet is explicitly configured.
- No ZK, no mixing, no pooling. The relayer is disclosed and auditable —
  this is a session-key privacy utility, not an anonymity service.

## License

MIT
