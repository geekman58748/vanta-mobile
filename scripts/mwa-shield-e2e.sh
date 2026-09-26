#!/usr/bin/env bash
# One-shot end-to-end MWA Shield: restart the app, run the CDP watcher (which clicks
# Shield and streams the WebView console), and independently poll for fakewallet's
# AUTHORIZE prompt so the session is answered the moment it opens.
#
# Splitting click and approval matters: the watch loop logs *why* the app stalled,
# while the tap loop is fast enough to beat the session timeout. A single script
# doing both sequentially always answers one prompt too late.
#
# Usage: ./scripts/mwa-shield-e2e.sh [seconds]
set -uo pipefail

SERIAL="${ANDROID_SERIAL:-emulator-5554}"
APP=com.vanta.privacywallet
WALLET_APP=com.solana.mobilewalletadapter.fakewallet
WALLET=5mmqHvZJDYFktC7Pna87gpeiVxVZk4k9YGvnYrQsdbys
SECS="${1:-160}"
CDP_LOG=/tmp/mwa-cdp.log
DIR="$(cd "$(dirname "$0")" && pwd)"

adb() { command adb -s "$SERIAL" "$@"; }

balance() {
  curl -s --max-time 12 https://api.devnet.solana.com -X POST \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getBalance\",\"params\":[\"$WALLET\"]}" |
    python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["value"])' 2>/dev/null
}

# Tap fakewallet's AUTHORIZE using fixed coordinates rather than a uiautomator
# dump: the Vanta WebView animates continuously (`TopoWaves`), and uiautomator's
# wait-for-idle makes every dump take many seconds — far too slow to answer a
# session prompt. The button sits at the same place on every prompt, and the
# foreground check keeps the tap from landing on the app underneath.
AUTHORIZE_X=208
AUTHORIZE_Y=672

tap_authorize() {
  local f
  f=$(adb shell dumpsys window 2>/dev/null | grep -m1 -i 'mCurrentFocus')
  case "$f" in *fakewallet*) ;; *) return 1 ;; esac
  adb shell input tap "$AUTHORIZE_X" "$AUTHORIZE_Y"
  return 0
}

echo "== reset =="
adb shell am force-stop "$WALLET_APP"; adb shell am force-stop "$APP"
sleep 2
adb shell am start -n "$APP/.MainActivity" >/dev/null

# The watcher resolves the WebView's devtools socket from the app's pid, so it
# must not start until the process actually exists.
PID=""
for i in $(seq 1 30); do
  PID=$(adb shell pidof "$APP" 2>/dev/null | tr -d '\r')
  [ -n "$PID" ] && { echo "  app process up after ${i} checks (pid $PID)"; break; }
  sleep 1
done

# The process existing is not enough: the WebView only registers its devtools
# socket once it has actually created one, and a forward to a socket that does not
# exist yet accepts the TCP connection then drops it (`other side closed`).
for i in $(seq 1 30); do
  if adb shell cat /proc/net/unix 2>/dev/null | grep -q "webview_devtools_remote_${PID}"; then
    echo "  devtools socket up after ${i} checks"
    break
  fi
  sleep 1
done

echo "== start CDP watcher =="
cd "$DIR/.."
nohup env DURATION=$((SECS * 1000)) node scripts/mwa-shield-test.mjs > "$CDP_LOG" 2>&1 &
WATCHER=$!
echo "  watcher pid $WATCHER"

before=$(balance)
echo "== balance before: $before =="

echo "== approve/countdown loop =="
for i in $(seq 1 "$SECS"); do
  if tap_authorize; then echo "  [$i] approved a prompt"; fi
  # Balance only every 6th pass: each uiautomator dump costs ~1.5s, and polling
  # RPC on every pass would make the approval loop too slow to beat the session.
  if [ $((i % 6)) -eq 0 ]; then
    cur=$(balance)
    if [ -n "$cur" ] && [ "$cur" != "$before" ]; then
      echo "  ✅ BALANCE MOVED at ${i}s: $before -> $cur lamports"
      break
    fi
    echo "  [$i] still $cur lamports"
  fi
  sleep 0.5
done

echo "== balance after: $(balance) =="
echo
echo "== CDP log =="
cat "$CDP_LOG"
kill "$WATCHER" 2>/dev/null
