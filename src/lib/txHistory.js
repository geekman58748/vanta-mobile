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
// That asymmetry is why an observed Shield is handled differently below:
// re-posting its signature would upsert flow_source from 'relayer' back to
// 'client' (recordTransaction's ON CONFLICT overwrites it) and erase the
// strongest fact we have about that row. Observed flows are re-read, never
// re-posted. Pass `relayerObserved` to say which kind this is.
//
// ⚠ Not every Shield is observed. The in-app wallet keeps the relayer-sponsored
// fee payer, but a DEVICE-wallet Shield pays its own fee and the relayer is not
// in that transaction at all (see App.jsx shield) — so it has to be reported
// like a Shadow, or its row would exist only on this device and its receipt
// could never say "On chain".
//
// ⚠ Nothing here may ever fail a send. The transfer is already confirmed on
// chain by the time this runs; history is a convenience, so every path returns
// a proof level instead of throwing.

import { relayerFetch } from './config.js'
import { historyProof, reportMessage, signForAddress } from './identityProof.js'

/** relayer/db.js FLOWS: shield|shadow|ghost|register|fund|send */
const FLOW_BY_MODE = {
  Shield: 'shield',
  Shadow: 'shadow',
  Ghost: 'ghost',
  Public: 'send',
}

// ── signature -> proof key ──────────────────────────────────────────────────
// Module-scope on purpose: addTxn reads it synchronously, and ReceiptDrawer
// reads it again at render time.
//
// It used to be a bare `new Map()`, which was a bug with a visible symptom: the
// history ROWS are saved to local history, but the proof keys beside them were
// not, so every page reload threw the verification away and every receipt fell
// through to `PROOF.unchecked` — "History was unreachable when this was
// recorded, so it has not been verified" — including for signatures the relayer
// had already confirmed as `verified`. Persist them next to the rows.
const PROOF_STORE_KEY = 'vanta-proofs-v1'
const PROOF_STORE_MAX = 500

function loadProofStore() {
  // Safe to call during module init: the guard keeps this importable from any
  // non-browser context (the SSR smoke check imports App).
  if (typeof localStorage === 'undefined') return new Map()
  try {
    const raw = JSON.parse(localStorage.getItem(PROOF_STORE_KEY) || 'null')
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return new Map(Object.entries(raw).filter(([, value]) => typeof value === 'string'))
    }
  } catch {
    // Corrupt or unavailable storage must not take history down with it.
  }
  return new Map()
}

const proofs = loadProofStore()

function persistProofStore() {
  if (typeof localStorage === 'undefined') return
  try {
    // Map preserves insertion order, so truncating from the front drops the
    // oldest keys first and the store cannot grow without bound.
    const entries = [...proofs].slice(-PROOF_STORE_MAX)
    localStorage.setItem(PROOF_STORE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch (err) {
    console.warn('[tx] could not persist proof keys:', err?.message ?? err)
  }
}

/** Ceiling for the report round trip. See the note on reportTx. */
const REPORT_TIMEOUT_MS = 12_000

/** Proof key for a signature, or null when we have never checked it. */
export function lookupProof(signature) {
  if (!signature) return null
  return proofs.get(signature) ?? null
}

function setProof(signature, proof) {
  if (!signature || !proof) return
  const changed = proofs.get(signature) !== proof
  proofs.set(signature, proof)
  if (changed) persistProofStore()
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
 * Tell the relayer that a send it could not see exists, and take back its
 * verdict on whether that signature is really on chain.
 *
 * The report carries **no amount and no recipient**. It used to send both, and
 * the relayer stored them — which silently contradicted the Activity sheet's own
 * promise ("never the amount or the recipient") and handed anyone who unzipped
 * the APK the payment graph the pool had hidden (AUDIT-2026-09-27 C1/C2). Amount
 * and counterparty now live only in this device's own encrypted history.
 *
 * It is authenticated by the key the row belongs to: the relayer verifies the
 * proof against `actor` before it stores anything, so a report cannot be filed
 * under someone else's identity.
 *
 * Returns the proof key, or null if the relayer is unreachable / unconfigured /
 * this device cannot prove `actor`. THIS CAN NEVER FAIL A SEND — it runs after
 * the transfer is already confirmed, and every failure path returns null.
 *
 * The ceiling is 12s, not 5s. `POST /tx/report` is not a database write: it does
 * a `getTransaction` against the RPC to decide `verified_on_chain`, and a
 * signature that was confirmed seconds ago is often not indexed yet — the server
 * can legitimately spend several seconds on it (measured: 1946 ms cold for a
 * signed read, 1366 ms warm for a report). At 5 s the client was aborting real
 * reports mid-flight on a slow network and the row stayed "unchecked" forever.
 */
export async function reportTx({ signature, mode, actor = null } = {}) {
  if (!signature || !actor) return null
  const flow = FLOW_BY_MODE[mode] ?? null

  const proof = await signForAddress(actor, reportMessage(signature, actor))
  // A device-wallet send cannot be proven without a phone approval prompt, and
  // asking for one just to file a history row is not worth it. Stay unverified.
  if (!proof) {
    console.warn('[tx] no signing key for', actor.slice(0, 8), '… — report skipped')
    return null
  }

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), REPORT_TIMEOUT_MS)
    let res
    try {
      res = await relayerFetch('/tx/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          flow,
          actor,
          proof,
          intent: mode ? { mode } : undefined,
        }),
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) return null
    const data = await res.json().catch(() => ({}))
    // Named `proofKey`, not `proof`: a `const proof` here would shadow the
    // signature proof declared above, and the request body reads that outer one
    // — which puts the inner binding in its temporal dead zone at exactly the
    // moment the body is built (ReferenceError: cannot access before
    // initialization). Caught on device: the send landed, the report never did.
    const proofKey =
      data?.verified_on_chain === true
        ? 'verified'
        : data?.verified_on_chain === false
          ? 'reported'
          : null
    setProof(signature, proofKey)
    return proofKey
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
 *
 * Each read is signed by the address's own key, so an address whose key is not on
 * this device (an MWA public wallet, say) is skipped rather than attempted — its
 * rows stay at their reported level instead of producing a 401.
 */
export async function refreshVerified(addresses = []) {
  const list = [...new Set(addresses.filter(Boolean))]
  for (const address of list) {
    try {
      const proof = await historyProof(address)
      if (!proof) continue
      const query = new URLSearchParams({ limit: '200', ts: String(proof.ts), sig: proof.sig })
      const res = await relayerFetch(`/tx/${encodeURIComponent(address)}?${query}`)
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
 *
 * `relayerObserved` means the relayer is IN this transaction (it paid the fee),
 * so it already has its own row and re-reporting would downgrade it. Callers
 * that know the relayer sponsored the tx must say so; the default is the honest
 * "nobody but this device has seen it yet" — which is true of every Shadow, Ghost
 * and public send, and of a device-wallet Shield.
 */
export async function recordSend({
  signature, mode, actor = null, addresses = [], relayerObserved = false,
} = {}) {
  if (!signature) return null

  // Relayer-observed flows: read, never re-post (see the header note).
  if (relayerObserved) {
    await refreshVerified([actor, ...addresses])
    return lookupProof(signature)
  }

  const proof = await reportTx({ signature, mode, actor })
  if (proof) return proof
  // Report failed but the send did not: fall back to whatever the server
  // already knows, so we degrade to 'unchecked' rather than to a wrong claim.
  if (addresses.length) await refreshVerified(addresses)
  return lookupProof(signature)
}

/**
 * The check a receipt actually runs when it is opened.
 *
 * `ReceiptDrawer` only ever READ the cached key, and `refreshVerified` was
 * called from nowhere except inside `recordSend` — so a row whose single report
 * failed (history unreachable, DNS down, the 12s ceiling hit) had no code path
 * anywhere that would ever look again. It stayed "Not checked" for the life of
 * the install while the transaction sat there confirmed on chain. This is that
 * path.
 *
 * Returns the existing key when there is one, and otherwise re-reads the
 * relayer's verdict for `addresses` before answering. Never throws: an
 * unreachable relayer leaves whatever the row already had alone.
 */
export async function checkProof(signature, addresses = []) {
  if (!signature) return null
  const cached = lookupProof(signature)
  if (cached) return cached
  try {
    await refreshVerified(addresses.filter(Boolean))
  } catch (err) {
    console.warn('[tx] receipt re-check failed:', err?.message ?? err)
  }
  return lookupProof(signature)
}
