# Vanta — Android shell

A WebView shell for the Vanta web app, built on the Solana Mobile **webshell**
template. It is *not* a Trusted Web Activity.

Unlike the stock template, **the web app is bundled inside the APK**. The shell
loads its own assets through `WebViewAssetLoader` from a synthetic HTTPS origin:

```
https://appassets.androidplatform.net/assets/www/index.html
```

That origin matters: it is treated as a secure context (so `crypto.subtle`,
localStorage and the Zolana prover all work), it is stable across builds, and it
needs no network. A freshly installed APK boots with the phone in airplane mode.

- Application ID: `com.vanta.privacywallet`
- Kotlin package / namespace: `com.vanta.privacywallet`
- Version code: `1` · Version name: `1.0.0`
- minSdk 28 · targetSdk 36

## Build

The web assets must be staged **before** Gradle packages the APK. From the repo root:

```bash
npm run build:android      # vite build + stage dist/ into app/src/main/assets/www/
```

Then build the APK:

```bash
cd android
export ANDROID_HOME=/Users/mac/Library/Android/sdk
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$ANDROID_HOME/platform-tools:$JAVA_HOME/bin:$PATH"

./gradlew :app:assembleDebug     # debug shell (CDP enabled, WebContentsDebuggingEnabled)
./gradlew :app:assembleRelease   # release, minified by R8
```

Outputs:

| Variant | Path |
|---|---|
| Debug | `app/build/outputs/apk/debug/app-debug.apk` |
| Release | `app/build/outputs/apk/release/app-release.apk` |

> `app/src/main/assets/www/` is generated and gitignored. If it is missing, the
> APK still builds but shows a blank WebView — always run `npm run build:android`
> first. `scripts/bundle-android.mjs` fails loudly if `dist/index.html` contains
> absolute `/assets/…` URLs, which is the one mistake that produces a white screen.

## Release signing

`app/build.gradle.kts` reads these Gradle properties (or the matching environment
variables of the same name). **The names must match exactly** — if they are wrong
the release APK is produced *unsigned* and Gradle will not warn you.

| Property | Env var |
|---|---|
| `WEB_SHELL_SIGNING_STORE_FILE` | — (path to the `.jks`) |
| `WEB_SHELL_SIGNING_STORE_PASSWORD` | `WEB_SHELL_SIGNING_STORE_PASSWORD` |
| `WEB_SHELL_SIGNING_KEY_ALIAS` | — |
| `WEB_SHELL_SIGNING_KEY_PASSWORD` | `WEB_SHELL_SIGNING_KEY_PASSWORD` |

Keystore: `../deploy/vanta-release.jks`, alias `vanta`.

```bash
export WEB_SHELL_SIGNING_STORE_PASSWORD='…'
export WEB_SHELL_SIGNING_KEY_PASSWORD='…'
./gradlew :app:assembleRelease
# verify — must print a signer, not "unsigned"
"$ANDROID_HOME/build-tools/<ver>/apksigner" verify --print-certs \
  app/build/outputs/apk/release/app-release.apk
```

## Live-reload development

To point the shell at a Vite dev server instead of the bundled assets, uncomment
the dev line in `android/gradle.properties`:

```properties
WEB_SHELL_URL=http://localhost:3000/
```

and forward the port (the WebView sees the *phone's* localhost, not your machine's):

```bash
adb reverse tcp:3000 tcp:3000     # web app
adb reverse tcp:3001 tcp:3001     # relayer (Shield / fee float / registration)
```

Never ship an APK with `WEB_SHELL_URL` pointing at localhost — it will be blank on
any device without that tunnel.

## Notes

- `WebView.setWebContentsDebuggingEnabled` is gated on `BuildConfig.DEBUG`, so CDP
  inspection (`scripts/webview-inspect.mjs`) only works on debug builds.
- `mixedContentMode` is `MIXED_CONTENT_NEVER_ALLOW`. `http://localhost` is treated
  as a trustworthy origin, so `adb reverse` still works from the HTTPS app origin —
  but **the production relayer must be HTTPS** or Shield will be blocked.
- External links (block explorer, docs) open in the system browser.
- `solana-wallet:` and `intent:` URIs are handled natively so the Mobile Wallet
  Adapter can open the wallet app.
- Android's back gesture is wired to WebView history; because the app is a single
  page, in-app drawers should register their own back handling.
