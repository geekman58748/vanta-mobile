#!/usr/bin/env bash
# MWA end-to-end against the **v1** fakewallet build.
#
# Why this script looks the way it does:
#   * The legacy and v1 fakewallet builds lay their AUTHORIZE button out at
#     different y positions, so hardcoded coordinates silently tap empty space.
#     Instead the button is located from the accessibility tree by resource id
#     (`…:id/btn_authorize`) on every prompt.
#   * `uiautomator dump` is only ever run while *fakewallet* is foreground, where
#     it is fast. Dumping Vanta's animating WebView is what made earlier attempts
#     take many seconds per pass.
#   * Vanta's own UI (onboarding, Shield) is driven over CDP, which is exact.
#
# Usage: ./scripts/mwa-v1-e2e.sh [--shield]
set -uo pipefail

SERIAL="${ANDROID_SERIAL:-emulator-5554}"
APP=com.vanta.privacywallet
WALLET_APP=com.solana.mobilewalletadapter.fakewallet
RELAYER=http://localhost:3001
DIR="$(cd "$(dirname "$0")" && pwd)"
DO_SHIELD="${1:-}"

adb() { command adb -s "$SERIAL" "$@"; }
focus() { adb shell dumpsys window 2>/dev/null | grep -m1 -i mCurrentFocus; }
wallet_fg() { case "$(focus)" in *"$WALLET_APP"*) return 0 ;; *) return 1 ;; esac; }

inspect() { command node "$DIR/webview-inspect.mjs" "$1" 2>/dev/null | tail -1; }

# Tap fakewallet's primary action, located by resource id rather than position.
tap_authorize() {
  adb shell uiautomator dump /sdcard/wa.xml >/dev/null 2>&1 || return 1
  local b n
  b=$(adb shell cat /sdcard/wa.xml 2>/dev/null | tr '>' '\n' |
    grep 'btn_authorize' | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | head -1)
  [ -z "$b" ] && return 1
  n=$(echo "$b" | grep -o '[0-9]\+' | tr '\n' ' ')
  set -- $n
  local cx=$((((${1:-0} + ${3:-0}) / 2))) cy=$((((${2:-0} + ${4:-0}) / 2)))
  echo "    AUTHORIZE at ($cx,$cy)"
  adb shell input tap "$cx" "$cy"
  return 0
}

# Answer wallet prompts until $1 (a CDP expression) is satisfied or we time out.
answer_until() {
  local expr="$1" budget="$2" label="$3"
  for i in $(seq 1 "$budget"); do
    if wallet_fg; then
      tap_authorize >/dev/null || true
      sleep 1
    fi
    local out
    out=$(inspect "$expr")
    if [ -n "$out" ] && [ "$out" != "null" ] && [ "$out" != "false" ] && [ "$out" != "undefined" ]; then
      echo "  ${label}: satisfied after ${i}s -> $out"
      return 0
    fi
    sleep 1
  done
  echo "  ${label}: TIMED OUT after ${budget}s (last: $out)"
  return 1
}

echo "== reset =="
adb shell am force-stop "$WALLET_APP"
adb shell am force-stop "$APP"
sleep 2
adb shell am start -n "$APP/.MainActivity" >/dev/null
echo "  waiting for the WebView to render"
sleep 25

echo "== connect device wallet =="
inspect "(function(){var b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('Connect device wallet'));if(!b)return 'no-button';b.click();return 'clicked'})()"
answer_until "localStorage.getItem('vanta-wallet')" 90 "connect"

ADDR=$(inspect "(function(){var w=localStorage.getItem('vanta-wallet');return w?JSON.parse(w).publicKey:''})()")
echo "  connected address: $ADDR"

if [ -z "$ADDR" ] || [ "$ADDR" = "null" ]; then
  echo "  ✗ no address — aborting"; exit 1
fi

echo "== fund the connected wallet =="
BAL=$(curl -s --max-time 12 https://api.devnet.solana.com -X POST -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getBalance\",\"params\":[\"$ADDR\"]}" |
  python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["value"])' 2>/dev/null)
echo "  balance: $BAL lamports"
if [ "${BAL:-0}" -lt 300000000 ]; then
  echo "  requesting 1 SOL from the relayer…"
  curl -s --max-time 30 -X POST "$RELAYER/fund" -H 'Content-Type: application/json' \
    -d "{\"address\":\"$ADDR\",\"amount\":1}" || true
  echo
  sleep 6
  BAL=$(curl -s --max-time 12 https://api.devnet.solana.com -X POST -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getBalance\",\"params\":[\"$ADDR\"]}" |
    python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["value"])' 2>/dev/null)
  echo "  balance after fund: $BAL lamports"
fi

if [ "$DO_SHIELD" != "--shield" ]; then
  echo "== done (pass --shield to also run a Shield) =="
  exit 0
fi

echo "== shield =="
BEFORE=$(curl -s --max-time 12 https://api.devnet.solana.com -X POST -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getBalance\",\"params\":[\"$ADDR\"]}" |
  python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["value"])' 2>/dev/null)
echo "  balance before: $BEFORE"

# Match the action-row button by its amount, not by a bare `Shield` prefix: the
# header status badge also reads "Shielded" and would be matched first, which
# makes a click report `busy`/`clicked` while doing nothing to the real button.
inspect "(function(){var b=[...document.querySelectorAll('button')].find(x=>/^Shield\\s+\\d/.test(x.innerText.trim()));if(!b)return 'no-button';if(b.disabled)return 'busy';b.click();return 'clicked:'+b.innerText.replace(/\\s+/g,' ').trim()})()"

# The wallet opens for the sign request; approve, then wait for the balance to move.
for i in $(seq 1 90); do
  if wallet_fg; then tap_authorize >/dev/null || true; sleep 1; fi
  NOW=$(curl -s --max-time 12 https://api.devnet.solana.com -X POST -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getBalance\",\"params\":[\"$ADDR\"]}" |
    python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["value"])' 2>/dev/null)
  if [ -n "$NOW" ] && [ "$NOW" != "$BEFORE" ]; then
    echo "  ✅ BALANCE MOVED at ${i}s: $BEFORE -> $NOW lamports"
    break
  fi
  [ $((i % 10)) -eq 0 ] && echo "  … ${i}s, still $NOW"
  sleep 1
done
echo "  balance after: $NOW"
