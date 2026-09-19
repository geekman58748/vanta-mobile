'use strict';

// VANTA relayer — HTTP API (dependency-free, node:http).
//
// Routes:
//   POST /v1/session          create session   { clientPubkey, mainPubkey, createSignature }
//   POST /v1/session/:id/cosign   co-sign + spend-cap commit
//   POST /v1/session/:id/revoke   kill-switch (idempotent)
//   GET  /v1/session/:id          status
//   GET  /healthz                 liveness + risk-control snapshot
//
// SECURITY MODEL
//   - The relayer NEVER sees main-wallet secrets. The client signs the create
//     request with the *session* key; the relayer verifies it before opening a
//     session.
//   - Co-signing is fail-closed: until VANTA_HOT_WALLET_KEYPAIR_PATH is set,
//     every /cosign request returns 503 DRY_RUN. Session caps, rate limits and
//     revocation are fully enforced either way.

const http = require('node:http');
const crypto = require('node:crypto');
const { config, assertSane } = require('./config');
const { SessionStore } = require('./store');
const { NameRegistry } = require('./names');
const { encode: b58encode, decode: b58decode } = require('./base58');

// Raw 32-byte ed25519 keys are rejected by OpenSSL 3's decoder (Node >= 17
// one-shot APIs). Wrap the raw key bytes in the fixed SPKI DER prefix for
// the Ed25519 algorithm OID before handing them to crypto.verify.
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function verifyEd25519(pubkeyB58, sigB58, messageBytes) {
  try {
    const pubkey = b58decode(pubkeyB58);
    const sig = b58decode(sigB58);
    if (pubkey.length !== 32 || sig.length !== 64) return false;
    const key = crypto.createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(pubkey)]),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(null, messageBytes, key, sig);
  } catch {
    return false;
  }
}

function createMessageBytes({ clientPubkey, mainPubkey, issuedAt }) {
  // Domain-separated, canonical: everything the relayer cares about, fixed order.
  return Buffer.concat([
    Buffer.from('vanta-session-create-v1\0'),
    Buffer.from(b58decode(clientPubkey)),
    Buffer.from(b58decode(mainPubkey)),
    Buffer.from(issuedAt.toString(10), 'ascii'),
  ]);
}

// Main-wallet CONSENT message. When the client supplies mainSignature, the
// claimed main wallet must have signed exactly these bytes — proof that the
// owner of the main address opted into shielding. Human-readable ON PURPOSE:
// wallet UIs (Phantom/Backpack/Solflare signMessage, Seed Vault, MWA) display
// these bytes as text, so this IS the approval prompt the user sees. Must
// stay byte-identical to buildConsentMessage in both session engines.
function consentMessageBytes({ clientPubkey, mainPubkey, issuedAt }) {
  return Buffer.from(
    'VANTA session consent v1\n' +
    `Shield wallet (disposable): ${clientPubkey}\n` +
    `Main wallet: ${mainPubkey}\n` +
    `Issued at: ${issuedAt}\n` +
    'By signing, the main wallet approves VANTA shielding transactions for this session key only.',
    'utf8',
  );
}

function json(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': buf.length,
    'x-content-type-options': 'nosniff',
  });
  res.end(buf);
}

// CORS for the separately-hosted web frontend. Headers are attached to every
// response; preflights get a 204. Allowlist mode when CORS_ORIGIN != '*'.
function applyCors(req, res, corsOrigin) {
  const origin = req.headers.origin;
  let allow = '';
  if (corsOrigin === '*') {
    allow = '*';
  } else if (origin && corsOrigin.split(',').map((s) => s.trim()).includes(origin)) {
    allow = origin;
  }
  if (allow) {
    res.setHeader('access-control-allow-origin', allow);
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-max-age', '86400');
    res.setHeader('vary', 'Origin');
  }
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function createRelayer({ store, signer, config: cfg = config, logger = console } = {}) {
  assertSane();
  const theStore = store || new SessionStore({ config: cfg });
  const dryRun = !signer;

  // Default no-op signer: fail-closed. Real signer loads the hot wallet
  // keypair and co-signs; injected here so tests can use a stub.
  const cosign = signer || (async () => {
    const err = new Error('DRY RUN: no hot wallet configured (set VANTA_HOT_WALLET_KEYPAIR_PATH)');
    err.statusCode = 503;
    err.code = 'dry_run';
    throw err;
  });

  // Off-chain .vanta name registry (social layer). Cryptographic ownership,
  // zero on-chain footprint — see src/names.js for the trust model.
  const names = new NameRegistry({ verifyEd25519, logger });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    // Behind Render/Netlify proxies every socket looks like the proxy IP;
    // prefer the forwarded chain (first hop = original client).
    const fwd = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(fwd) ? fwd[0] : (fwd ? fwd.split(',')[0].trim() : null))
      || (req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');

    applyCors(req, res, cfg.CORS_ORIGIN);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    try {
      // ── health ──────────────────────────────────────────────────────────
      if (req.method === 'GET' && path === '/healthz') {
        return json(res, 200, {
          ok: true,
          mode: dryRun ? 'dry_run' : 'live',
          activeSessions: theStore.activeSessionCount(),
          globalSpendCommitted: theStore.activeSpendCommitted(),
          names: names.stats(),
          caps: {
            maxSessionSpendLamports: cfg.MAX_SESSION_SPEND_LAMPORTS,
            maxTxLamports: cfg.MAX_TX_LAMPORTS,
            globalCapLamports: cfg.GLOBAL_CAP_LAMPORTS,
            sessionTtlSeconds: cfg.SESSION_TTL_SECONDS,
            maxSessionsPerIp: cfg.MAX_SESSIONS_PER_IP,
          },
        });
      }

      // ── create session ──────────────────────────────────────────────────
      if (req.method === 'POST' && path === '/v1/session') {
        const raw = await readBody(req, cfg.MAX_BODY_BYTES);
        let body;
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          return json(res, 400, { ok: false, error: 'Invalid JSON' });
        }
        const { clientPubkey, mainPubkey, createSignature } = body;
        if (!clientPubkey || !mainPubkey || !createSignature) {
          return json(res, 400, { ok: false, error: 'clientPubkey, mainPubkey and createSignature are required' });
        }

        // Verify the session key controls this request before opening anything.
        const issuedAt = Math.floor(Date.now() / 1000);
        const message = createMessageBytes({ clientPubkey, mainPubkey, issuedAt: body.issuedAt || issuedAt });
        // Replay guard: client supplies issuedAt; server binds it to the message.
        const msgWithClientTs = createMessageBytes({
          clientPubkey,
          mainPubkey,
          issuedAt: typeof body.issuedAt === 'number' ? body.issuedAt : issuedAt,
        });
        if (!verifyEd25519(clientPubkey, createSignature, msgWithClientTs)) {
          return json(res, 401, { ok: false, error: 'createSignature failed verification' });
        }

        // Optional main-wallet consent: when mainSignature is present, the
        // MAIN wallet itself must have signed the consent message. Fail-closed
        // on a bad signature — a wrong mainSignature never opens a session.
        let consentVerified = false;
        if (body.mainSignature !== undefined) {
          if (typeof body.issuedAt !== 'number') {
            return json(res, 400, { ok: false, error: 'issuedAt is required with mainSignature' });
          }
          const consent = consentMessageBytes({ clientPubkey, mainPubkey, issuedAt: body.issuedAt });
          if (!verifyEd25519(mainPubkey, body.mainSignature, consent)) {
            // Diagnostic (never sent to the client): pinpoints WHICH check
            // broke — key, timestamp, or signature bytes — from the logs.
            const sigBytes = (() => { try { return b58decode(body.mainSignature); } catch { return null; } })();
            console.warn('[consent] verify FAILED', JSON.stringify({
              mainPubkey,
              issuedAt: body.issuedAt,
              sigLen: sigBytes ? sigBytes.length : 'undecodable',
              sigB58Prefix: typeof body.mainSignature === 'string' ? body.mainSignature.slice(0, 12) : null,
              clientPubkey,
            }));
            return json(res, 401, { ok: false, code: 'bad_main_signature', error: 'mainSignature failed verification' });
          }
          consentVerified = true;
        }

        const out = theStore.createSession({ clientPubkey, mainPubkey, ip, createSignature, createMessage: msgWithClientTs });
        if (!out.ok) {
          const status = out.code === 'rate_limited' ? 429 : 403;
          return json(res, status, { ok: false, code: out.code, error: out.error });
        }
        return json(res, 201, {
          ok: true,
          session: {
            id: out.session.id,
            clientPubkey: out.session.clientPubkey,
            mainPubkey: out.session.mainPubkey,
            expiresAt: out.session.expiresAt,
            spendCapLamports: cfg.MAX_SESSION_SPEND_LAMPORTS,
            txCapLamports: cfg.MAX_TX_LAMPORTS,
            consentVerified,
          },
        });
      }

      // ── /v1/session/:id/... ─────────────────────────────────────────────
      const m = path.match(/^\/v1\/session\/([^/]+)(\/(cosign|revoke))?$/);
      if (m) {
        const id = m[1];
        const action = m[3] || null;

        if (req.method === 'GET' && !action) {
          const s = theStore.get(id);
          if (!s) return json(res, 404, { ok: false, error: 'Unknown session' });
          const t = Math.floor(Date.now() / 1000);
          return json(res, 200, {
            ok: true,
            session: {
              id: s.id,
              clientPubkey: s.clientPubkey,
              revoked: s.revoked,
              expiresAt: s.expiresAt,
              live: !s.revoked && s.expiresAt > t,
              spentLamports: s.spentLamports,
              spendCapLamports: cfg.MAX_SESSION_SPEND_LAMPORTS,
            },
          });
        }

        if (req.method === 'POST' && action === 'revoke') {
          const out = theStore.revoke(id);
          if (!out.ok) return json(res, 404, { ok: false, code: out.code, error: out.error });
          return json(res, 200, {
            ok: true,
            revoked: true,
            wasLive: out.wasLive,
            unspentLamports: out.unspentLamports,
          });
        }

        if (req.method === 'POST' && action === 'cosign') {
          const raw = await readBody(req, cfg.MAX_BODY_BYTES);
          let body;
          try {
            body = JSON.parse(raw.toString('utf8'));
          } catch {
            return json(res, 400, { ok: false, error: 'Invalid JSON' });
          }
          const lamports = body.lamports;
          if (!Number.isInteger(lamports) || lamports <= 0) {
            return json(res, 400, { ok: false, error: 'lamports must be a positive integer' });
          }
          if (lamports > cfg.MAX_TX_LAMPORTS) {
            return json(res, 403, { ok: false, code: 'tx_cap', error: `Single tx exceeds MAX_TX_LAMPORTS (${cfg.MAX_TX_LAMPORTS}).` });
          }

          const rate = theStore.checkCosignRate(id);
          if (!rate.ok) return json(res, 429, { ok: false, code: rate.code, error: rate.error });

          // Commit the spend BEFORE co-signing; if co-sign fails we roll back
          // so clients are not double-charged against their cap.
          const commit = theStore.commitSpend(id, lamports);
          if (!commit.ok) {
            const status = commit.code === 'not_found' ? 404 : commit.code === 'rate_limited' ? 429 : 403;
            return json(res, status, { ok: false, code: commit.code, error: commit.error });
          }

          try {
            const signature = await cosign({ session: commit.session, lamports, tx: body.tx });
            return json(res, 200, { ok: true, signature, spentLamports: commit.session.spentLamports });
          } catch (err) {
            // roll back the cap reservation on failure
            commit.session.spentLamports = Math.max(0, commit.session.spentLamports - lamports);
            logger.error?.('cosign failed:', err.message);
            return json(res, err.statusCode || 500, { ok: false, code: err.code || 'cosign_failed', error: err.message });
          }
        }
      }

      // ── name registry (off-chain social layer) ─────────────────────────
      if (req.method === 'POST' && path === '/v1/names/claim') {
        const raw = await readBody(req, cfg.MAX_BODY_BYTES);
        let body;
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          return json(res, 400, { ok: false, error: 'Invalid JSON' });
        }
        const out = names.claim({
          name: body.name,
          ownerPubkey: body.ownerPubkey,
          issuedAt: body.issuedAt,
          signature: body.signature,
          kyc: body.kyc,
          ip,
        });
        return json(res, out.ok ? 201 : out.status, out.ok ? { ok: true, record: out.record } : { ok: false, code: out.code, error: out.error });
      }

      const nm = path.match(/^\/v1\/names\/([^/]+)(\/(receive|kyc))?$/);
      if (nm) {
        const nameKey = nm[1].replace(/\.vanta$/, ''); // accept with or without suffix
        const action = nm[3] || null;

        if (req.method === 'GET' && !action) {
          const rec = names.resolve(nameKey);
          if (!rec) return json(res, 404, { ok: false, error: 'Unknown name' });
          return json(res, 200, { ok: true, record: rec });
        }

        if (req.method === 'POST' && (action === 'receive' || action === 'kyc')) {
          const raw = await readBody(req, cfg.MAX_BODY_BYTES);
          let body;
          try {
            body = JSON.parse(raw.toString('utf8'));
          } catch {
            return json(res, 400, { ok: false, error: 'Invalid JSON' });
          }
          const out = action === 'receive'
            ? names.setReceive({
              name: nameKey,
              receivePubkey: body.receivePubkey,
              issuedAt: body.issuedAt,
              signature: body.signature,
              // Liveness proof: the signing session key must belong to a
              // currently-shielded session on THIS relayer (fail-closed).
              liveSessionPubkey: theStore.findLiveByClientPubkey(body.clientPubkey)
                ? body.clientPubkey
                : null,
            })
            : names.setKyc({ name: nameKey, ownerPubkey: body.ownerPubkey, issuedAt: body.issuedAt, signature: body.signature, kyc: body.kyc });
          return json(res, out.ok ? 200 : out.status, out.ok ? { ok: true, record: out.record } : { ok: false, code: out.code, error: out.error });
        }
      }

      return json(res, 404, { ok: false, error: 'Not found' });
    } catch (err) {
      logger.error?.('request error:', err.message);
      return json(res, err.statusCode || 500, { ok: false, error: err.message });
    }
  });

  server.theStore = theStore;
  server.names = names;
  server.dryRun = dryRun;
  return server;
}

module.exports = { createRelayer, verifyEd25519, createMessageBytes, NameRegistry };
