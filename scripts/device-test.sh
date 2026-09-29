#!/usr/bin/env bash
# Set up a REAL Android phone (over USB) to run Vanta against this Mac.
#
# Why `adb reverse` and not a LAN IP:
#   MWA (and the ZK prover) require a *secure context*. Chrome treats
#   `http://localhost` as potentially trustworthy but a plain-http LAN address
#   like `http://192.168.1.20:3000` is NOT, so `isSecureContext` becomes false
#   and wallet-standard refuses to register. `adb reverse` tunnels the phone's
#   own localhost back to this machine, so the baked-in
#   `WEB_SHELL_URL=http://localhost:3000/` just works — and stays a secure context.
#
# Usage:
#   ./scripts/device-test.sh                 # install Vanta (debug) + wire tunnels + launch
#   ./scripts/device-test.sh --release       # install the release APK (no CDP debugging)
#   ./scripts/device-test.sh --wallet        # also install the v1-capable fakewallet
#   ./scripts/device-test.sh --app-only      # skip the wallet
set -uo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
WALLET_PKG=com.solana.mobilewalletadapter.fakewallet
APP_PKG=com.vanta.privacywallet
DEBUG_APK="$DIR/android/app/build/outputs/apk/debug/app-debug.apk"
RELEASE_APK="$DIR/android/app/build/outputs/apk/release/app-release.apk"
WALLET_APK="$DIR/deploy/apk-backup/fakewallet-v1-debug.apk"

USE_RELEASE=0
INSTALL_WALLET=0
for arg in "$@"; do
  case "$arg" in
    --release) USE_RELEASE=1 ;;
    --wallet) INSTALL_WALLET=1 ;;
    --app-only) INSTALL_WALLET=0 ;;
  esac
done

echo "== 1. looking for a physical device =="
DEVICES=$(adb devices | awk 'NR>1 && $2=="device" {print $1}')
if [ -z "$DEVICES" ]; then
  echo "  ✗ no authorised device."
  echo "    Check: USB cable is data-capable, 'USB debugging' is ON,"
  echo "    and you tapped Allow on the 'Allow USB debugging?' prompt."
  echo "    Then: adb kill-server && adb devices"
  exit 1
fi

PHONES=""
for d in $DEVICES; do
  case "$d" in emulator-*) echo "  (skipping emulator $d)" ;; *) PHONES="$PHONES $d" ;; esac
done
PHONES="$(echo $PHONES | xargs)"
COUNT=$(echo "$PHONES" | wc -w | xargs)
if [ "$COUNT" -eq 0 ]; then
  echo "  ✗ only emulators are connected — plug in the phone."; exit 1
fi
if [ "$COUNT" -gt 1 ]; then
  echo "  ✗ multiple phones connected: $PHONES"
  echo "    Set one explicitly:  ANDROID_SERIAL=<serial> ./scripts/device-test.sh"
  exit 1
fi

SERIAL="$PHONES"
export ANDROID_SERIAL="$SERIAL"
echo "  ✓ device: $SERIAL"
adb -s "$SERIAL" shell getprop ro.product.model 2>/dev/null | sed 's/^/    model: /'
adb -s "$SERIAL" shell getprop ro.build.version.release 2>/dev/null | sed 's/^/    android: /'

echo
echo "== 2. is the web app reachable on this Mac? =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/ || echo "000")
echo "    http://localhost:3000 -> HTTP $CODE"
if [ "$CODE" != "200" ]; then
  echo "  ⚠️  the app server is not answering. Start it before launching:"
  echo "      launchctl load ~/Library/LaunchAgents/com.vanta.server.plist"
  echo "      cd $DIR && npx vite build    # the server serves dist/, not src/"
fi

echo
echo "== 3. reverse tunnels (phone localhost -> this Mac) =="
adb -s "$SERIAL" reverse --remove-all 2>/dev/null
adb -s "$SERIAL" reverse tcp:3000 tcp:3000 && echo "    tcp:3000 -> app"
adb -s "$SERIAL" reverse tcp:3001 tcp:3001 && echo "    tcp:3001 -> relayer"
# The faucet has its own port, so it needs its own tunnel: without it the
# in-app button fails against the phone's own localhost.
adb -s "$SERIAL" reverse tcp:3003 tcp:3003 && echo "    tcp:3003 -> faucet"

echo
echo "== 4. install =="
APK="$DEBUG_APK"
LABEL="debug (CDP diagnostics ON)"
if [ "$USE_RELEASE" -eq 1 ]; then APK="$RELEASE_APK"; LABEL="release (no CDP)"; fi
if [ ! -f "$APK" ]; then echo "  ✗ missing $APK"; exit 1; fi

adb -s "$SERIAL" install -r "$APK" 2>&1 | tail -2 | sed 's/^/    /'
echo "    installed Vanta: $LABEL"

if [ "$INSTALL_WALLET" -eq 1 ]; then
  if [ ! -f "$WALLET_APK" ]; then
    echo "    ⚠️  v1 fakewallet not found at $WALLET_APK"
    echo "       Build it: see HANDOFF.md §6.4, then copy it into deploy/apk-backup/"
  else
    echo "    installing a v1-CAPABLE wallet (stock fakewallet release builds are legacy-only)…"
    adb -s "$SERIAL" uninstall "$WALLET_PKG" >/dev/null 2>&1
    adb -s "$SERIAL" install "$WALLET_APK" 2>&1 | tail -2 | sed 's/^/    /'
  fi
fi

echo
echo "== 5. launch =="
adb -s "$SERIAL" shell am force-stop "$APP_PKG"
adb -s "$SERIAL" shell am start -n "$APP_PKG/.MainActivity" >/dev/null
echo "    launched $APP_PKG"

echo
echo "== done =="
echo "  If the screen is blank: the reverse tunnel dropped (they do not survive"
echo "  reconnects). Re-run this script, or just:"
echo "      adb -s $SERIAL reverse tcp:3000 tcp:3000"
echo
echo "  Console/CDP (debug build only), if Chrome is not open on the phone:"
echo "      node scripts/webview-inspect.mjs"
echo "      node scripts/webview-console.mjs"
echo
echo "  ⚠️  Wallet v1 support: a legacy-only wallet cannot sign Zolana payloads."
echo "      Use --wallet, or a current Play Store wallet that supports v1."
