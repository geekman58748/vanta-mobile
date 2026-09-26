// Minimal implementation of the wallet-standard *app* registry.
//
// Why hand-rolled instead of `@wallet-standard/app`: this repo is a pnpm
// workspace, so that package exists only as a transitive dep of
// `@solana-mobile/wallet-standard-mobile` and is NOT resolvable from app code.
// Pulling it in would mean a network install on a deadline build. The protocol
// is tiny and stable, so we speak it directly:
//
//   • A wallet calls `registerWallet(wallet)` (inside `registerMwa`), which
//     dispatches `wallet-standard:register-wallet` carrying a callback.
//   • The app answers `wallet-standard:app-ready` with its own callback, so
//     wallets that registered *before* us still get delivered.
//
// Both events are handled here, so wallets registered in either order land in
// the same list. This is the standard contract, not a Vanta-specific hack.

const REGISTER_EVENT = 'wallet-standard:register-wallet'
const APP_READY_EVENT = 'wallet-standard:app-ready'

function createRegistry() {
  const wallets = []
  const listeners = new Set()

  const register = (...newWallets) => {
    let added = false
    for (const wallet of newWallets) {
      if (wallet && !wallets.includes(wallet)) {
        wallets.push(wallet)
        added = true
      }
    }
    if (added) {
      for (const listener of listeners) listener(wallets.slice())
    }
    // wallet-standard's register contract returns an `unregister` fn.
    return () => {
      for (const wallet of newWallets) {
        const i = wallets.indexOf(wallet)
        if (i >= 0) wallets.splice(i, 1)
      }
    }
  }

  const on = (event, listener) => {
    if (event !== 'register') return () => {}
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  // The wallet-standard handshake passes this **API object** in both
  // directions — not a bare callback. The wallet's own callback is shaped
  // `({ register }) => register(wallet)`, so handing it a function instead of
  // an object makes `register` undefined and the wallet silently never lands.
  const api = {
    get: () => wallets.slice(),
    on,
    register,
  }

  if (typeof window !== 'undefined') {
    // Wallet announcing itself → hand it our API.
    window.addEventListener(REGISTER_EVENT, (event) => event.detail(api))
    // Wallet registered before us → tell it we're ready.
    window.dispatchEvent(new CustomEvent(APP_READY_EVENT, { detail: api }))
  }

  return api
}

let registry = null

// Singleton — dispatching app-ready twice is harmless, but a stable registry
// keeps the wallet list identical across all callers.
export function getWallets() {
  if (!registry) registry = createRegistry()
  return registry
}
