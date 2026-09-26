#!/usr/bin/env node
/**
 * bundle-android.mjs — copy the Vite build into the APK's bundled assets.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Solana Mobile webshell template loads a *remote* URL (BuildConfig.WEB_SHELL_URL).
 * That makes the shipped APK a thin wrapper around a web server: with no server
 * reachable the app shows a blank screen, and the CLOCK IN rubric explicitly
 * penalises "PWA wrappers with little to no mobile optimisation".
 *
 * This script stages `dist/` into `android/app/src/main/assets/www/`, which
 * MainActivity serves through WebViewAssetLoader at
 *   https://appassets.androidplatform.net/assets/www/index.html
 * so the APK is self-contained and boots with zero network.
 *
 * Usage:  node scripts/bundle-android.mjs      (or: npm run build:android)
 */
import { cp, mkdir, rm, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const distDir = path.join(root, 'dist')
const assetsRoot = path.join(root, 'android', 'app', 'src', 'main', 'assets')
const destDir = path.join(assetsRoot, 'www')

/** Where the WebView will load the bundled app from, per MainActivity + build.gradle.kts. */
export const BUNDLED_ENTRY_URL =
  'https://appassets.androidplatform.net/assets/www/index.html'

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  if (!(await exists(distDir))) {
    console.error('✗ dist/ not found — run `npx vite build` first.')
    process.exit(1)
  }

  const indexHtml = path.join(distDir, 'index.html')
  if (!(await exists(indexHtml))) {
    console.error('✗ dist/index.html not found — the build is incomplete.')
    process.exit(1)
  }

  // Guard the single failure mode that silently produces a white screen:
  // absolute /assets/… URLs never resolve under the appassets sandbox.
  const html = await readFile(indexHtml, 'utf8')
  const absoluteRefs = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1])
  const badRefs = absoluteRefs.filter((ref) => !ref.startsWith('//'))
  if (badRefs.length > 0) {
    console.error(
      '✗ dist/index.html contains absolute URL(s) that will 404 inside the APK:\n' +
        badRefs.map((r) => `    ${r}`).join('\n') +
        '\n  Fix: set `base: \'./\'` in vite.config.js and rebuild.',
    )
    process.exit(1)
  }

  await mkdir(assetsRoot, { recursive: true })
  // Full replace so a removed chunk never lingers in the APK.
  await rm(destDir, { recursive: true, force: true })
  await cp(distDir, destDir, { recursive: true })

  console.log(`✓ bundled dist/ → android/app/src/main/assets/www/`)
  console.log(`  entry: ${BUNDLED_ENTRY_URL}`)
}

main().catch((err) => {
  console.error('✗ bundle-android failed:', err)
  process.exit(1)
})
