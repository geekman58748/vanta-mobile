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
`render.yaml`). The toggle currently drives the UI state machine; wiring it
to the engine's `shieldOn`/`shieldOff` against a running relayer is the next
integration step.

### Mobile shell

```bash
npm install
npm run android    # Expo dev build
```

## Security model

- Main-wallet secrets never leave the device. Anything requiring the main
  wallet is signed through an injected Seed Vault callback.
- Session keys are generated in memory only. There is no persistence:
  app restart = key gone = session worthless. That is the safe failure mode.
- Session creation is signed by the session key itself and verified
  server-side before any state exists.
- The relayer is the only fee-payer and enforces hard caps server-side;
  the client is never trusted.

## License

MIT
