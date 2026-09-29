// ── Relayer access ───────────────────────────────────────────────────
// Shared by App.jsx (relay / fund / history) and the drawers (name resolution).
// Config lives here rather than in App.jsx so a component that only needs to
// call one endpoint doesn't have to take the whole engine as props.
//
// ⚠ VITE_* values are compiled into the client bundle by Vite. They keep
// secrets out of *git*, not out of the shipped app — anyone can read the built
// JS. Treat the relayer token as abuse-deterrence, not authentication.

// Privacy relayer. Local dev: http://localhost:3001
// Production: the public HTTPS URL, e.g. https://vanta-relayer.fly.dev
// On a phone `localhost` is the phone itself. Must be HTTPS — the bundled app
// origin is https and mixed content is blocked.
export const RELAYER_URL = (
  import.meta.env.VITE_RELAYER_URL || 'http://localhost:3001'
).replace(/\/+$/, '')

export const RELAYER_TOKEN = import.meta.env.VITE_RELAYER_TOKEN ?? ''

/** fetch() against the relayer, carrying the shared token when one is configured. */
export function relayerFetch(path, init = {}) {
  // Headers() normalises plain objects, arrays and Header instances alike.
  const headers = new Headers(init.headers)
  if (RELAYER_TOKEN) headers.set('x-vanta-token', RELAYER_TOKEN)
  return fetch(`${RELAYER_URL}${path}`, { ...init, headers })
}

// ── Devnet faucet ──────────────────────────────────────────────────────
// A SEPARATE service with its OWN wallet — never a relayer endpoint. The
// relayer only ever pays network fees; the faucet only ever pays claims, so
// draining one can never touch the other. Empty until VITE_FAUCET_URL is set;
// the app then reports that rather than silently404ing.
export const FAUCET_URL = (import.meta.env.VITE_FAUCET_URL || '').replace(/\/+$/, '')

/** fetch() against the faucet service, carrying the same shared token. */
export function faucetFetch(path, init = {}) {
  const headers = new Headers(init.headers)
  if (RELAYER_TOKEN) headers.set('x-vanta-token', RELAYER_TOKEN)
  return fetch(`${FAUCET_URL}${path}`, { ...init, headers })
}

// ── .vanta handles ───────────────────────────────────────────────────
export const VANTA_NAME_SUFFIX = '.vanta'

/**
 * True when a recipient field should be treated as a handle rather than a key.
 *
 * Deliberately conservative: a Solana address is 32–44 base58 characters, and a
 * bare word like `alice` would collide with typos. Only an explicit `.vanta`
 * suffix counts, so an unfinished paste can never resolve to the wrong person.
 */
export function looksLikeVantaName(input) {
  return typeof input === 'string' && input.trim().toLowerCase().endsWith(VANTA_NAME_SUFFIX)
}

/**
 * Resolve a handle to a Vanta owner address.
 * Returns { found, address, name, error } — never throws.
 */
export async function resolveVantaName(raw) {
  const name = raw.trim().toLowerCase()
  if (!looksLikeVantaName(name)) return { found: false, error: 'Not a .vanta handle' }
  try {
    const res = await relayerFetch(`/names/${encodeURIComponent(name)}`)
    if (!res.ok) return { found: false, error: `Registry error ${res.status}` }
    const data = await res.json()
    if (!data?.found) return { found: false, error: 'That handle does not exist' }
    return { found: true, address: data.address, name: data.name }
  } catch {
    // Registry unreachable — say so rather than letting a send fail downstream
    // with a confusing SDK error about a malformed address.
    return { found: false, error: 'Registry unreachable' }
  }
}
