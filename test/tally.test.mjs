// PRD US-009: the counter only counts real, known results, and stops at the daily cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_CAP, canonicalGetUrl, handleGet, handlePost } from '../src/lib/tally-core.js';

// Minimal stand-in for Cloudflare D1: the two SQL shapes tally-core uses.
function fakeDb(seed = {}) {
  const rows = new Map(Object.entries(seed));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run() {
      if (sql.startsWith('INSERT')) {
        const cur = rows.get(args[0]) || 0;
        if (sql.includes('WHERE n < ?2') && rows.has(args[0]) && cur >= args[1]) return { results: [] };
        rows.set(args[0], cur + 1);
        return { results: [{ n: cur + 1 }] };
      }
      return { results: args.filter((k) => rows.has(k)).map((k) => ({ key: k, n: rows.get(k) })) };
    },
    async first(col) {
      return this.run().results[0]?.[col] ?? null;
    },
    async all() {
      return this.run();
    },
  });
  return { rows, prepare: (sql) => stmt(sql), batch: async (list) => list.map((s) => s.run()) };
}

const isKnown = (slug, type) => slug === 'jon-jones' && type === 'GCF';
const post = (body) =>
  new Request('https://x/api/tally', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const verifier = (success) => async () => new Response(JSON.stringify({ success }));
const env = (db) => ({ DB: db, TURNSTILE_SECRET: 'test' });
const today = '2026-11-13';

test('counts a verified quiz and returns the new numbers', async () => {
  const db = fakeDb({ total: 62 });
  const res = await handlePost({ env: env(db), request: post({ slug: 'jon-jones', type: 'GCF', token: 't' }), isKnown, fetchImpl: verifier(true), today });
  assert.equal(res.status, 200);
  // The type share is over counted quizzes (typed), not the seeded total.
  assert.deepEqual(await res.json(), { enabled: true, total: 63, typed: 1, fighter: 1, type: 1 });
});

test('refuses a failed bot check, a missing token and unknown results without writing', async () => {
  const db = fakeDb({ total: 62 });
  const cases = [
    [{ slug: 'jon-jones', type: 'GCF', token: 't' }, verifier(false), 403],
    [{ slug: 'jon-jones', type: 'GCF' }, verifier(true), 403],
    [{ slug: 'nobody', type: 'GCF', token: 't' }, verifier(true), 400],
    [{ slug: 'jon-jones', type: 'SPF', token: 't' }, verifier(true), 400],
  ];
  for (const [body, fetchImpl, status] of cases) {
    const res = await handlePost({ env: env(db), request: post(body), isKnown, fetchImpl, today });
    assert.equal(res.status, status, JSON.stringify(body));
  }
  assert.deepEqual([...db.rows], [['total', 62]]);
});

test('stops counting, and stops writing, past the daily cap', async () => {
  const db = fakeDb({ total: 62, [`day:${today}`]: DAILY_CAP });
  for (let i = 0; i < 3; i++) {
    const res = await handlePost({ env: env(db), request: post({ slug: 'jon-jones', type: 'GCF', token: 't' }), isKnown, fetchImpl: verifier(true), today });
    assert.equal(res.status, 429);
  }
  assert.equal(db.rows.get('total'), 62);
  assert.equal(db.rows.get(`day:${today}`), DAILY_CAP);
});

test('junk query strings map onto the same cache key', () => {
  const a = canonicalGetUrl(new URL('https://x/api/tally?junk=1'), isKnown);
  const b = canonicalGetUrl(new URL('https://x/api/tally?junk=2&f=nobody&t=GCF'), isKnown);
  assert.equal(a.toString(), 'https://x/api/tally');
  assert.equal(b.toString(), 'https://x/api/tally');
  const c = canonicalGetUrl(new URL('https://x/api/tally?t=GCF&zz=1&f=jon-jones'), isKnown);
  assert.equal(c.toString(), 'https://x/api/tally?f=jon-jones&t=GCF');
});

test('is switched off cleanly until the database and secret exist', async () => {
  const res = await handlePost({ env: {}, request: post({}), isKnown, fetchImpl: verifier(true), today });
  assert.equal(res.status, 503);
  const get = await handleGet({ env: {}, url: new URL('https://x/api/tally'), isKnown });
  assert.deepEqual(await get.json(), { enabled: false });
  // A database without the bot-check secret is still off, reads included.
  const half = await handleGet({ env: { DB: fakeDb({ total: 62 }) }, url: new URL('https://x/api/tally'), isKnown });
  assert.deepEqual(await half.json(), { enabled: false });
});

test('reads totals, and fighter counts only for known results', async () => {
  const db = fakeDb({ total: 70, typed: 8, 'fighter:jon-jones': 5, 'type:GCF': 6 });
  const known = await handleGet({ env: env(db), url: new URL('https://x/api/tally?f=jon-jones&t=GCF'), isKnown });
  assert.deepEqual(await known.json(), { enabled: true, total: 70, typed: 8, fighter: 5, type: 6 });
  const unknown = await handleGet({ env: env(db), url: new URL('https://x/api/tally?f=x&t=GCF'), isKnown });
  assert.deepEqual(await unknown.json(), { enabled: true, total: 70, typed: 8, fighter: 0, type: 0 });
});
