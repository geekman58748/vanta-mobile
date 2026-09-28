// ── Public wallet custody ────────────────────────────────────────────
//
// There used to be ONE slot (`vanta-wallet`), written by both the in-app
// session wallet and MWA. Connecting a device wallet therefore overwrote the
// session key — the only copy of it — and silently stranded whatever SOL that
// wallet held (AUDIT-2026-09-27 H6: 0.099995 SOL unreachable, no warning, no
// UI trace of the old address).
//
// Now each custodian owns a slot and an explicit pointer says which one the UI
// spends from:
//
//   vanta-wallet-session : { publicKey, secretKey[64] }  ← in-app (dev path)
//   vanta-wallet-device  : { publicKey, mwa: true }      ← Seed Vault / Phantom
//   vanta-wallet-active  : "session" | "device"
//
// Switching is a pointer move, never a delete: the inactive wallet stays
// spendable and Settings offers it back, so leftover funds can be drained.
//
// `vanta-wallet` is still written, as a MIRROR of the active wallet — the MWA
// harness scripts read it, and a downgrade to an older build still finds a
// wallet. It is derived state now, never the only copy of a key.

const SESSION_KEY = 'vanta-wallet-session'
const DEVICE_KEY = 'vanta-wallet-device'
const ACTIVE_KEY = 'vanta-wallet-active'
const MIRROR_KEY = 'vanta-wallet'
// A replaced session key is parked here rather than dropped. Not surfaced in
// the UI yet (switching preserves keys, so this is only reachable if the
// onboarding "use a throwaway wallet" path runs while one already exists).
const SESSION_PREV_KEY = 'vanta-wallet-session-prev'

function readRaw(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

function writeRaw(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn(`[walletStore] could not write ${key}:`, err?.message || err)
  }
}

function dropRaw(key) {
  try {
    localStorage.removeItem(key)
  } catch (err) {
    console.warn(`[walletStore] could not remove ${key}:`, err?.message || err)
  }
}

export const slotFor = (wallet) => (wallet?.mwa ? 'device' : 'session')

function mirrorActive(wallet) {
  if (wallet) writeRaw(MIRROR_KEY, wallet)
  else dropRaw(MIRROR_KEY)
}

// One-time fold of the legacy single slot into the pair. The legacy key is left
// in place (it is also the mirror), so this is idempotent and lossless.
function migrateLegacy(sessionWallet, deviceWallet) {
  if (sessionWallet || deviceWallet) return null
  const legacy = readRaw(MIRROR_KEY)
  if (!legacy?.publicKey) return null
  const slot = legacy.mwa ? DEVICE_KEY : SESSION_KEY
  writeRaw(slot, legacy)
  try {
    localStorage.setItem(ACTIVE_KEY, legacy.mwa ? 'device' : 'session')
  } catch (err) {
    console.warn('[walletStore] could not set active slot:', err?.message || err)
  }
  console.log(`[walletStore] migrated vanta-wallet → ${slot} slot`)
  return legacy
}

/**
 * Read both slots plus which one is active.
 * Returns `{ wallet, active, sessionWallet, deviceWallet }`; `wallet` is null
 * when nothing is bound (or when the pointer dangles, which self-heals).
 */
export function readSlots() {
  let sessionWallet = readRaw(SESSION_KEY)
  let deviceWallet = readRaw(DEVICE_KEY)
  const migrated = migrateLegacy(sessionWallet, deviceWallet)
  if (migrated) {
    sessionWallet = readRaw(SESSION_KEY)
    deviceWallet = readRaw(DEVICE_KEY)
  }

  let active = null
  try {
    active = localStorage.getItem(ACTIVE_KEY)
  } catch {
    active = null
  }

  // Repair a dangling / missing pointer (e.g. a slot removed out-of-band) and
  // keep the mirror in step, so callers never have to reason about it.
  if (active === 'session' && !sessionWallet) active = deviceWallet ? 'device' : null
  if (active === 'device' && !deviceWallet) active = sessionWallet ? 'session' : null
  if (active !== 'session' && active !== 'device') {
    active = sessionWallet ? 'session' : deviceWallet ? 'device' : null
  }
  if (active) {
    try {
      localStorage.setItem(ACTIVE_KEY, active)
    } catch {
      /* private-mode localStorage; the in-memory value is still correct */
    }
  }

  const wallet = active === 'session' ? sessionWallet : active === 'device' ? deviceWallet : null
  mirrorActive(wallet)
  return { wallet, active, sessionWallet, deviceWallet }
}

/** The wallet that is NOT active — offered back in Settings. Null if none. */
export function readInactive() {
  const { wallet, active, sessionWallet, deviceWallet } = readSlots()
  if (!wallet) return null
  return active === 'session' ? deviceWallet : sessionWallet
}

/**
 * Store the in-app session wallet and make it active. Returns the previous
 * session wallet if it was replaced (parked under `vanta-wallet-session-prev`).
 */
export function saveSessionWallet(data) {
  const prev = readRaw(SESSION_KEY)
  const replaced = prev?.publicKey && prev.publicKey !== data.publicKey ? prev : null
  if (replaced) writeRaw(SESSION_PREV_KEY, replaced)
  writeRaw(SESSION_KEY, data)
  try {
    localStorage.setItem(ACTIVE_KEY, 'session')
  } catch {
    /* see readSlots */
  }
  mirrorActive(data)
  return replaced
}

/**
 * Bind a device wallet (MWA) and make it active — WITHOUT touching the session
 * slot, which is the whole point. Returns the wallet that was active before, so
 * the caller can warn about (and name) any funds left behind.
 */
export function saveDeviceWallet(data) {
  const before = readSlots().wallet
  writeRaw(DEVICE_KEY, data)
  try {
    localStorage.setItem(ACTIVE_KEY, 'device')
  } catch {
    /* see readSlots */
  }
  mirrorActive(data)
  return before
}

/** Move the active pointer. Returns the wallet now active, or null. */
export function activateSlot(mode) {
  const { sessionWallet, deviceWallet } = readSlots()
  const next = mode === 'device' ? deviceWallet : mode === 'session' ? sessionWallet : null
  if (!next) return null
  try {
    localStorage.setItem(ACTIVE_KEY, mode)
  } catch {
    /* see readSlots */
  }
  mirrorActive(next)
  return next
}

/** Explicit disconnect: drop every slot, including the parked/legacy copies. */
export function clearSlots() {
  dropRaw(SESSION_KEY)
  dropRaw(DEVICE_KEY)
  dropRaw(SESSION_PREV_KEY)
  dropRaw(MIRROR_KEY)
  try {
    localStorage.removeItem(ACTIVE_KEY)
  } catch {
    /* see readSlots */
  }
}
