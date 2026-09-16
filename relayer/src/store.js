'use strict';

// VANTA relayer — session store.
//
// Holds every active session and enforces:
//   - per-session spend cap (MAX_SESSION_SPEND_LAMPORTS)
//   - global concurrent spend cap (GLOBAL_CAP_LAMPORTS)
//   - per-IP session count + create rate limits
//   - per-session co-sign rate limit
//   - TTL expiry and revocation (kill-switch semantics)
//
// The store is intentionally boring: one object in memory, one lock-free
// event loop. Persistence is a deliberate non-goal for the hackathon build
// (sessions are short-lived by design; on restart, sessions die — which is
// the safe failure mode).

const { config } = require('./config');

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

class SessionStore {
  constructor(opts = {}) {
    this.config = opts.config || config;
    this.sessions = new Map(); // sessionId -> session
    this.byIp = new Map(); // ip -> Set<sessionId>
    this.createLog = new Map(); // ip -> number[] (epoch seconds, pruned)
    this.cosignLog = new Map(); // sessionId -> number[] (epoch seconds, pruned)
    this._seq = 0;
  }

  _id() {
    this._seq += 1;
    return `s_${Date.now().toString(36)}_${this._seq.toString(36)}`;
  }

  // ── Create ──────────────────────────────────────────────────────────────

  /**
   * Register a newly provisioned client session key.
   * @param {object} p
   * @param {string} p.clientPubkey   base58 session pubkey generated on device
   * @param {string} p.mainPubkey     base58 main wallet pubkey (Seed Vault)
   * @param {string} p.ip             requester IP
   * @param {string} p.createSignature base58 ed25519 signature by clientPubkey
   * @param {Uint8Array} p.createMessage the exact bytes that were signed
   * @returns {{ok: true, session: object}|{ok: false, error: string, code: string}}
   */
  createSession({ clientPubkey, mainPubkey, ip, createSignature, createMessage }) {
    const t = nowSeconds();
    const cfg = this.config;

    // rate limit: creates per IP per minute
    const log = (this.createLog.get(ip) || []).filter((ts) => t - ts < 60);
    if (log.length >= cfg.SESSION_CREATES_PER_MINUTE_PER_IP) {
      return { ok: false, code: 'rate_limited', error: 'Too many session creates from this IP. Try again later.' };
    }

    // per-IP concurrent session cap
    const ipSet = this.byIp.get(ip) || new Set();
    if (ipSet.size >= cfg.MAX_SESSIONS_PER_IP) {
      return { ok: false, code: 'ip_session_cap', error: `Max ${cfg.MAX_SESSIONS_PER_IP} concurrent sessions per IP.` };
    }

    // global concurrent cap
    if (this.activeSpendCommitted() >= cfg.GLOBAL_CAP_LAMPORTS) {
      return { ok: false, code: 'global_cap', error: 'Relayer at global spend cap. Try again later.' };
    }

    const session = {
      id: this._id(),
      clientPubkey,
      mainPubkey,
      ip,
      createdAt: t,
      expiresAt: t + cfg.SESSION_TTL_SECONDS,
      revoked: false,
      spentLamports: 0,
      // the relayer will only co-sign txs whose fee payer / source is this session key
    };

    log.push(t);
    this.createLog.set(ip, log);
    this.sessions.set(session.id, session);
    ipSet.add(session.id);
    this.byIp.set(ip, ipSet);

    return { ok: true, session };
  }

  // ── Lookup / lifecycle ──────────────────────────────────────────────────

  get(id) {
    return this.sessions.get(id) || null;
  }

  _isLive(session, t = nowSeconds()) {
    return !session.revoked && session.expiresAt > t;
  }

  /**
   * Mark a spend against a session's cap. Called BEFORE co-signing.
   * Atomic within the event loop: check + commit in one synchronous block.
   */
  commitSpend(id, lamports) {
    const session = this.sessions.get(id);
    if (!session) return { ok: false, code: 'not_found', error: 'Unknown session.' };
    if (session.revoked) return { ok: false, code: 'revoked', error: 'Session revoked.' };

    const t = nowSeconds();
    if (session.expiresAt <= t) return { ok: false, code: 'expired', error: 'Session expired.' };

    if (!Number.isInteger(lamports) || lamports <= 0) {
      return { ok: false, code: 'bad_amount', error: 'lamports must be a positive integer.' };
    }

    const newTotal = session.spentLamports + lamports;
    if (newTotal > this.config.MAX_SESSION_SPEND_LAMPORTS) {
      return {
        ok: false,
        code: 'session_cap',
        error: `Exceeds session spend cap (${session.spentLamports}/${this.config.MAX_SESSION_SPEND_LAMPORTS} lamports used).`,
      };
    }

    const globalNow = this.activeSpendCommitted();
    if (globalNow + lamports > this.config.GLOBAL_CAP_LAMPORTS) {
      return { ok: false, code: 'global_cap', error: 'Would exceed relayer global spend cap.' };
    }

    session.spentLamports = newTotal;
    return { ok: true, session };
  }

  /**
   * Rate-limit gate for co-sign requests. Does not consume anything by
   * itself; call once per incoming request.
   */
  checkCosignRate(id) {
    const t = nowSeconds();
    const log = (this.cosignLog.get(id) || []).filter((ts) => t - ts < 60);
    if (log.length >= this.config.COSIGNS_PER_MINUTE_PER_SESSION) {
      return { ok: false, code: 'rate_limited', error: 'Co-sign rate limit exceeded for this session.' };
    }
    log.push(t);
    this.cosignLog.set(id, log);
    return { ok: true };
  }

  /**
   * Revoke a session (kill-switch). Idempotent. Returns the session state
   * snapshot for the client to display ("unspent returned, local wiped").
   */
  revoke(id) {
    const session = this.sessions.get(id);
    if (!session) return { ok: false, code: 'not_found', error: 'Unknown session.' };
    const wasLive = this._isLive(session);
    session.revoked = true;
    session.revokedAt = nowSeconds();
    session.unspentLamports = Math.max(0, this.config.MAX_SESSION_SPEND_LAMPORTS - session.spentLamports);
    return {
      ok: true,
      session,
      wasLive,
      unspentLamports: session.unspentLamports,
    };
  }

  // ── Housekeeping ────────────────────────────────────────────────────────

  activeSpendCommitted() {
    const t = nowSeconds();
    let sum = 0;
    for (const s of this.sessions.values()) {
      if (!s.revoked && s.expiresAt > t) sum += s.spentLamports;
      if (sum > Number.MAX_SAFE_INTEGER - 1) break;
    }
    return sum;
  }

  activeSessionCount() {
    const t = nowSeconds();
    let n = 0;
    for (const s of this.sessions.values()) if (!s.revoked && s.expiresAt > t) n++;
    return n;
  }

  /** Remove expired/revoked sessions older than a grace period. */
  sweep(graceSeconds = 3600) {
    const t = nowSeconds();
    let removed = 0;
    for (const [id, s] of this.sessions) {
      const dead = s.revoked || s.expiresAt <= t;
      if (dead && (s.revokedAt || s.expiresAt) + graceSeconds < t) {
        this.sessions.delete(id);
        const set = this.byIp.get(s.ip);
        if (set) {
          set.delete(id);
          if (set.size === 0) this.byIp.delete(s.ip);
        }
        this.cosignLog.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /** Wipe everything (used by tests). */
  _reset() {
    this.sessions.clear();
    this.byIp.clear();
    this.createLog.clear();
    this.cosignLog.clear();
  }
}

module.exports = { SessionStore };
