#!/usr/bin/env bash
# Fully coordinate-driven MWA Shield end-to-end — no CDP, no uiautomator.
#
# Two tooling problems kept masking the real bug:
#   * the CDP watcher raced the WebView's devtools socket and died on startup
#   * `uiautomator dump` hangs for many seconds on Vanta's continuously
#     animating background, so it can never answer a prompt in time
#
# Both the in-app Shield button and fakewallet's AUTHORIZE sit at fixed
# coordinates on this 1080x2400 AVD, and a cheap `dumpsys window` focus check
# keeps taps from landing on the app underneath the wallet. logcat is captured
# in the same shell session so it is not reaped when the tool call returns.
#
# Usage: ./scripts/mwa-e2e-tap.sh [seconds]
set -uo pipefail

SERIAL="${ANDROID_SERIAL:-emulator-5554}"
APP=com.vanta.privacywallet
WALLET_APP=com.solana.mobilewalletadapter.fakewallet
WALLET=5mmqHvZJDYFktC7Pna87gpeiVxVZk4k9YGvnYrQsdbys
SECS="${1:-150}"
LC=/tmp/mwa-lc.txt

# Coordinates measured from the accessibility tree at 1080x2400.
SHIELD_X=246; SHIELD_Y=944
AUTH_X=208;  AUTH_Y=672

adb() { command adb -s "$SERIAL" "$@"; }

focus() { adb shell dumpsys window 2>/dev/null | grep -m1 -i mCurrentFocus; }

balance() {
  curl -s --max-time 12 https://api.devnet.solana.com -X POST \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getBalance\",\"params\":[\"$WALLET\"]}" |
    python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["value"])' 2>/dev/null
}

wallet_visible() { case "$(focus)" in *fakewallet*) return 0 ;; *) return 1 ;; esac; }

adb logcat -c 2>/dev/null
adb logcat -v time > "$LC" 2>&1 &
LC_PID=$!

echo "== reset =="
adb shell am force-stop "$WALLET_APP"
adb shell am force-stop "$APP"
sleep 2
adb shell am start -n "$APP/.MainActivity" >/dev/null
echo "  waiting for the WebView to render"
sleep 25

echo "== phase 1: drain any re-authorization prompt (<=40s) =="
for i in $(seq 1 20); do
  wallet_visible && { adb shell input tap $AUTH_X $AUTH_Y; echo "  [$i] answered a prompt"; }
  sleep 2
done

before=$(balance)
echo "== balance before: $before lamports =="

echo "== phase 2: tap Shield at ($SHIELD_X,$SHIELD_Y) =="
adb shell input tap $SHIELD_X $SHIELD_Y

echo "== phase 3: approve the sign prompt, watch for the deposit =="
moved=0
for i in $(seq 1 "$SECS"); do
  if wallet_visible; then
    adb shell input tap $AUTH_X $AUTH_Y
    echo "  [$i] tapped AUTHORIZE"
    sleep 1
  fi
  if [ $((i % 5)) -eq 0 ]; then
    cur=$(balance)
    if [ -n "$cur" ] && [ "$cur" != "$before" ]; then
      echo "  ✅ BALANCE MOVED at ${i}s: $before -> $cur lamports"
      moved=1
      break
    fi
    echo "  [$i] still $cur"
  fi
  sleep 0.5
done

echo "== balance after: $(balance) lamports (moved=$moved) =="
echo
echo "== fakewallet / MWA logcat =="
grep -iE "fakewallet|mobilewallet|MobileWalletAdapter|association|websocket|SolanaWalletAdapter|MobileWalletAdapterService|Unauthorized|declined|signTransaction" "$LC" | tail -50
echo
echo "== app webview logcat =="
grep -iE "chromium|console|vanta" "$LC" | tail -20

kill "$LC_PID" 2>/dev/null
