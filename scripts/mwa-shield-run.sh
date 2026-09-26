#!/usr/bin/env bash
# End-to-end MWA Shield on the emulator, in the order a human would do it:
#
#   1. let the app's cached re-authorization finish (tapping any AUTHORIZE prompt)
#   2. tap Shield — this builds the deposit and opens a *second* wallet session
#   3. answer the sign prompt, then confirm the deposit landed on devnet
#
# Approving out of order is what made earlier attempts look like a signing bug:
# the re-auth prompt and the sign prompt are the same AUTHORIZE button, so tapping
# too early consumes the wrong one and the shield session times out unanswered.
#
# The Vanta WebView exposes its DOM to Android's accessibility tree, so both the
# in-app Shield button and fakewallet's AUTHORIZE can be driven with plain taps —
# no CDP session, which makes this work against release builds too.
#
# Usage: ./scripts/mwa-shield-run.sh [iterations]
set -uo pipefail

SERIAL="${ANDROID_SERIAL:-emulator-5554}"
APP=com.vanta.privacywallet
WALLET_APP=com.solana.mobilewalletadapter.fakewallet
WALLET=5mmqHvZJDYFktC7Pna87gpeiVxVZk4k9YGvnYrQsdbys
ITER="${1:-70}"

adb() { command adb -s "$SERIAL" "$@"; }

balance() {
  curl -s --max-time 12 https://api.devnet.solana.com -X POST \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getBalance\",\"params\":[\"$WALLET\"]}" |
    python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["value"])' 2>/dev/null
}

# Tap the first *enabled* node whose text starts with $1. Returns 0 when it tapped.
tap_text() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || return 1
  local line b n
  line=$(adb shell cat /sdcard/ui.xml 2>/dev/null | tr '>' '\n' |
    grep "text=\"$1" | grep 'clickable="true"' | grep -v 'enabled="false"' | head -1)
  [ -z "$line" ] && return 1
  b=$(echo "$line" | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"')
  [ -z "$b" ] && return 1
  n=$(echo "$b" | grep -o '[0-9]\+' | tr '\n' ' ')
  set -- $n
  local cx=$((((${1:-0} + ${3:-0}) / 2))) cy=$((((${2:-0} + ${4:-0}) / 2)))
  echo "  tap \"$1…\" at ($cx,$cy)"
  adb shell input tap "$cx" "$cy"
  return 0
}

echo "== resetting both apps =="
adb shell am force-stop "$WALLET_APP"
adb shell am force-stop "$APP"
sleep 2
adb shell am start -n "$APP/.MainActivity" >/dev/null

echo "== waiting for the app UI =="
for i in $(seq 1 30); do
  tap_text 'Shield' >/dev/null 2>&1 && { echo "  UI ready after ${i} checks"; break; }
  sleep 3
done

echo "== phase 1: drain any cached re-authorization prompt =="
quiet=0
for i in $(seq 1 30); do
  if tap_text 'AUTHORIZE' >/dev/null; then quiet=0; else quiet=$((quiet + 1)); fi
  [ "$quiet" -ge 4 ] && break
  sleep 2
done
echo "  re-auth settled after ${i} checks"

before=$(balance)
echo "== balance before: $before lamports =="

echo "== phase 2: tap Shield =="
for i in $(seq 1 12); do
  if tap_text 'Shield 0.1'; then echo "  shield tapped"; break; fi
  sleep 2
done

echo "== phase 3: approve the sign prompt, watch for the deposit =="
for i in $(seq 1 "$ITER"); do
  tap_text 'AUTHORIZE' >/dev/null && echo "  tapped sign prompt at ${i}"
  cur=$(balance)
  if [ -n "$cur" ] && [ "$cur" != "$before" ]; then
    echo "  ✅ BALANCE MOVED: $before -> $cur lamports"
    break
  fi
  [ $((i % 10)) -eq 0 ] && echo "  … ${i} checks, still $cur"
  sleep 2
done

echo "== balance after: $(balance) lamports =="
