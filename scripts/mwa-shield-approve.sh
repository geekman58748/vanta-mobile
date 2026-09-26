#!/usr/bin/env bash
# Drive a full MWA Shield end-to-end on the emulator: click Shield in the app,
# wait for fakewallet's sign prompt, approve it within the session window, then
# confirm the deposit actually landed on devnet.
#
# Why this exists: the association handshake completes and the wallet really does
# receive the deposit payload, but it waits on a human tap. Approving by hand is
# too slow — the dapp's session gives up first — so the approval has to be timed
# from the watcher rather than from the person running it.
#
# Usage: ./scripts/mwa-shield-approve.sh [seconds-to-watch]
set -uo pipefail

SERIAL="${ANDROID_SERIAL:-emulator-5554}"
WALLET="5mmqHvZJDYFktC7Pna87gpeiVxVZk4k9YGvnYrQsdbys"
WATCH="${1:-150}"
LOG=/tmp/mwa-shield-approve.log

adb() { command adb -s "$SERIAL" "$@"; }
fg() { adb shell dumpsys activity activities 2>/dev/null | grep -m1 -i topResumedActivity; }
balance() {
  curl -s --max-time 12 https://api.devnet.solana.com -X POST \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getBalance\",\"params\":[\"$WALLET\"]}" |
    python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["value"])'
}

echo "balance before: $(balance) lamports"

# Start with a clean wallet screen so we never tap a stale prompt.
adb shell am force-stop com.solana.mobilewalletadapter.fakewallet

cd "$(dirname "$0")/.."
nohup env DURATION=$((WATCH * 1000)) node scripts/mwa-shield-test.mjs >"$LOG" 2>&1 &
TESTPID=$!
echo "cdp watcher pid $TESTPID"

approve_prompt() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || return 1
  local b
  b=$(adb shell cat /sdcard/ui.xml 2>/dev/null | tr '>' '\n' |
    grep 'btn_authorize' | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | head -1)
  [ -z "$b" ] && return 1
  # bounds="[x1,y1][x2,y2]" -> center. Greedy `sed` anchoring on `.*\[` grabs the
  # *second* pair for both captures, so pull the numbers out positionally instead.
  local n
  n=$(echo "$b" | grep -o '[0-9]\+' | tr '\n' ' ')
  set -- $n
  local cx=$((((${1:-0} + ${3:-0}) / 2))) cy=$((((${2:-0} + ${4:-0}) / 2)))
  echo "AUTHORIZE bounds=$b -> tap ($cx,$cy)"
  adb shell input tap "$cx" "$cy"
  return 0
}

# Only start hunting for the prompt *after* the app has fired the transaction —
# otherwise a cached re-authorization prompt gets tapped instead of the sign prompt.
for i in $(seq 1 $((WATCH + 20))); do
  grep -q '▶ clicking Shield' "$LOG" 2>/dev/null && break
  sleep 1
done
echo "shield clicked at ${i}s; hunting for the sign prompt"

for i in $(seq 1 90); do
  if approve_prompt; then
    echo "approved (${i}s after click)"
    break
  fi
  sleep 1
done

sleep 10
echo "foreground after: $(fg)"
echo "balance after:  $(balance) lamports"
echo
echo "=== cdp watcher log (tail) ==="
tail -35 "$LOG"
kill "$TESTPID" 2>/dev/null
