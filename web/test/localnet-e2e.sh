#!/usr/bin/env bash
# One-shot LOCAL end-to-end proof for the VANTA money pipeline.
#
# Boots solana-test-validator (unlimited airdrops, no faucet), runs the REAL
# web/vanta-chain.js against it (airdrop → shielded send → sweep-back), then
# shuts the validator down. Same wire protocol as devnet/mainnet — the only
# difference is who mints the SOL.
#
# Usage: bash web/test/localnet-e2e.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

VALIDATOR_PID=""
LEDGER_DIR=""

cleanup() {
  if [ -n "$VALIDATOR_PID" ] && kill -0 "$VALIDATOR_PID" 2>/dev/null; then
    kill "$VALIDATOR_PID" 2>/dev/null || true
    wait "$VALIDATOR_PID" 2>/dev/null || true
  fi
  if [ -n "$LEDGER_DIR" ] && [ -d "$LEDGER_DIR" ]; then
    rm -rf "$LEDGER_DIR"
  fi
}
trap cleanup EXIT

# Reuse an already-running local validator if one is listening on 8899.
if curl -s --max-time 3 -X POST http://127.0.0.1:8899 -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' 2>/dev/null | grep -q '"ok"'; then
  echo "reusing existing local validator on :8899"
else
  LEDGER_DIR=$(mktemp -d /tmp/vanta-test-ledger.XXXXXX)
  echo "booting solana-test-validator (ledger: $LEDGER_DIR)…"
  solana-test-validator --ledger "$LEDGER_DIR" --reset >/tmp/vanta-validator.log 2>&1 &
  VALIDATOR_PID=$!

  for i in $(seq 1 60); do
    if curl -s --max-time 2 -X POST http://127.0.0.1:8899 -H 'content-type: application/json' \
         -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' 2>/dev/null | grep -q '"ok"'; then
      echo "validator healthy (attempt $i)"
      break
    fi
    sleep 1
    if [ "$i" = "60" ]; then
      echo "validator failed to become healthy — log tail:"
      tail -20 /tmp/vanta-validator.log || true
      exit 1
    fi
  done
fi

VANTA_E2E_RPC=http://127.0.0.1:8899 node web/test/chain.e2e.js
