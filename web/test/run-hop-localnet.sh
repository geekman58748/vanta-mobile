#!/usr/bin/env bash
# One-shot LOCAL two-hop private-sweep proof for VANTA.
#
# Boots solana-test-validator (unlimited airdrops), funds the session key,
# runs web/test/hop-sweep.js (session → ephemeral X → recipient), then shuts
# the validator down. Same wire protocol as devnet/mainnet.
#
# Usage: bash web/test/run-hop-localnet.sh [recipientPubkey]
#   (recipient defaults to a fresh throwaway key)
set -uo pipefail
cd "$(dirname "$0")/../.."   # repo root (vanta-mobile)

LEDGER=$(mktemp -d /tmp/vanta_hop_ledger.XXXXXX)
VPID=""

cleanup() {
  [ -n "$VPID" ] && kill "$VPID" 2>/dev/null
  wait "$VPID" 2>/dev/null
  rm -f /tmp/vanta_hop_key.b58
  echo "VALIDATOR_STOPPED"
}
trap cleanup EXIT

echo "booting solana-test-validator (ledger: $LEDGER)…"
solana-test-validator --ledger "$LEDGER" --reset > /tmp/vanta_hop_validator.log 2>&1 &
VPID=$!

for _ in $(seq 1 30); do
  sleep 1
  solana cluster-version -u http://127.0.0.1:8899 >/dev/null 2>&1 && break
done
if ! solana cluster-version -u http://127.0.0.1:8899 >/dev/null 2>&1; then
  echo "validator failed to start — see /tmp/vanta_hop_validator.log"
  exit 1
fi
echo "validator healthy"

# Session key = the shared devnet test seed; fund it locally (no faucet caps).
SEED="$(cat /tmp/vanta_devnet_seed.txt)"
PK="$(node -e "
const s=Buffer.from(process.argv[1],'hex').subarray(32);
const A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
let n=0n; for(const b of s) n=n*256n+BigInt(b);
let o=''; while(n>0n){o=A[Number(n%58n)]+o;n/=58n;}
for(const b of s){if(b!==0)break;o='1'+o;}
console.log(o);
" "$SEED")"

solana airdrop 1 "$PK" -u http://127.0.0.1:8899 | head -1

# Recipient: argument, or a fresh throwaway key.
RCP="${1:-$(node -e "
const c=require('crypto');
const k=c.generateKeyPairSync('ed25519');
const d=k.publicKey.export({type:'spki',format:'der'}).subarray(-32);
const A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
let n=0n; for(const b of d) n=n*256n+BigInt(b);
let o=''; while(n>0n){o=A[Number(n%58n)]+o;n/=58n;}
for(const b of d){if(b!==0)break;o='1'+o;}
console.log(o);
")}"
echo "localnet recipient: $RCP"

VANTA_E2E_RPC=http://127.0.0.1:8899 VANTA_E2E_SEED="$SEED" \
  node web/test/hop-sweep.js "$RCP" 2>&1 | grep -v Experimental
