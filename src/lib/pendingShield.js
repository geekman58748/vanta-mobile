// ── A Shield that was broadcast but never acknowledged ───────────────────────
//
// Why this exists (found on a real phone, 2026-09-28). MWA's answer travels
// over a localhost socket between the WebView and the wallet app. The moment the
// wallet takes the foreground the WebView stops servicing that socket, so an
// answer sent while it is in front — or a reply to an association the wallet
// closes as it answers — can simply be lost. Meanwhile the deposit is already on
// chain, because the wallet broadcast it.
//
// Before this module, a lost reply was indistinguishable from a failed deposit,
// and that cost the user four things at once:
//   · a "Shield failed" toast for money that had moved,
//   · no history row (addTxn only ran after the call resolved),
//   · no success page (same reason),
//   · and, because the incoming-credit reservation was dropped as if nothing had
//     happened, a later sync could file the deposit as "Received 0.05 SOL
//     privately" — a receipt for a payment the user made to themselves.
// Reloading mid-flight did the same damage by discarding the in-progress call.
//
// So a Shield is written down BEFORE the wallet is asked to sign, and cleared
// only once the app knows the outcome. If the reply is lost, or the app is
// reloaded, the record is reconciled against the chain: find the deposit the
// wallet actually sent, and give it the row and the success page it earned.
//
// The lookup is deliberately narrow — a transaction by THIS depositor, touching
// the pool program, at or after the slot we were on when we tried. That is
// specific enough that an older deposit or an unrelated transfer cannot be
// mistaken for this one, and it needs no signature from the wallet, which is the
// whole point.

const PENDING_KEY = 'vanta-pending-shield'

// Past this, a record is stale rather than pending: the deposit either landed
// (and the sync below already shows it) or it never will.
const MAX_AGE_MS = 10 * 60 * 1000

// The pool every Vanta deposit goes through — `HANDOFF.md` §0, and the same id
// relayer/server.js allowlists. Duplicated rather than plumbed through props:
// this module is the only place that needs to recognise a Vanta deposit without
// the SDK loaded.
export const POOL_PROGRAM = 'sppU489D7A4U1exNo1oeMGZtLEofq3a6o2fR7UeoWB6'

/** Write the record. Call this BEFORE the wallet is asked to sign anything. */
export function savePendingShield({ amount, symbol, depositor, sinceSlot = null }) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({
      amount, symbol, depositor, sinceSlot, at: Date.now(),
    }))
  } catch (err) {
    // A private-mode localStorage must not stop a Shield; it only costs us the
    // ability to reconcile this one if the reply is lost.
    console.warn('[vanta] could not persist the pending Shield:', err?.message ?? err)
  }
}

/** The record, if one is still worth reconciling. Null otherwise. */
export function loadPendingShield() {
  let raw
  try {
    raw = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null')
  } catch {
    return null
  }
  if (!raw?.depositor || !raw?.amount) return null
  if (Date.now() - (raw.at ?? 0) > MAX_AGE_MS) return null
  return raw
}

export function clearPendingShield() {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    /* nothing to do — a stale record expires on its own */
  }
}

/** Current slot, or null. Best-effort: a null only widens the recovery window. */
export async function readSlot(rpcUrl) {
  try {
    const { Connection } = await import('@solana/web3.js')
    return await new Connection(rpcUrl, 'confirmed').getSlot()
  } catch (err) {
    console.warn('[vanta] could not read the slot before a Shield:', err?.message ?? err)
    return null
  }
}

/**
 * The deposit this depositor actually sent, or null if there is none.
 *
 * Newest-first scan, stopped as soon as it leaves the window, so the cost is one
 * or two RPC calls in the normal case rather than a walk through history.
 */
// Every fee Vanta has actually measured on the pool: 5,000 lamports relayer-
// paid, 25,000 device-wallet-paid. A candidate whose depositor lost no more than
// that moved none of its own money, so it is not a deposit.
const MAX_FEE_LAMPORTS = 25_000

// Static account keys arrive as PublicKey (json), as {pubkey} (jsonParsed) or as
// a base58 string. All three have to compare equal to `depositor`.
const toKeyString = (key) =>
  key?.toBase58
    ? key.toBase58()
    : key?.pubkey?.toBase58
      ? key.pubkey.toBase58()
      : String(key)

export async function findLandedDeposit({
  rpcUrl, depositor, sinceSlot = null, notBeforeMs = null, poolProgram = POOL_PROGRAM,
}) {
  const { Connection, PublicKey } = await import('@solana/web3.js')
  const connection = new Connection(rpcUrl, 'confirmed')
  // 8 was too few. A wallet that has shielded, shadowed and ghosted since the
  // attempt pushes the real deposit out of the window and the recovery finds
  // nothing — caught by scripts/pending-shield-recover-check.mjs going 5/5 -> 1/5
  // after a handful of real transactions.
  const candidates = await connection.getSignaturesForAddress(new PublicKey(depositor), { limit: 25 })

  const inWindow = []
  for (const info of candidates) {
    if (info.err) continue
    // Signatures come back newest first, so the first one outside the window
    // means every remaining candidate is too.
    if (sinceSlot && info.slot < sinceSlot) break
    if (notBeforeMs && (typeof info.blockTime !== 'number' || info.blockTime * 1000 < notBeforeMs)) break
    inWindow.push(info)
  }
  // Oldest first. The pending record is written BEFORE the wallet is asked to
  // sign, so the deposit being looked for is the first qualifying one at or
  // after the attempt — not whichever pool transaction this wallet touched most
  // recently, which is what newest-first returned and why "refuses another
  // wallet's activity" handed back someone else's Shadow.
  inWindow.reverse()

  for (const info of inWindow) {
    const tx = await connection.getTransaction(info.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 1,
    })
    if (!tx?.meta || tx.meta.err) continue

    // Legacy responses carry `accountKeys`, versioned ones `staticAccountKeys`.
    // Either way the pool program and the depositor are both static keys of a
    // deposit, which is all we need to recognise it.
    const message = tx.transaction?.message
    const keys = (message?.staticAccountKeys ?? message?.accountKeys ?? []).map(toKeyString)
    const owner = keys.indexOf(depositor)
    if (owner < 0 || !keys.includes(poolProgram)) continue

    // A DEPOSIT moves the depositor's own money into the pool. A Shadow — or any
    // other pool transaction the wallet merely co-signs — leaves its balance
    // down by the fee and nothing else, and there are plenty of those. Without
    // this the recovery happily filed an unrelated Shadow as the lost deposit,
    // which would have credited the wrong amount to the wrong receipt.
    const outflow = (tx.meta.preBalances[owner] ?? 0) - (tx.meta.postBalances[owner] ?? 0)
    if (outflow <= MAX_FEE_LAMPORTS) continue

    return { signature: info.signature, slot: info.slot }
  }

  return null
}
