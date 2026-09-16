'use strict';

// VANTA relayer — hard risk controls.
//
// These are REQUIREMENTS, not nice-to-haves (see build brief): the relayer's
// fee-payer wallet is a live financial liability. Every value here is a hard
// cap enforced server-side; the client is never trusted.

function num(name, fallback, { min = 0 } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < min) {
    throw new Error(`Invalid env ${name}: expected finite number >= ${min}`);
  }
  return v;
}

function str(name, fallback) {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

// Max SOL a single session can ever spend through the relayer (lamports).
const MAX_SESSION_SPEND_LAMPORTS = num('VANTA_MAX_SESSION_SPEND_LAMPORTS', 0.1 * 1_000_000_000, { min: 1 });

// Max SOL a single co-signed transaction may move (lamports).
const MAX_TX_LAMPORTS = num('VANTA_MAX_TX_LAMPORTS', 0.05 * 1_000_000_000, { min: 1 });

// Global ceiling: sum of all concurrent session caps.
const GLOBAL_CAP_LAMPORTS = num('VANTA_GLOBAL_CAP_LAMPORTS', 5 * 1_000_000_000, { min: 1 });

// Sessions per IP address.
const MAX_SESSIONS_PER_IP = num('VANTA_MAX_SESSIONS_PER_IP', 3, { min: 1 });

// Create-session requests per IP per minute.
const SESSION_CREATES_PER_MINUTE_PER_IP = num('VANTA_SESSION_CREATES_PER_MINUTE_PER_IP', 10, { min: 1 });

// Co-sign requests per session per minute (replay/spam guard).
const COSIGNS_PER_MINUTE_PER_SESSION = num('VANTA_COSIGNS_PER_MINUTE_PER_SESSION', 30, { min: 1 });

// Session time-to-live, seconds.
const SESSION_TTL_SECONDS = num('VANTA_SESSION_TTL_SECONDS', 15 * 60, { min: 30 });

// Request body size cap, bytes.
const MAX_BODY_BYTES = num('VANTA_MAX_BODY_BYTES', 64 * 1024, { min: 1024 });

// Public base URL (for Linkage/workspace docs). Informational only.
const PUBLIC_BASE_URL = str('VANTA_PUBLIC_BASE_URL', 'http://localhost:8787');

// CORS: the web frontend is hosted separately (Netlify/Render static).
// '*' for the hackathon; set VANTA_CORS_ORIGIN to a comma-separated allowlist
// of origins in production.
const CORS_ORIGIN = str('VANTA_CORS_ORIGIN', '*');

// Hot wallet keypair path. When absent, the relayer runs in DRY RUN mode:
// session lifecycle + caps are fully enforced, co-sign always refuses.
const HOT_WALLET_KEYPAIR_PATH = process.env.VANTA_HOT_WALLET_KEYPAIR_PATH || '';

const config = {
  MAX_SESSION_SPEND_LAMPORTS,
  MAX_TX_LAMPORTS,
  GLOBAL_CAP_LAMPORTS,
  MAX_SESSIONS_PER_IP,
  SESSION_CREATES_PER_MINUTE_PER_IP,
  COSIGNS_PER_MINUTE_PER_SESSION,
  SESSION_TTL_SECONDS,
  MAX_BODY_BYTES,
  PUBLIC_BASE_URL,
  CORS_ORIGIN,
  HOT_WALLET_KEYPAIR_PATH,
};

function assertSane() {
  if (MAX_TX_LAMPORTS > MAX_SESSION_SPEND_LAMPORTS) {
    throw new Error('MAX_TX_LAMPORTS cannot exceed MAX_SESSION_SPEND_LAMPORTS');
  }
  if (GLOBAL_CAP_LAMPORTS < MAX_SESSION_SPEND_LAMPORTS) {
    throw new Error('GLOBAL_CAP_LAMPORTS cannot be lower than MAX_SESSION_SPEND_LAMPORTS');
  }
  return true;
}

module.exports = { config, assertSane };
