// Turns raw UFC Stats API fighter rows into the quiz roster (PRD FR-1, FR-2).
// Pure: no I/O, so the build script and tests share it.
import { typeFromAxes, TYPE_CODES } from './types.js';
import { slugify } from './share.js';
import { STARS } from '../data/stars.js';

export const ROSTER_RULES = {
  activeDays: 548, // ~18 months before the newest fight in the data
  minUfcFights: 4,
  perDivision: 12,
  // Thin types (e.g. counter-striking finishers) get topped up from the active
  // list so a few fighters don't collect every answer set of that type.
  typeFloor: { men: 10, women: 5 },
  // Prominence floor for curated names, so matching leans toward them.
  starProminence: { icon: 1, star: 0.75 },
  minStarUfcFights: 3,
};

const MEN_BY_WEIGHT = [
  [125, 'Flyweight'], [135, 'Bantamweight'], [145, 'Featherweight'], [155, 'Lightweight'],
  [170, 'Welterweight'], [185, 'Middleweight'], [205, 'Light Heavyweight'], [Infinity, 'Heavyweight'],
];

// Legends often carry "Catch Weight" or no class from their last bout.
function divisionOf(row) {
  if (row.weight_class && row.weight_class !== 'Catch Weight') return row.weight_class;
  if (!(row.weight_lbs > 0)) return null;
  return MEN_BY_WEIGHT.find(([max]) => row.weight_lbs <= max)[1];
}

function percentileFn(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const lowerBound = (v, strict) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (strict ? sorted[mid] < v : sorted[mid] <= v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  // Mid-rank percentile, so ties (e.g. many 0 sub averages) share one value.
  return (v) => (lowerBound(v, true) + lowerBound(v, false)) / 2 / n;
}

const round3 = (x) => Math.round(x * 1000) / 1000;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

function ufcSummary(row) {
  const fights = (row.fights || []).filter((f) => f.ufc && f.date);
  const wins = fights.filter((f) => f.result === 'win');
  const losses = fights.filter((f) => f.result === 'loss').length;
  const ko = wins.filter((f) => /KO/.test(f.method || '')).length;
  const sub = wins.filter((f) => (f.method || '') === 'SUB').length;
  const dec = wins.filter((f) => /DEC/.test(f.method || '')).length;
  // The API has no scheduled-rounds field; going past round 3 marks a five-round fight.
  const fiveRound = fights.filter((f) => (f.round || 0) >= 4).length;
  const lastFight = fights.reduce((m, f) => (f.date > m ? f.date : m), '');
  return { fights: fights.length, wins: wins.length, losses, ko, sub, dec, fiveRound, lastFight };
}

export function buildRoster(rows, rules = ROSTER_RULES, stars = STARS) {
  const tierOf = new Map();
  for (const name of stars.star) tierOf.set(name.toLowerCase(), 'star');
  for (const name of stars.icon) tierOf.set(name.toLowerCase(), 'icon');

  const snapshot = rows.reduce(
    (m, r) => (r.fights || []).reduce((mm, f) => (f.date > mm ? f.date : mm), m),
    '',
  );
  const cutoff = new Date(Date.parse(snapshot) - rules.activeDays * 86400000)
    .toISOString()
    .slice(0, 10);

  // `active` sets the stat scale and the type shares; `eligible` adds the
  // curated stars and legends, who may not have fought in years.
  const active = [];
  const eligible = [];
  const foundStars = new Set();
  for (const row of rows) {
    if (!row.name || !(row.slpm > 0)) continue;
    const u = ufcSummary(row);
    if (!u.fights) continue;
    const tier = tierOf.get(row.name.toLowerCase()) || null;
    const division = divisionOf(row);
    if (!division) continue;
    // A current champion is always in: a new one can have only 3 UFC fights,
    // and a long title layoff can outlast the activity window.
    const current = (u.fights >= rules.minUfcFights && u.lastFight >= cutoff) || !!row.is_champion;
    // Only fighters with a real division set the stat scale and the pool.
    const isActive = current && row.weight_class === division;
    const entry = { row, u, tier, division, isActive, current };
    if (isActive) active.push(entry);
    if (isActive || (tier && u.fights >= rules.minStarUfcFights)) {
      eligible.push(entry);
      if (tier) foundStars.add(row.name.toLowerCase());
    }
  }
  const missingStars = [...stars.icon, ...stars.star].filter((n) => !foundStars.has(n.toLowerCase()));

  const finishRate = ({ u }) => (u.ko + u.sub) / Math.max(u.wins, 1);
  const pct = {
    slpm: percentileFn(active.map((a) => a.row.slpm)),
    acc: percentileFn(active.map((a) => a.row.str_acc)),
    td: percentileFn(active.map((a) => a.row.td_avg)),
    sub: percentileFn(active.map((a) => a.row.sub_avg)),
    pace: percentileFn(active.map((a) => a.row.slpm + a.row.sapm)),
    def: percentileFn(active.map((a) => a.row.str_def)),
    fin: percentileFn(active.map(finishRate)),
  };

  for (const a of eligible) {
    const r = a.row;
    const striking = 0.65 * pct.slpm(r.slpm) + 0.35 * pct.acc(r.str_acc);
    const grappling = 0.6 * pct.td(r.td_avg) + 0.4 * pct.sub(r.sub_avg);
    const finishes = a.u.ko + a.u.sub;
    a.raw = {
      R: striking - grappling,
      T: 0.6 * (2 * pct.pace(r.slpm + r.sapm) - 1) + 0.4 * (1 - 2 * pct.def(r.str_def)),
      F: 2 * pct.fin(finishRate(a)) - 1,
      W: finishes ? (a.u.ko - a.u.sub) / finishes : 0,
    };
  }

  // Centre R/T/F on the active median (so the eight types split fairly), then
  // stretch so the 90th-percentile magnitude sits at 0.8 and answers and stats
  // share one scale.
  const axes = {};
  for (const k of ['R', 'T', 'F']) {
    const m = median(active.map((a) => a.raw[k]));
    const mags = active.map((a) => Math.abs(a.raw[k] - m)).sort((x, y) => x - y);
    const p90 = mags[Math.floor(mags.length * 0.9)] || 1;
    axes[k] = (v) => Math.max(-1, Math.min(1, ((v - m) / p90) * 0.8));
  }

  for (const a of eligible) {
    a.axes = {
      R: round3(axes.R(a.raw.R)),
      T: round3(axes.T(a.raw.T)),
      F: round3(axes.F(a.raw.F)),
      W: round3(a.raw.W),
    };
    a.type = typeFromAxes(a.axes);
    const winRate = a.u.wins / Math.max(a.u.fights, 1);
    a.prominenceRaw =
      (a.row.is_champion ? 150 : 0) + Math.min(a.u.fiveRound, 6) * 15 + a.u.wins * 3 + winRate * 20;
  }

  const typeShare = Object.fromEntries(TYPE_CODES.map((c) => [c, 0]));
  for (const a of active) typeShare[a.type] += 1;
  for (const c of TYPE_CODES) typeShare[c] = round3(typeShare[c] / Math.max(active.length, 1));

  // Nobody wants to be told they fight like someone with a losing record, so
  // uncurated fighters need more UFC wins than losses.
  const winning = active.filter((a) => a.row.is_champion || a.u.wins > a.u.losses);
  const byDivision = new Map();
  for (const a of winning) {
    if (!byDivision.has(a.division)) byDivision.set(a.division, []);
    byDivision.get(a.division).push(a);
  }
  const picked = new Set();
  for (const list of byDivision.values()) {
    list.sort((x, y) => y.prominenceRaw - x.prominenceRaw || x.row.name.localeCompare(y.row.name));
    list.slice(0, rules.perDivision).forEach((a) => picked.add(a));
  }
  for (const a of eligible) if (a.row.is_champion || a.tier) picked.add(a);
  const byProminence = [...winning].sort(
    (x, y) => y.prominenceRaw - x.prominenceRaw || x.row.name.localeCompare(y.row.name),
  );
  for (const code of TYPE_CODES) {
    for (const women of [false, true]) {
      const floor = women ? rules.typeFloor.women : rules.typeFloor.men;
      const isGroup = (a) => a.type === code && a.division.startsWith("Women's") === women;
      let have = [...picked].filter(isGroup).length;
      for (const a of byProminence) {
        if (have >= floor) break;
        if (isGroup(a) && !picked.has(a)) {
          picked.add(a);
          have += 1;
        }
      }
    }
  }

  const maxProm = Math.max(1, ...active.map((a) => a.prominenceRaw));
  for (const a of picked) {
    const fromData = Math.min(1, a.prominenceRaw / maxProm);
    const floor = a.row.is_champion ? 1 : a.tier ? rules.starProminence[a.tier] : 0;
    a.prominence = Math.max(fromData, floor);
  }
  const pool = [...picked].sort(
    (x, y) => y.prominence - x.prominence || x.row.name.localeCompare(y.row.name),
  );
  const seen = new Map();
  const fighters = pool.map((a) => {
    const r = a.row;
    let slug = slugify(r.name);
    if (seen.has(slug)) slug = `${slug}-${String(r.id).slice(0, 4)}`;
    seen.set(slug, true);
    return {
      slug,
      id: r.id,
      name: r.name,
      nickname: r.nickname || null,
      division: a.division,
      women: a.division.startsWith("Women's"),
      champion: !!r.is_champion,
      tier: a.tier,
      legend: a.u.lastFight < cutoff && !r.is_champion,
      record: `${r.wins}-${r.losses}-${r.draws || 0}`,
      ufcWins: a.u.wins,
      ufcLosses: a.u.losses,
      koWins: a.u.ko,
      subWins: a.u.sub,
      decWins: a.u.dec,
      slpm: r.slpm,
      strAcc: r.str_acc,
      sapm: r.sapm,
      strDef: r.str_def,
      tdAvg: r.td_avg,
      subAvg: r.sub_avg,
      axes: a.axes,
      type: a.type,
      prominence: round3(a.prominence),
      lastFight: a.u.lastFight,
    };
  });

  return {
    snapshot,
    activeCount: active.length,
    typeShare,
    fighters,
    missingStars,
  };
}
