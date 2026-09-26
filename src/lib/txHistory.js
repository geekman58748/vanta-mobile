// ── On-chain verification, client side ──────────────────────────────────────
// The relayer already has every piece of this — `verified_on_chain` is computed
// in `POST /tx/report`, stored by `setVerifiedOnChain()`, and returned by
// `GET /tx/:address`. Until now nothing in `src/` ever called either endpoint,
// so the flag existed purely for a receipt UI that was never plugged in.
//
// Two different questions, two different sources:
//
//   Shadow / Ghost / Public  → the relayer is BLIND (identity X pays its own
//                              fee and never touches it), so the client must
//                              REPORT the signature and the relayer independently
//                              looks it up before answering true.
//   Shield / Registration    → the relayer is the fee payer, so it already
//                              inserted its own row with flow_source='relayer'.
//                              It observed the tx itself.
//
// That asymmetry is why Shield is handled differently below: re-posting a
// Shield signature would upsert flow_source from 'relayer' back to 'client'
// (recordTransaction's ON CONFLICT overwrites it) and erase the strongest fact
// we have about that row. Shields are re-read, never re-posted.
//
// ⚠ Nothing here may ever fail a send. The transfer is already confirmed on
// chain by the time this runs; history is a convenience, so every path returns
// a proof level instead of throwing.

import { relayerFetch } from './config.js'

/** relayer/db.js FLOWS: shield|shadow|ghost|register|fund|send */
const FLOW_BY_MODE = {
  Shield: 'shield',
  Shadow: 'shadow',
  Ghost: 'ghost',
  Public: 'send',
}

/** signature -> proof key. Module-scope on purpose: addTxn reads it synchronously. */
const proofs = new Map()

/** Proof key for a signature, or null when we have never checked it. */
export function lookupProof(signature) {
  if (!signature) return null
  return proofs.get(signature) ?? null
}

function setProof(signature, proof) {
  if (signature && proof) proofs.set(signature, proof)
}

/** Row shape -> proof key. `verified` outranks `observed`, which outranks a bare report. */
function proofFromRow(row) {
  if (!row) return null
  if (row.verified_on_chain) return 'verified'
  if (row.flow_source === 'relayer') return 'observed'
  if (row.verified_on_chain === false) return 'reported'
  return 'unchecked'
}

/**
 * Tell the relayer about a send it could not see, and take back its verdict.
 *
 * Returns the proof key, or null if the relayer is unreachable / unconfigured.
 * The 5s ceiling matters: this runs AFTER the send is already confirmed, so a
 * dead relayer must cost the user a moment at worst, never a failed transfer.
 */
export async function reportTx({
  signature,
  mode,
  amount = null,
  decimals = 9,
  counterparty = null,
  actor = null,
} = {}) {
  if (!signature) return null
  const flow = FLOW_BY_MODE[mode] ?? null

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    let res
    try {
      res = await relayerFetch('/tx/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          flow,
          amount: amount == null ? null : String(Math.round(amount * 10 ** decimals)),
          counterparty,
          actor,
          intent: mode ? { mode } : undefined,
        }),
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) return null
    const data = await res.json().catch(() => ({}))
    const proof =
      data?.verified_on_chain === true
        ? 'verified'
        : data?.verified_on_chain === false
          ? 'reported'
          : null
    setProof(signature, proof)
    return proof
  } catch (err) {
    console.warn('[tx] report failed (history only, send already landed):', err?.message ?? err)
    return null
  }
}

/**
 * Re-read the relayer's rows for these addresses and refresh their proof keys.
 *
 * Used for the relayer-observed flows, and as a safety net so a receipt opened
 * later reflects what the server says rather than only what the send reported.
 */
export async function refreshVerified(addresses = []) {
  const list = [...new Set(addresses.filter(Boolean))]
  for (const address of list) {
    try {
      const res = await relayerFetch(`/tx/${encodeURIComponent(address)}?limit=200`)
      if (!res.ok) continue
      const data = await res.json().catch(() => ({}))
      if (data?.configured === false) return false
      for (const row of Array.isArray(data?.transactions) ? data.transactions : []) {
        setProof(row?.signature, proofFromRow(row))
      }
    } catch (err) {
      console.warn('[tx] history refresh failed:', err?.message ?? err)
      return false
    }
  }
  return true
}

/**
 * Single entry point for a send that just landed. Returns the proof key so the
 * caller can hang it straight off the history row — no second round trip, no
 * race between the report coming back and the row being rendered.
 */
export async function recordSend({
  signature,
  mode,
  amount = null,
  decimals = 9,
  counterparty = null,
  actor = null,
  addresses = [],
} = {}) {
  if (!signature) return null

  // Relayer-observed flows: read, never re-post (see the header note).
  if (mode === 'Shield') {
    await refreshVerified([actor, ...addresses])
    return lookupProof(signature)
  }

  const proof = await reportTx({ signature, mode, amount, decimals, counterparty, actor })
  if (proof) return proof
  // Report failed but the send did not: fall back to whatever the server
  // already knows, so we degrade to 'unchecked' rather than to a wrong claim.
  if (addresses.length) await refreshVerified(addresses)
  return lookupProof(signature)
}
