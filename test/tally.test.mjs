// PRD US-009: the counter only counts real, known results, and stops at the daily cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_CAP, handleGet, handlePost } from '../src/lib/tally-core.js';

// Minimal stand-in for Cloudflare D1: the two SQL shapes tally-core uses.
function fakeDb(seed = {}) {
  const rows = new Map(Object.entries(seed));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run() {
      if (sql.startsWith('INSERT')) {
        const n = (rows.get(args[0]) || 0) + 1;
        rows.set(args[0], n);
        return { results: [{ n }] };
      }
      return { results: args.filter((k) => rows.has(k)).map((k) => ({ key: k, n: rows.get(k) })) };
    },
    async first(col) {
      return this.run().results[0][col];
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
  assert.deepEqual(await res.json(), { enabled: true, total: 63, fighter: 1, type: 1 });
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

test('stops counting past the daily cap', async () => {
  const db = fakeDb({ total: 62, [`day:${today}`]: DAILY_CAP });
  const res = await handlePost({ env: env(db), request: post({ slug: 'jon-jones', type: 'GCF', token: 't' }), isKnown, fetchImpl: verifier(true), today });
  assert.equal(res.status, 429);
  assert.equal(db.rows.get('total'), 62);
});

test('is switched off cleanly until the database and secret exist', async () => {
  const res = await handlePost({ env: {}, request: post({}), isKnown, fetchImpl: verifier(true), today });
  assert.equal(res.status, 503);
  const get = await handleGet({ env: {}, url: new URL('https://x/api/tally'), isKnown });
  assert.deepEqual(await get.json(), { enabled: false });
});

test('reads totals, and fighter counts only for known results', async () => {
  const db = fakeDb({ total: 70, 'fighter:jon-jones': 5, 'type:GCF': 9 });
  const known = await handleGet({ env: env(db), url: new URL('https://x/api/tally?f=jon-jones&t=GCF'), isKnown });
  assert.deepEqual(await known.json(), { enabled: true, total: 70, fighter: 5, type: 9 });
  const unknown = await handleGet({ env: env(db), url: new URL('https://x/api/tally?f=x&t=GCF'), isKnown });
  assert.deepEqual(await unknown.json(), { enabled: true, total: 70, fighter: 0, type: 0 });
});
