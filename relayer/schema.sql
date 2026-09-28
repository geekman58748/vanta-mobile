-- Vanta relayer — Postgres schema.
--
-- Applied idempotently on relayer boot (see db.js initSchema). Kept as a file as
-- well so it can be applied by hand against a fresh Neon branch.
--
-- WHY THE RELAYER OWNS THIS TABLE
-- The client cannot be trusted to write its own history: it can lie, it can be
-- offline, and its localStorage is wiped by a reinstall. The relayer is the
-- authoritative observer of everything it sponsors. Rows it writes are marked
-- flow_source = 'relayer'; rows the client reports are marked 'client' and are
-- only accepted after the signature is confirmed to exist on-chain.
--
-- NOTE ON COVERAGE: Shadow and Ghost spends do NOT pass through the relayer.
-- The SDK requires feePayer == shielded owner, so X signs and submits those
-- itself. They reach this table via POST /tx/report and are marked unverified
-- until the on-chain lookup succeeds. That asymmetry is the whole reason the
-- per-leg receipt exists — see HANDOFF.md §3.1.

-- ── Transaction history ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id                bigserial PRIMARY KEY,
  signature         text        NOT NULL UNIQUE,
  network           text        NOT NULL DEFAULT 'devnet',
  status            text        NOT NULL DEFAULT 'submitted', -- submitted|confirmed|failed
  error             text,

  -- What kind of movement this was, and who said so.
  flow              text,                                     -- shield|shadow|ghost|register|fund|send
  flow_source       text        NOT NULL DEFAULT 'client',    -- 'relayer' = observed, 'client' = reported
  verified_on_chain boolean     NOT NULL DEFAULT false,

  -- Who was involved. `actors` are the non-relayer signers; `primary_actor` is
  -- the address this row is attributed to (and the one /tx/:address queries by).
  relayer_fee_payer text,
  actors            text[]      NOT NULL DEFAULT '{}',
  primary_actor     text,

  -- Forensics: the programs the transaction actually touched.
  programs          text[]      NOT NULL DEFAULT '{}',

  -- The client's own note about what it sent (currently just the mode).
  -- Deliberately NOT an amount and NOT a recipient: see the AUDIT note below.
  client_report     jsonb,

  slot              bigint,
  block_time        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  confirmed_at      timestamptz
);

-- ── Privacy migration: the relayer must not hold the payment graph ───────────
-- AUDIT-2026-09-27 C2. `amount_atomic` and `counterparty` were written by
-- POST /tx/report (the amounts and recipients of Shadow/Ghost sends — exactly
-- what the shielded pool hides) and by POST /fund. Rows are keyed by an
-- identity address and were readable by anyone holding the RELAYER_TOKEN that
-- ships inside the APK, so unzipping the app handed over the graph the product
-- is built to hide.
--
-- The client no longer sends them and the relayer no longer accepts them; these
-- statements drop the stored copies on the next boot. initSchema runs this file
-- every time, so they are also the reason a future re-add cannot silently
-- resurrect the columns' contents.
ALTER TABLE transactions DROP COLUMN IF EXISTS amount_atomic;
ALTER TABLE transactions DROP COLUMN IF EXISTS counterparty;
-- Scrub the same facts from older rows' client_report payloads.
UPDATE transactions
   SET client_report = client_report - 'amount' - 'counterparty'
 WHERE client_report ?| array['amount', 'counterparty'];

-- The app's main read is "my history, newest first".
CREATE INDEX IF NOT EXISTS transactions_primary_actor_idx
  ON transactions (primary_actor, created_at DESC);

CREATE INDEX IF NOT EXISTS transactions_flow_idx
  ON transactions (flow, created_at DESC);

-- ── .vanta name registry ──────────────────────────────────────────────
-- A name maps a human handle to a Vanta *shielded identity* owner address, so a
-- sender can pay `ai.vanta` instead of pasting a 44-character key. This is an
-- app-level registry, not an on-chain one: SNS owns the `.sol` TLD and a real
-- `.vanta` TLD does not exist. The name is a lookup convenience, nothing more —
-- it must never be presented as a privacy primitive.
CREATE TABLE IF NOT EXISTS vanta_names (
  name            text        PRIMARY KEY,   -- lowercase, WITHOUT the '.vanta' suffix
  owner_address   text        NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Provenance: which tx paid for it, and how much.
  claim_signature text,
  skr_paid        numeric(30, 9),
  sumsub_verified boolean     NOT NULL DEFAULT false,

  -- 2–20 chars, lowercase alphanumerics with single internal hyphens.
  -- Minimum is 2 so short handles like `ai.vanta` are claimable.
  CONSTRAINT vanta_names_format CHECK (name ~ '^[a-z0-9](?:[a-z0-9-]{0,18})[a-z0-9]$')
);

-- Migration for databases created before the minimum length was lowered from 3
-- to 2. CREATE TABLE IF NOT EXISTS will not update a constraint on an existing
-- table, so it has to be dropped and re-added. Cheap on a table this size.
ALTER TABLE vanta_names DROP CONSTRAINT IF EXISTS vanta_names_format;
ALTER TABLE vanta_names ADD CONSTRAINT vanta_names_format
  CHECK (name ~ '^[a-z0-9](?:[a-z0-9-]{0,18})[a-z0-9]$');

CREATE INDEX IF NOT EXISTS vanta_names_owner_idx ON vanta_names (owner_address);

-- Reserved so nobody can impersonate the project or squat obvious handles.
-- Enforced in code as well (RESERVED_NAMES in db.js); this is the durable copy.
CREATE TABLE IF NOT EXISTS reserved_names (
  name   text PRIMARY KEY,
  reason text
);

INSERT INTO reserved_names (name, reason) VALUES
  ('vanta',   'project'),
  ('admin',   'impersonation'),
  ('support', 'impersonation'),
  ('help',    'impersonation'),
  ('team',    'impersonation'),
  ('official','impersonation'),
  ('staff',   'impersonation'),
  ('root',    'infrastructure'),
  ('api',     'infrastructure'),
  ('www',     'infrastructure'),
  ('app',     'infrastructure'),
  ('helius',  'partner'),
  ('solana',  'ecosystem'),
  ('seeker',  'ecosystem'),
  ('phantom', 'impersonation'),
  ('solflare','impersonation'),
  ('backpack','impersonation'),
  ('jupiter', 'impersonation'),
  ('sumsub',  'partner')
ON CONFLICT (name) DO NOTHING;
