/**
 * Vanta relayer — Postgres data layer (Neon).
 *
 * Two responsibilities:
 *   1. Transaction history, written by the relayer as the authoritative observer.
 *   2. The `.vanta` name registry (handle → shielded identity owner address).
 *
 * DESIGN RULES
 *  - A database problem must never break the money path. Every call here can
 *    throw; server.js wraps them so a Neon outage degrades to "no history"
 *    rather than "Shield is broken".
 *  - The pool is created LAZILY. Reading DATABASE_URL at module scope would
 *    depend on env loading having already happened, and with ESM's hoisted
 *    evaluation that is easy to get wrong — it silently disabled this whole
 *    layer once already.
 *
 * Everything below no-ops when DATABASE_URL is unset, so the relayer still runs
 * locally with no database at all.
 */
import { Pool } from 'pg'
import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = join(__dirname, 'schema.sql')

let poolRef = null

/** True when a database is configured. Cheap — reads env, creates nothing. */
export function isEnabled() {
  return Boolean(process.env.DATABASE_URL)
}

/** The pool, created on first use. Returns null when unconfigured. */
export function getPool() {
  if (poolRef) return poolRef
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) return null
  poolRef = new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
  // Neon closes idle pooled connections routinely; pg surfaces that here and an
  // unhandled 'error' event would take the process down.
  poolRef.on('error', (err) => console.error('[db] idle client error:', err.message))
  return poolRef
}

export const FLOWS = Object.freeze(['shield', 'shadow', 'ghost', 'register', 'fund', 'send'])

/** Fallback blocklist; the durable copy lives in the reserved_names table. */
export const RESERVED_NAMES = new Set([
  'vanta', 'admin', 'support', 'help', 'team', 'official', 'staff',
  'root', 'api', 'www', 'app',
  'helius', 'solana', 'seeker', 'phantom', 'solflare', 'backpack', 'jupiter', 'sumsub',
])

/** Create tables/indexes and seed reserved names. Safe to call on every boot. */
export async function initSchema() {
  const pool = getPool()
  if (!pool) return { ok: false, reason: 'DATABASE_URL not set' }
  await pool.query(readFileSync(SCHEMA_PATH, 'utf-8'))
  return { ok: true }
}

export async function health() {
  const pool = getPool()
  if (!pool) return { configured: false }
  const { rows } = await pool.query('select now() as ts')
  return { configured: true, ok: true, ts: rows[0].ts }
}

// ── Ed25519 verification (for name-claim proofs) ──────────────────────
// SPKI prefix for an Ed25519 public key: 302a300506032b6570032100 + 32 bytes.
function ed25519PublicKeyObject(raw32) {
  const prefix = Buffer.from('302a300506032b6570032100', 'hex')
  return crypto.createPublicKey({
    key: Buffer.concat([prefix, Buffer.from(raw32)]),
    format: 'der',
    type: 'spki',
  })
}

/**
 * True if `signature` is a valid Ed25519 signature of `message` by `publicKey`.
 * Used so only the holder of an identity can claim a name for it — otherwise
 * anyone could squat someone else's address.
 */
export function verifyEd25519(publicKey, message, signature) {
  try {
    const key = ed25519PublicKeyObject(publicKey)
    return crypto.verify(null, Buffer.from(message), key, Buffer.from(signature))
  } catch {
    return false
  }
}

// ── Transaction history ───────────────────────────────────────────────
/**
 * Idempotent upsert keyed on signature, so a row written at submit time can be
 * enriched later (status, confirmation time, client report) without duplicating.
 */
export async function recordTransaction(row) {
  const pool = getPool()
  if (!pool) return null
  // Note the absence of an amount and a counterparty: the relayer records THAT
  // a signature exists, which flow it was, who it is attributed to, and whether
  // the chain confirms it. The money graph stays on the user's device
  // (AUDIT-2026-09-27 C2). Adding them back here would recreate the leak even if
  // no caller passes them, so the columns are dropped in schema.sql too.
  const {
    signature, status = 'submitted', error = null, flow = null,
    flowSource = 'relayer', relayerFeePayer = null, actors = [],
    primaryActor = null, programs = [], clientReport = null, slot = null,
  } = row

  const { rows } = await pool.query(
    `insert into transactions
       (signature, status, error, flow, flow_source, relayer_fee_payer,
        actors, primary_actor, programs, client_report, slot)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (signature) do update set
       status         = excluded.status,
       error          = coalesce(excluded.error, transactions.error),
       flow           = coalesce(excluded.flow, transactions.flow),
       flow_source    = excluded.flow_source,
       programs       = case when array_length(excluded.programs,1) > 0
                             then excluded.programs else transactions.programs end,
       client_report  = coalesce(excluded.client_report, transactions.client_report),
       slot           = coalesce(excluded.slot, transactions.slot),
       confirmed_at   = case when excluded.status = 'confirmed' then now()
                             else transactions.confirmed_at end
     returning id`,
    [
      signature, status, error, flow, flowSource, relayerFeePayer,
      actors, primaryActor, programs,
      clientReport ? JSON.stringify(clientReport) : null, slot,
    ],
  )
  return rows[0]?.id ?? null
}

export async function markConfirmed(signature, { slot = null, blockTime = null } = {}) {
  const pool = getPool()
  if (!pool) return
  await pool.query(
    `update transactions
        set status = 'confirmed', confirmed_at = now(),
            slot = coalesce($2, slot), block_time = coalesce($3, block_time)
      where signature = $1`,
    [signature, slot, blockTime],
  )
}

/**
 * Flag whether a client-reported row was confirmed to exist on-chain. This is
 * the flag the receipt UI keys off: a Shadow row that is not verified_on_chain
 * must never be presented with the same confidence as a Shield.
 */
export async function setVerifiedOnChain(signature, verified) {
  const pool = getPool()
  if (!pool) return
  await pool.query('update transactions set verified_on_chain = $2 where signature = $1', [
    signature, Boolean(verified),
  ])
}

export async function markFailed(signature, error) {
  const pool = getPool()
  if (!pool) return
  await pool.query(`update transactions set status='failed', error=$2 where signature=$1`, [
    signature, String(error).slice(0, 500),
  ])
}

export async function listTransactions(actor, { limit = 100 } = {}) {
  const pool = getPool()
  if (!pool) return []
  const { rows } = await pool.query(
    `select signature, status, error, flow, flow_source, verified_on_chain,
            actors, primary_actor, programs,
            client_report, slot, block_time, created_at, confirmed_at
       from transactions
      where primary_actor = $1 or $1 = any(actors)
      order by created_at desc
      limit $2`,
    [actor, Math.min(Math.max(Number(limit) || 100, 1), 500)],
  )
  return rows
}

// ── .vanta name registry ──────────────────────────────────────────────
// 2–20 chars. The minimum is 2 so short handles like `ai.vanta` are claimable.
const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,18})[a-z0-9]$/

/** `Ai.Vanta` / `ai.vanta` / `@ai` → `ai`. Returns null when invalid. */
export function normalizeName(input) {
  if (typeof input !== 'string') return null
  const lower = input.trim().toLowerCase().replace(/^@/, '').replace(/\.vanta$/, '')
  if (!NAME_RE.test(lower)) return null
  return lower
}

export function describeNameProblem(input) {
  const lower = String(input ?? '').trim().toLowerCase().replace(/^@/, '').replace(/\.vanta$/, '')
  if (!lower) return 'Name is required'
  if (lower.length < 2) return 'Names must be at least 2 characters'
  if (lower.length > 20) return 'Names must be at most 20 characters'
  if (!/^[a-z0-9-]+$/.test(lower)) return 'Use only letters, numbers and hyphens'
  if (!/^[a-z0-9]/.test(lower)) return 'Names must start with a letter or number'
  if (!/[a-z0-9]$/.test(lower)) return 'Names must end with a letter or number'
  if (lower.includes('--')) return 'Hyphens cannot repeat'
  return null
}

export async function isReservedName(name) {
  if (RESERVED_NAMES.has(name)) return true
  const pool = getPool()
  if (!pool) return false
  const { rowCount } = await pool.query('select 1 from reserved_names where name = $1', [name])
  return rowCount > 0
}

export async function resolveName(name) {
  const pool = getPool()
  if (!pool) return null
  const { rows } = await pool.query(
    `select name, owner_address, created_at, claim_signature, sumsub_verified
       from vanta_names where name = $1`,
    [name],
  )
  return rows[0] ?? null
}

export async function nameAvailability(name) {
  const existing = await resolveName(name)
  if (existing) return { available: false, reason: 'taken', name }
  if (await isReservedName(name)) return { available: false, reason: 'reserved', name }
  return { available: true, name }
}

/**
 * Claim a name for an identity. Caller must have already verified the Ed25519
 * proof from `ownerAddress`, so this only enforces the registry invariants:
 * name free, owner has no other name.
 */
export async function claimName({ name, ownerAddress, claimSignature = null, skrPaid = null }) {
  const pool = getPool()
  if (!pool) return { ok: false, error: 'No database configured' }

  const existing = await resolveName(name)
  if (existing) return { ok: false, error: 'That name is taken', code: 'taken' }
  if (await isReservedName(name)) return { ok: false, error: 'That name is reserved', code: 'reserved' }

  const owned = await namesByOwner(ownerAddress)
  if (owned.length > 0) {
    return {
      ok: false,
      error: `This identity already owns @${owned[0].name}`,
      code: 'owner_taken',
      name: owned[0].name,
    }
  }

  try {
    const { rows } = await pool.query(
      `insert into vanta_names (name, owner_address, claim_signature, skr_paid)
       values ($1,$2,$3,$4)
       returning name, owner_address, created_at`,
      [name, ownerAddress, claimSignature, skrPaid],
    )
    return { ok: true, record: rows[0] }
  } catch (err) {
    // Unique-violation race: two claims for the same name at once.
    if (err.code === '23505') return { ok: false, error: 'That name was just taken', code: 'taken' }
    throw err
  }
}

export async function namesByOwner(ownerAddress) {
  const pool = getPool()
  if (!pool) return []
  const { rows } = await pool.query(
    `select name, owner_address, created_at, sumsub_verified
       from vanta_names where owner_address = $1`,
    [ownerAddress],
  )
  return rows
}

// ── Waitlist ──────────────────────────────────────────────────────────
/**
 * Record a landing-page waitlist signup.
 *
 * Idempotent on email: a repeat signup updates the answers instead of adding a
 * row, so the table is a list of people rather than a list of clicks. Returns
 * `{ ok: false, code: 'duplicate' }` for a re-signup so the caller can still
 * thank the visitor without claiming a new seat.
 */
export async function recordWaitlistSignup({ email, device = null, wants = null, note = null }) {
  const pool = getPool()
  if (!pool) return { ok: false, error: 'No database configured' }

  const normalized = String(email).trim().toLowerCase()
  const { rows } = await pool.query(
    `insert into waitlist (email, device, wants, note)
     values ($1,$2,$3,$4)
     on conflict (email) do update set
       device = coalesce(excluded.device, waitlist.device),
       wants  = coalesce(excluded.wants,  waitlist.wants),
       note   = coalesce(excluded.note,   waitlist.note)
     returning (xmax = 0) as inserted`,
    [normalized, device, wants, note],
  )
  return { ok: true, duplicate: rows[0]?.inserted === false }
}

export async function countWaitlist() {
  const pool = getPool()
  if (!pool) return null
  const { rows } = await pool.query('select count(*)::int as n from waitlist')
  return rows[0]?.n ?? 0
}

export async function releaseName(name, ownerAddress) {
  const pool = getPool()
  if (!pool) return { ok: false, error: 'No database configured' }
  const { rowCount } = await pool.query(
    'delete from vanta_names where name = $1 and owner_address = $2',
    [name, ownerAddress],
  )
  return rowCount > 0 ? { ok: true } : { ok: false, error: 'Not your name' }
}
