import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Relative asset URLs (./assets/…) so the same build works both when served
  // from a web root AND when loaded out of the APK's bundled assets at
  // https://appassets.androidplatform.net/assets/www/index.html. Absolute
  // paths would 404 inside the WebViewAssetLoader sandbox.
  // Safe because the app has no client-side router — one HTML entry point.
  base: './',
  resolve: {
    alias: {
      // Polyfill for snarkjs in browser
      'crypto': 'crypto-browserify',
    }
  },
  build: {
    // Ship native classes. @wallet-standard/wallet subclasses CustomEvent
    // (RegisterWalletEvent) with private fields; downleveling that to the
    // ES5 helper pair emits a class whose `super()` call throws at runtime, so
    // registerMwa silently fails and MWA can't discover the app. Our only
    // runtime is the Solana Mobile webshell (Chrome 137+), so esnext is safe.
    target: 'esnext',
  },
  define: {
    'process.env': {},
    'global': 'globalThis',
  },
})
