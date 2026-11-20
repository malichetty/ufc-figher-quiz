// PRD acceptance criteria US-001, US-003, US-008, US-010, US-011 (tasks/prd-relaunch.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findMatch } from '../src/lib/match.js';
import { QUESTIONS } from '../src/lib/questions.js';
import { TYPE_CODES } from '../src/lib/types.js';
import { parseShareLocation, sharePath } from '../src/lib/share.js';
import { buildRoster } from '../src/lib/roster.js';
import { verdict } from '../src/lib/versus.js';
import { QUOTES } from '../src/data/quotes.js';
import { FAME_LADDER } from '../src/data/stars.js';

const roster = JSON.parse(readFileSync(new URL('../src/data/roster.json', import.meta.url), 'utf8'));

const allAnswers = [];
for (let i = 0; i < 4 ** QUESTIONS.length; i++) {
  allAnswers.push(QUESTIONS.map((_, k) => (i >> (2 * k)) & 3));
}

test('US-001 result spread and fame', () => {
  const counts = new Map();
  const types = new Set();
  let famous = 0;
  for (const a of allAnswers) {
    const r = findMatch(roster, a);
    counts.set(r.fighter.slug, (counts.get(r.fighter.slug) || 0) + 1);
    types.add(r.type);
    if (r.fighter.champion || r.fighter.tier) famous += 1;
  }
  const [topSlug, topCount] = [...counts].sort((x, y) => y[1] - x[1])[0];
  assert.ok(topCount / allAnswers.length <= 0.05, `${topSlug} gets ${topCount} of ${allAnswers.length}`);
  assert.ok(counts.size >= 100, `only ${counts.size} fighters reachable`);
  assert.ok(famous / allAnswers.length >= 0.9, `only ${famous} famous results`);
  assert.equal(types.size, TYPE_CODES.length);
});

test('US-008 legends are in, and nobody uncurated has a losing UFC record', () => {
  for (const slug of ['jon-jones', 'khabib-nurmagomedov', 'georges-st-pierre', 'ronda-rousey', 'amanda-nunes']) {
    const f = roster.fighters.find((x) => x.slug === slug);
    assert.ok(f, `${slug} missing`);
    assert.equal(f.tier, 'goat');
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

const byName = new Map(roster.fighters.map((f) => [f.name, f]));
const known = (f) => !!(f.tier || f.champion);

test('type labels agree with how the fighter wins (seen: Ngannou, Liddell, Bisping as Submission Artists)', () => {
  const wrong = [];
  for (const f of roster.fighters) {
    if (f.type === 'GCF' && (f.koWins > f.subWins || f.subWins === 0)) wrong.push(`${f.name} GCF ${f.koWins} KO ${f.subWins} SUB`);
    if ((f.type === 'SPF' || f.type === 'SCF') && f.subWins > f.koWins) wrong.push(`${f.name} ${f.type} ${f.koWins} KO ${f.subWins} SUB`);
    if (f.type[0] === 'G' && f.tdAvg < 1 && f.subAvg < 0.5) wrong.push(`${f.name} ${f.type} td ${f.tdAvg} sub ${f.subAvg}`);
  }
  assert.deepEqual(wrong, []);
});

test('famous fighters sit on the side of the map they are known for', () => {
  const striker = ['Francis Ngannou', 'Chuck Liddell', 'Michael Bisping', 'Derrick Lewis', 'Conor McGregor',
    'Alex Pereira', 'Justin Gaethje', 'Vitor Belfort', 'Wanderlei Silva', 'Cody Garbrandt', 'Max Holloway',
    "Sean O'Malley", 'Israel Adesanya'];
  const grappler = ['Khabib Nurmagomedov', 'Islam Makhachev', 'Georges St-Pierre', 'Khamzat Chimaev',
    'Merab Dvalishvili', 'Demetrious Johnson', 'Matt Hughes', 'Randy Couture', 'Ronda Rousey', 'Demian Maia',
    'Charles Oliveira', 'Kayla Harrison'];
  const pressure = ['Khabib Nurmagomedov', 'Khamzat Chimaev', 'Merab Dvalishvili'];
  const wrong = [];
  const get = (n) => byName.get(n) || assert.fail(`${n} missing from the pool`);
  for (const n of striker) if (get(n).type[0] !== 'S') wrong.push(`${n} ${get(n).type} should be a striker`);
  for (const n of grappler) if (get(n).type[0] !== 'G') wrong.push(`${n} ${get(n).type} should be a grappler`);
  for (const n of pressure) if (!(get(n).axes.T > 0)) wrong.push(`${n} T ${get(n).axes.T} should be pressure`);
  assert.deepEqual(wrong, []);
});

test('every hand-picked name above star level and every champion is reachable, the biggest names often (seen: GSP never, Khabib 0.4%)', () => {
  const counts = new Map();
  for (const a of allAnswers) {
    const slug = findMatch(roster, a).fighter.slug;
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  const short = [];
  for (const f of roster.fighters) {
    const n = counts.get(f.slug) || 0;
    if ((f.tier !== 'star' || f.champion) && n < 8) short.push(`${f.name} ${n}`);
  }
  for (const name of ['Conor McGregor', 'Khabib Nurmagomedov', 'Alex Pereira', 'Ilia Topuria', 'Jon Jones']) {
    const n = counts.get(byName.get(name)?.slug) || 0;
    if (n < 20) short.push(`${name} ${n} (wants 20)`);
  }
  assert.deepEqual(short, []);
});

test('a pure wrestler gets a known grappler, a pure knockout striker a known striker', () => {
  const wrestler = findMatch(roster, [1, 3, 1, 0, 2, 2]).fighter;
  assert.ok(known(wrestler) && wrestler.type[0] === 'G', `${wrestler.name} ${wrestler.type}`);
  const striker = findMatch(roster, [0, 0, 0, 1, 0, 0]).fighter;
  assert.ok(known(striker) && striker.type[0] === 'S', `${striker.name} ${striker.type}`);
});

test('the You vs Friend sentence is true for the pair (seen: two grapplers told "you\'re the striker"; W ignored)', () => {
  const pair = (you, friend) => verdict(findMatch(roster, you).axes, findMatch(roster, [...friend].map(Number)).axes);
  const hughes = pair([1, 1, 1, 0, 0, 0], '101001');
  const chandler = pair([0, 0, 0, 0, 0, 1], '010000');
  const cormier = pair([3, 0, 1, 3, 1, 0], '212221');
  assert.equal(hughes, "Biggest difference: you're more of a striker than your friend.");
  assert.equal(chandler, "Biggest difference: you're more of a grappler than your friend.");
  assert.equal(cormier, "Biggest difference: you're more of a knockout hunter than your friend.");
});

test('US-003 share URLs round-trip, and old links still parse', () => {
  const path = sharePath({ slug: 'justin-gaethje', answers: [0, 1, 2, 3, 0, 1] });
  assert.equal(path, '/r/justin-gaethje?a=012301');
  const [pathname, search] = path.split('?');
  assert.deepEqual(parseShareLocation(pathname, `?${search}`), {
    slug: 'justin-gaethje',
    answers: [0, 1, 2, 3, 0, 1],
    legacy: false,
  });
  assert.equal(parseShareLocation('/r/justin-gaethje', '?a=9999').answers, null);
  // n= and d= on older links are ignored.
  assert.deepEqual(parseShareLocation('/r/justin-gaethje', '?n=Aris&a=012301&d=men'), {
    slug: 'justin-gaethje',
    answers: [0, 1, 2, 3, 0, 1],
    legacy: false,
  });
  assert.deepEqual(parseShareLocation('/', '?result=jon-jones&from=Aris'), {
    slug: 'jon-jones',
    answers: null,
    legacy: true,
  });
  // Old links kept punctuation from the fighter's name.
  assert.equal(parseShareLocation('/', "?result=sean-o'malley").slug, 'sean-o-malley');
  assert.equal(parseShareLocation('/', '?result=khalil-rountree-jr.').slug, 'khalil-rountree-jr');
  assert.equal(parseShareLocation('/r/<bad>', ''), null);
});

test('US-010 fighter quotes are short, attributed, bleeped and belong to pool fighters', () => {
  const slugs = new Set(roster.fighters.map((f) => f.slug));
  const swears = ['fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'piss'];
  for (const [slug, { line, by }] of Object.entries(QUOTES)) {
    assert.ok(slugs.has(slug), `${slug} is not in the roster`);
    assert.ok(typeof line === 'string' && line.trim(), `${slug}: empty line`);
    assert.ok(line.split(/\s+/).length <= 12, `${slug}: more than 12 words`);
    assert.ok(line.length <= 80, `${slug}: more than 80 characters`);
    assert.ok(typeof by === 'string' && by.trim(), `${slug}: no attribution`);
    for (const w of swears) assert.ok(!line.toLowerCase().includes(w), `${slug}: undashed swear word`);
  }
});

test('US-011 the fame ladder: higher levels come up more, and every goat and favourite often', () => {
  const counts = new Map();
  for (const a of allAnswers) {
    const slug = findMatch(roster, a).fighter.slug;
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  const share = (f) => (counts.get(f.slug) || 0) / allAnswers.length;
  const avg = {};
  for (const { level } of FAME_LADDER) {
    const fs = roster.fighters.filter((f) => f.tier === level);
    avg[level] = fs.reduce((sum, f) => sum + share(f), 0) / fs.length;
  }
  assert.ok(avg.goat >= 0.02, `goat average ${avg.goat}`);
  assert.ok(avg.favourite >= 0.012, `favourite average ${avg.favourite}`);
  assert.ok(avg.goat > avg.favourite && avg.favourite > avg.great && avg.great > avg.star, JSON.stringify(avg));
  assert.ok(avg.favourite >= 2 * avg.star, JSON.stringify(avg));
  const short = [];
  for (const f of roster.fighters) {
    const n = counts.get(f.slug) || 0;
    if (f.tier === 'goat' && n < 50) short.push(`${f.name} ${n} (wants 50)`);
    if (f.tier === 'favourite' && n < 29) short.push(`${f.name} ${n} (wants 29)`);
  }
  assert.deepEqual(short, []);
});

test('US-011 the pool is champions and hand-picked names only (seen: Belal Muhammad in, Carlos Prates and Josh Hokit out)', () => {
  const levelOf = new Map(FAME_LADDER.flatMap(({ level, names }) => names.map((n) => [n, level])));
  for (const f of roster.fighters) {
    assert.ok(f.champion || levelOf.has(f.name), `${f.name} is neither a champion nor hand-picked`);
    if (levelOf.has(f.name)) assert.equal(f.tier, levelOf.get(f.name), `${f.name} level`);
    else assert.equal(f.tier, FAME_LADDER[FAME_LADDER.length - 1].level, `${f.name}: a belt alone is not top fame`);
  }
  assert.ok(!byName.has('Belal Muhammad'), 'Belal Muhammad is in the pool');
  for (const name of ['Carlos Prates', 'Josh Hokit']) assert.ok(byName.has(name), `${name} missing from the pool`);
  for (const { level, names } of FAME_LADDER.slice(0, -1)) {
    for (const name of names) assert.ok(byName.has(name), `${name} (${level}) missing from the pool`);
  }
});
