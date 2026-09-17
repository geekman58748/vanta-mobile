#!/usr/bin/env bash
# Patiently waits out the devnet faucet rate limit, then runs the e2e test.
# The test itself regenerates its own keypair each run, so this pre-funds a
# fixed keypair and exports it for the e2e to adopt when the faucet allows.
set -u
cd "$(dirname "$0")/../.."   # repo root (vanta-mobile)

KEYPAIR_FILE=/tmp/vanta_e2e_keypair.json
PK_FILE=/tmp/vanta_e2e_pk.txt

node -e "
const crypto = require('crypto');
const fs = require('fs');
if (!fs.existsSync('$KEYPAIR_FILE')) {
  const kp = crypto.generateKeyPairSync('ed25519');
  const raw = kp.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const secret = kp.privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(16);
  fs.writeFileSync('$KEYPAIR_FILE', JSON.stringify([raw, secret].map(b => Array.from(b))));
  const { encode } = require('./src/util/base58.js');
  fs.writeFileSync('$PK_FILE', encode(raw));
}
"
PK=$(cat "$PK_FILE")
echo "target pubkey: $PK"

for i in $(seq 1 40); do
  CODE=$(curl -s -o /tmp/vanta_airdrop_resp.txt -w "%{http_code}" --max-time 30 \
    -X POST https://api.devnet.solana.com \
    -H "content-type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"requestAirdrop","params":["'"$PK"'",1000000000]}')
  if [ "$CODE" = "200" ]; then
    echo "airdrop accepted (attempt $i)"
    echo "RUN_E2E_NOW"
    exit 0
  fi
  echo "attempt $i: HTTP $CODE — waiting 45s"
  sleep 45
done
echo "GAVE_UP"
exit 1
