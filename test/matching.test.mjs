// PRD acceptance criteria US-001, US-002, US-003 (tasks/prd-relaunch.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findMatch } from '../src/lib/match.js';
import { QUESTIONS } from '../src/lib/questions.js';
import { TYPE_CODES } from '../src/lib/types.js';
import { parseShareLocation, sanitizeName, sharePath } from '../src/lib/share.js';
import { buildRoster } from '../src/lib/roster.js';

const roster = JSON.parse(readFileSync(new URL('../src/data/roster.json', import.meta.url), 'utf8'));

const allAnswers = [];
for (let i = 0; i < 4 ** QUESTIONS.length; i++) {
  allAnswers.push(QUESTIONS.map((_, k) => (i >> (2 * k)) & 3));
}

// Women's divisions have fewer names people know, so their bars are looser.
const SPREAD = {
  all: { cap: 0.08, distinct: 100, famous: 0.8 },
  men: { cap: 0.08, distinct: 100, famous: 0.8 },
  women: { cap: 0.12, distinct: 35, famous: 0.5 },
};

for (const division of ['all', 'men', 'women']) {
  test(`US-001 result spread and fame, division=${division}`, () => {
    const counts = new Map();
    const types = new Set();
    let famous = 0;
    for (const a of allAnswers) {
      const r = findMatch(roster, a, division);
      counts.set(r.fighter.slug, (counts.get(r.fighter.slug) || 0) + 1);
      types.add(r.type);
      if (r.fighter.champion || r.fighter.tier) famous += 1;
      if (division === 'men') assert.equal(r.fighter.women, false, r.fighter.name);
      if (division === 'women') assert.equal(r.fighter.women, true, r.fighter.name);
    }
    const bar = SPREAD[division];
    const [topSlug, topCount] = [...counts].sort((x, y) => y[1] - x[1])[0];
    assert.ok(topCount / allAnswers.length <= bar.cap, `${topSlug} gets ${topCount} of ${allAnswers.length}`);
    assert.ok(counts.size >= bar.distinct, `only ${counts.size} fighters reachable`);
    assert.ok(famous / allAnswers.length >= bar.famous, `only ${famous} famous results`);
    if (division !== 'women') assert.equal(types.size, TYPE_CODES.length);
  });
}

test('US-008 legends are in, and nobody uncurated has a losing UFC record', () => {
  for (const slug of ['jon-jones', 'khabib-nurmagomedov', 'georges-st-pierre', 'ronda-rousey', 'amanda-nunes']) {
    const f = roster.fighters.find((x) => x.slug === slug);
    assert.ok(f, `${slug} missing`);
    assert.equal(f.tier, 'icon');
  }
  for (const f of roster.fighters) {
    if (!f.tier && !f.champion) assert.ok(f.ufcWins > f.ufcLosses, `${f.name} ${f.ufcWins}-${f.ufcLosses}`);
  }
});

test('US-001 everyone not curated or a champion is current', () => {
  const cutoff = new Date(Date.parse(roster.snapshot) - 548 * 86400000).toISOString().slice(0, 10);
  for (const f of roster.fighters) {
    if (!f.tier && !f.champion) assert.ok(f.lastFight >= cutoff, `${f.name} last fought ${f.lastFight}`);
    assert.equal(f.legend, f.lastFight < cutoff && !f.champion, `${f.name} legend flag`);
  }
  assert.ok(roster.fighters.filter((f) => f.champion).length >= 8);
  assert.equal(new Set(roster.fighters.map((f) => f.slug)).size, roster.fighters.length);
});

test('US-001 champions are always in the pool (seen: Kayla Harrison, 3 UFC fights)', () => {
  const fight = (date, result = 'win', method = 'U-DEC') => ({ ufc: true, date, result, method, round: 3 });
  const row = (id, extra) => ({
    id, name: `Fighter ${id}`, weight_class: 'Lightweight', wins: 10, losses: 2, draws: 0,
    slpm: 4, str_acc: 0.5, sapm: 3, str_def: 0.55, td_avg: 1, sub_avg: 0.3, is_champion: false,
    fights: ['2026-10-01', '2026-05-01', '2025-12-01', '2025-06-01'].map((d) => fight(d)),
    ...extra,
  });
  const rows = [1, 2, 3, 4, 5].map((i) => row(`f${i}`));
  rows.push(row('champ', {
    name: 'New Champion', weight_class: "Women's Bantamweight", is_champion: true,
    fights: ['2025-01-10', '2024-08-01', '2024-02-01'].map((d) => fight(d, 'win', 'KO/TKO')),
  }));
  const built = buildRoster(rows);
  assert.ok(built.fighters.some((f) => f.name === 'New Champion' && f.champion));
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
  assert.equal(sanitizeName(`${'x'.repeat(19)}𝐀b`), `${'x'.repeat(19)}𝐀`);
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
  // Old links kept punctuation from the fighter's name.
  assert.equal(parseShareLocation('/', "?result=sean-o'malley").slug, 'sean-o-malley');
  assert.equal(parseShareLocation('/', '?result=khalil-rountree-jr.').slug, 'khalil-rountree-jr');
  assert.equal(parseShareLocation('/r/<bad>', ''), null);
});
