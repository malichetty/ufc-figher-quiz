// PRD acceptance criteria US-001, US-002, US-003 (tasks/prd-relaunch.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findMatch } from '../src/lib/match.js';
import { QUESTIONS } from '../src/lib/questions.js';
import { TYPE_CODES } from '../src/lib/types.js';
import { parseShareLocation, sanitizeName, sharePath } from '../src/lib/share.js';

const roster = JSON.parse(readFileSync(new URL('../src/data/roster.json', import.meta.url), 'utf8'));

const allAnswers = [];
for (let i = 0; i < 4 ** QUESTIONS.length; i++) {
  allAnswers.push(QUESTIONS.map((_, k) => (i >> (2 * k)) & 3));
}

for (const division of ['all', 'men', 'women']) {
  test(`US-001 result spread, division=${division}`, () => {
    const counts = new Map();
    const types = new Set();
    for (const a of allAnswers) {
      const r = findMatch(roster, a, division);
      counts.set(r.fighter.slug, (counts.get(r.fighter.slug) || 0) + 1);
      types.add(r.type);
      if (division === 'men') assert.equal(r.fighter.women, false, r.fighter.name);
      if (division === 'women') assert.equal(r.fighter.women, true, r.fighter.name);
    }
    // The women's pool is ~60 fighters, so its cap is looser.
    const cap = division === 'women' ? 0.1 : 0.08;
    const [topSlug, topCount] = [...counts].sort((x, y) => y[1] - x[1])[0];
    assert.ok(topCount / allAnswers.length <= cap, `${topSlug} gets ${topCount} of ${allAnswers.length}`);
    assert.ok(counts.size >= (division === 'women' ? 40 : 60), `only ${counts.size} fighters reachable`);
    if (division !== 'women') assert.equal(types.size, TYPE_CODES.length);
  });
}

test('US-001 pool is current and includes every champion', () => {
  const cutoff = new Date(Date.parse(roster.snapshot) - 548 * 86400000).toISOString().slice(0, 10);
  for (const f of roster.fighters) assert.ok(f.lastFight >= cutoff, `${f.name} last fought ${f.lastFight}`);
  assert.ok(roster.fighters.filter((f) => f.champion).length >= 8);
  assert.equal(new Set(roster.fighters.map((f) => f.slug)).size, roster.fighters.length);
});

test('US-001 same answers always give the same fighter', () => {
  const a = [0, 1, 2, 3, 0, 1];
  assert.equal(findMatch(roster, a).fighter.slug, findMatch(roster, a).fighter.slug);
});

test('US-002 names are reduced to allowed characters', () => {
  assert.equal(sanitizeName('<script>alert(1)</script>'), 'scriptalertscript');
  assert.equal(sanitizeName('Aris 🥊'), 'Aris');
  assert.equal(sanitizeName("  José   O'Neil-Smith  "), "José O'Neil-Smith");
  assert.equal(sanitizeName('x'.repeat(50)).length, 20);
  assert.equal(sanitizeName(null), '');
});

test('US-003 share URLs round-trip, and old links still parse', () => {
  const path = sharePath({ slug: 'justin-gaethje', name: 'Aris', answers: [0, 1, 2, 3, 0, 1], division: 'men' });
  assert.equal(path, '/r/justin-gaethje?n=Aris&a=012301&d=men');
  const [pathname, search] = path.split('?');
  assert.deepEqual(parseShareLocation(pathname, `?${search}`), {
    slug: 'justin-gaethje',
    name: 'Aris',
    answers: [0, 1, 2, 3, 0, 1],
    division: 'men',
    legacy: false,
  });
  const bad = parseShareLocation('/r/justin-gaethje', '?a=9999&d=nope');
  assert.equal(bad.answers, null);
  assert.equal(bad.division, 'all');
  assert.equal(parseShareLocation('/', '?result=jon-jones&from=Aris').slug, 'jon-jones');
  assert.equal(parseShareLocation('/r/<bad>', ''), null);
});
