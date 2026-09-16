# VANTA Relayer

Session verification + fee-payer co-signing for VANTA. **Server-side only** —
this logic is never bundled into the client.

## What it does

- `POST /v1/session` — verify an ed25519 `createSignature` made by a freshly
  provisioned **session key**, then open a session with hard limits.
- `POST /v1/session/:id/cosign` — co-sign a spend **only** if every cap passes.
- `POST /v1/session/:id/revoke` — kill-switch. Idempotent. Reports unspent
  headroom (`cap − spent`).
- `GET /v1/session/:id` — status (live, spent, cap).
- `GET /healthz` — mode (`dry_run`/`live`), active sessions, cap snapshot.

## Risk controls (hard requirements, enforced server-side)

| Cap | Env var | Default |
|---|---|---|
| Max spend per session | `VANTA_MAX_SESSION_SPEND_LAMPORTS` | 0.1 SOL |
| Max single tx | `VANTA_MAX_TX_LAMPORTS` | 0.05 SOL |
| Global concurrent spend | `VANTA_GLOBAL_CAP_LAMPORTS` | 5 SOL |
| Concurrent sessions per IP | `VANTA_MAX_SESSIONS_PER_IP` | 3 |
| Session creates / min / IP | `VANTA_SESSION_CREATES_PER_MINUTE_PER_IP` | 10 |
| Co-signs / min / session | `VANTA_COSIGNS_PER_MINUTE_PER_SESSION` | 30 |
| Session TTL | `VANTA_SESSION_TTL_SECONDS` | 900 |
| Request body cap | `VANTA_MAX_BODY_BYTES` | 64 KiB |

The hot wallet is **fail-closed**: without `VANTA_HOT_WALLET_KEYPAIR_PATH` the
relayer runs in dry run — full session lifecycle and caps are enforced, but
every co-sign returns `503 dry_run`. A refused co-sign rolls back the cap
reservation so clients are never charged for a failed signature.

## Security model

- The relayer never sees main-wallet secrets. Session creation is signed by
  the *session key itself* (`vanta-session-create-v1` domain-separated
  message) and verified before any state is created.
- Sessions are in-memory and die on restart — the safe failure mode for a
  short-lived privacy utility.
- Kill-switch (`/revoke`) is idempotent; clients wipe local key material
  regardless of network outcome.

## Run

```bash
node src/index.js          # dry run on :8787
node --test                # 25 tests
```

## Framing (do not change)

VANTA is a **privacy/session-key utility** tied to a disclosed, auditable
relayer. It is not an anonymity or mixing service; keep docs, UI copy, and
design decisions on the defensible side of that line.
