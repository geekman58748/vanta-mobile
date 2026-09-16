'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { SessionStore } = require('../src/store');
const { config } = require('../src/config');

function freshStore(overrides = {}) {
  return new SessionStore({ config: { ...config, ...overrides } });
}

const baseSession = {
  clientPubkey: 'ClientPubkey1111111111111111111111111111111',
  mainPubkey: 'MainPubkey111111111111111111111111111111111',
  ip: '1.2.3.4',
  createSignature: 'sig',
  createMessage: new Uint8Array(32),
};

test('createSession enforces per-IP concurrent cap', () => {
  const store = freshStore({ MAX_SESSIONS_PER_IP: 2 });
  assert.ok(store.createSession(baseSession).ok);
  assert.ok(store.createSession({ ...baseSession, clientPubkey: 'C2' }).ok);
  const third = store.createSession({ ...baseSession, clientPubkey: 'C3' });
  assert.strictEqual(third.ok, false);
  assert.strictEqual(third.code, 'ip_session_cap');
});

test('createSession enforces create rate limit per IP', () => {
  const store = freshStore({ MAX_SESSIONS_PER_IP: 100, SESSION_CREATES_PER_MINUTE_PER_IP: 3 });
  for (let i = 0; i < 3; i++) {
    assert.ok(store.createSession({ ...baseSession, clientPubkey: `C${i}` }).ok);
  }
  const fourth = store.createSession({ ...baseSession, clientPubkey: 'C9' });
  assert.strictEqual(fourth.ok, false);
  assert.strictEqual(fourth.code, 'rate_limited');
});

test('commitSpend enforces per-session cap and is cumulative', () => {
  const store = freshStore({ MAX_SESSION_SPEND_LAMPORTS: 1000 });
  const { session } = store.createSession(baseSession);

  assert.ok(store.commitSpend(session.id, 400).ok);
  assert.ok(store.commitSpend(session.id, 400).ok);

  const over = store.commitSpend(session.id, 400); // 800 + 400 > 1000
  assert.strictEqual(over.ok, false);
  assert.strictEqual(over.code, 'session_cap');

  const exact = store.commitSpend(session.id, 200); // exactly 1000
  assert.ok(exact.ok);
});

test('commitSpend rejects bad amounts', () => {
  const store = freshStore();
  const { session } = store.createSession(baseSession);
  assert.strictEqual(store.commitSpend(session.id, 0).code, 'bad_amount');
  assert.strictEqual(store.commitSpend(session.id, -5).code, 'bad_amount');
  assert.strictEqual(store.commitSpend(session.id, 1.5).code, 'bad_amount');
});

test('commitSpend enforces global cap across sessions', () => {
  const store = freshStore({
    MAX_SESSION_SPEND_LAMPORTS: 1000,
    GLOBAL_CAP_LAMPORTS: 1500,
  });
  const a = store.createSession({ ...baseSession, clientPubkey: 'A', ip: '1.1.1.1' }).session;
  const b = store.createSession({ ...baseSession, clientPubkey: 'B', ip: '2.2.2.2' }).session;

  assert.ok(store.commitSpend(a.id, 1000).ok);
  const over = store.commitSpend(b.id, 600); // 1000 + 600 > 1500
  assert.strictEqual(over.ok, false);
  assert.strictEqual(over.code, 'global_cap');
  assert.ok(store.commitSpend(b.id, 500).ok); // exactly 1500
});

test('revoke is idempotent and reports unspent correctly', () => {
  const store = freshStore({ MAX_SESSION_SPEND_LAMPORTS: 1000 });
  const { session } = store.createSession(baseSession);
  store.commitSpend(session.id, 300);

  const first = store.revoke(session.id);
  assert.ok(first.ok);
  assert.strictEqual(first.wasLive, true);
  assert.strictEqual(first.unspentLamports, 700);

  const second = store.revoke(session.id);
  assert.ok(second.ok);
  assert.strictEqual(second.wasLive, false); // already revoked
  assert.strictEqual(second.unspentLamports, 700);
});

test('revoked session cannot spend', () => {
  const store = freshStore();
  const { session } = store.createSession(baseSession);
  store.revoke(session.id);
  const out = store.commitSpend(session.id, 1);
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.code, 'revoked');
});

test('expired session cannot spend', () => {
  const store = freshStore({ SESSION_TTL_SECONDS: 30 });
  const { session } = store.createSession(baseSession);
  // Fast-forward expiry without sleeping the test.
  session.expiresAt = Math.floor(Date.now() / 1000) - 1;
  const out = store.commitSpend(session.id, 1);
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.code, 'expired');
});

test('cosign rate limit per session', () => {
  const store = freshStore({ COSIGNS_PER_MINUTE_PER_SESSION: 3 });
  const { session } = store.createSession(baseSession);
  for (let i = 0; i < 3; i++) assert.ok(store.checkCosignRate(session.id).ok);
  const over = store.checkCosignRate(session.id);
  assert.strictEqual(over.ok, false);
  assert.strictEqual(over.code, 'rate_limited');
});

test('sweep removes dead sessions and frees IP slots', () => {
  const store = freshStore({ MAX_SESSIONS_PER_IP: 1 });
  const s1 = store.createSession(baseSession).session;
  store.revoke(s1.id);
  s1.revokedAt = Math.floor(Date.now() / 1000) - 7200; // 2h ago

  const before = store.createSession({ ...baseSession, clientPubkey: 'NEW' });
  assert.strictEqual(before.ok, false, 'IP slot still held by revoked session');

  const removed = store.sweep(3600);
  assert.strictEqual(removed, 1);

  const after = store.createSession({ ...baseSession, clientPubkey: 'NEW' });
  assert.ok(after.ok, 'IP slot freed after sweep');
});

test('unknown session handling', () => {
  const store = freshStore();
  assert.strictEqual(store.get('nope'), null);
  assert.strictEqual(store.commitSpend('nope', 1).code, 'not_found');
  assert.strictEqual(store.revoke('nope').ok, false);
});
