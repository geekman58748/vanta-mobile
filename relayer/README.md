# Vanta relayer

Fee/rent sponsor for Zolana transactions, plus the `/fund` gas float that keeps a
fresh privacy identity X able to pay for its own spends.

> **Why the app needs this at all:** the SDK requires `feePayer == shielded owner`
> for spends, so the relayer cannot pay for a Shadow or Ghost. What it *does* pay
> is registration rent, the Shield deposit's fee, and a small SOL float so X can
> act as its own fee payer. Full scope table in `HANDOFF.md` §2.4.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/healthz` | public | Liveness. Does **not** call the RPC. |
| GET | `/status` | public | Address, balance, database health. |
| GET | `/address` | public | Relayer pubkey. |
| POST | `/relay` | token | Fill the relayer's signer slot and submit a v1 tx. |
| POST | `/fund` | token | Send SOL from the relayer to an address (small identity float). |
| GET | `/tx/:address` | token | Transaction history for one address. |
| POST | `/tx/report` | token | Report a tx the relayer never saw (Shadow/Ghost/send). |
| GET | `/names/:name` | public | Resolve `ai.vanta` → owner address. |
| GET | `/names/available/:name` | public | Availability + validation reason. |
| GET | `/names/owned/:address` | public | Handles owned by an address. |
| POST | `/names/claim` | token | Register a handle. Requires an Ed25519 proof. |

## Postgres (Neon)

`DATABASE_URL` turns on two features; without it the relayer still runs and just
skips them.

1. **Transaction history.** The relayer is the authoritative observer of every
tx it sponsors, so it writes the row itself rather than trusting the client.
   **Coverage caveat:** Shadow and Ghost spends never touch the relayer (the SDK
   requires `feePayer == shielded owner`, so X pays its own fees). Those arrive
   via `POST /tx/report` and are stored as client-reported until the on-chain
   lookup confirms them — that's what `verified_on_chain` records.
2. **The `.vanta` name registry.** A handle resolves to a Vanta shielded
   identity. It is an app-level registry, not on-chain: SNS owns `.sol` and there
   is no `.vanta` TLD. It is a lookup convenience and must never be marketed as a
   privacy feature.

Schema is in `schema.sql`, applied idempotently on boot.

### ⚠ `maxSupportedTransactionVersion` must be 1

Zolana compiles every builder to a **v1** transaction. The conventional
`maxSupportedTransactionVersion: 0` makes the RPC refuse to decode them:

```
failed to get transaction: Transaction version (1) is not supported by the requesting client
```

That error is indistinguishable from "signature not found", so with `0` every
Zolana transaction silently reads as unverified forever. Verified live on devnet:
with `1`, a real Shield returns 5 static account keys and the correct fee payer.
This is the RPC-client twin of the v1 wallet-signing trap in `HANDOFF.md` §4.1.

### Testing

```bash
RELAYER_PORT=3999 RELAYER_TOKEN=testtoken node relayer/server.js &
TEST_TOKEN=testtoken node relayer/test-db.mjs
```

Covers schema bootstrap, name validation (including 2-char handles like `ai`),
the Ed25519 claim proof (forged vs valid), reserved names, one-name-per-identity,
on-chain verification of a real devnet signature, and token gating. It prints the
SQL to clean up after itself.

## Security posture

`/relay` and `/fund` are gated by `RELAYER_TOKEN` and the process **refuses to
start in production without it**. Without the token, `/fund` is an open faucet
that will drain the relayer.

Layered on top:

- **`/fund` caps** — per-request ceiling (`RELAYER_MAX_FUND_SOL`), a per-IP
  sliding window (`RELAYER_FUND_MAX_PER_WINDOW`, `RELAYER_FUND_LAMPORTS_PER_WINDOW`),
  and a global budget.
- **Program allowlist** (`/relay`) — the v1 message's static account keys are
  decoded and the tx is refused unless it touches a known program. Verified
  addresses only; see `RELAYER_ALLOWED_PROGRAMS`.
- **Fee-payer check** — the relayer must be slot 0; it will not co-sign a tx it
  isn't paying for.
- **Body cap** — 256 kB JSON, and a 1400-byte message ceiling.

**Stated limitations** (don't mistake this for hardened infrastructure):

1. The token ships inside the client bundle. It deters scanners and casual abuse,
   not a determined attacker. Real auth needs a per-user session the client
   can't forge.
2. Rate limits are in-memory and per-process. Run **one** machine.
3. If the v1 message parser throws, `/relay` logs and allows, because a parser
   bug would otherwise brick the demo. A crafted malformed message therefore
   bypasses the allowlist. Disable the check entirely with
   `RELAYER_ENFORCE_PROGRAMS=0` if it ever misbehaves under time pressure.

## Local run

```bash
cd relayer
npm install            # or rely on the root node_modules — resolution walks up
node server.js
```

No `RELAYER_TOKEN` locally: the server prints a loud warning and leaves the
endpoints open so `npm run dev` works with zero setup.

## Deploy (Fly.io, ~$4/month, no cold starts)

```bash
cd relayer
fly launch --no-deploy          # pick a unique app name; update fly.toml if needed
fly secrets set RELAYER_KEYPAIR="$(cat relayer-keypair.json)"
fly secrets set RELAYER_TOKEN="$(openssl rand -hex 32)"
fly secrets set DATABASE_URL="postgresql://...@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require"
fly deploy
fly logs                        # expect: allowlist on, Postgres connected, no token warning
```

Then point the app at it:

```bash
# .env.local
VITE_RELAYER_URL=https://<your-app>.fly.dev
VITE_RELAYER_TOKEN=<the same hex token>
```

```bash
npm run build:android && cd android && ./gradlew :app:assembleRelease
```

**Rotate the committed keypair before deploying.** `relayer/relayer-keypair.json`
has been in git history; generate a fresh one, fund it, and set it as a secret:

```bash
node -e "const{Keypair}=require('@solana/web3.js');const k=Keypair.generate();console.log(JSON.stringify(Array.from(k.secretKey)))"
```

`RELAYER_KEYPAIR` accepts either a JSON array or a base58 string.

## Verify a deployment

```bash
curl -s https://<your-app>.fly.dev/healthz                 # {"ok":true}
curl -s https://<your-app>.fly.dev/status                  # address + balance

# must be 401 — if this returns a signature, /fund is open to the internet
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' \
  -d '{"address":"11111111111111111111111111111111","amount":0.01}' \
  https://<your-app>.fly.dev/fund
```
