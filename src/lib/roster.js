// Turns raw UFC Stats API fighter rows into the quiz roster (PRD FR-1, FR-2).
// Pure: no I/O, so the build script and tests share it.
import { typeFromAxes } from './types.js';
import { slugify } from './share.js';
import { FAME_LADDER } from '../data/stars.js';

export const ROSTER_RULES = {
  activeDays: 548, // ~18 months before the newest fight in the data
  minUfcFights: 4,
  minStarUfcFights: 3,
};

const AXIS_MIX = { winMethod: 2.2, pace: 0.5, exposed: 0.3, takedowns: 1.2 };

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
  const lastFight = fights.reduce((m, f) => (f.date > m ? f.date : m), '');
  return { fights: fights.length, wins: wins.length, losses, ko, sub, dec, lastFight };
}

export function buildRoster(rows, rules = ROSTER_RULES, ladder = FAME_LADDER) {
  const levelOf = new Map();
  for (const step of ladder) for (const name of step.names) levelOf.set(name.toLowerCase(), step);
  const beltOnly = ladder[ladder.length - 1];

  const snapshot = rows.reduce(
    (m, r) => (r.fights || []).reduce((mm, f) => (f.date > mm ? f.date : mm), m),
    '',
  );
  const cutoff = new Date(Date.parse(snapshot) - rules.activeDays * 86400000)
    .toISOString()
    .slice(0, 10);

  // `active` sets the stat scale and centres the axes; `eligible` is the pool:
  // champions and the ladder's names, who may not have fought in years.
  const active = [];
  const eligible = [];
  const foundStars = new Set();
  for (const row of rows) {
    if (!row.name || !(row.slpm > 0)) continue;
    const u = ufcSummary(row);
    if (!u.fights) continue;
    const picked = levelOf.get(row.name.toLowerCase()) || null;
    const division = divisionOf(row);
    if (!division) continue;
    // A current champion is always in: a new one can have only 3 UFC fights,
    // and a long title layoff can outlast the activity window.
    const current = (u.fights >= rules.minUfcFights && u.lastFight >= cutoff) || !!row.is_champion;
    // Only fighters with a real division set the stat scale and the pool.
    const isActive = current && row.weight_class === division;
    const level = picked || (row.is_champion && isActive ? beltOnly : null);
    const entry = { row, u, level, division };
    if (isActive) active.push(entry);
    if (level && (isActive || u.fights >= rules.minStarUfcFights)) {
      eligible.push(entry);
      if (picked) foundStars.add(row.name.toLowerCase());
    }
  }
  const missingStars = ladder
    .flatMap((step) => step.names)
    .filter((n) => !foundStars.has(n.toLowerCase()));

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

  // Every active fighter gets raw axes, pool or not: they set the centre.
  for (const a of new Set([...active, ...eligible])) {
    const r = a.row;
    const striking = 0.65 * pct.slpm(r.slpm) + 0.35 * pct.acc(r.str_acc);
    const grappling = 0.6 * pct.td(r.td_avg) + 0.4 * pct.sub(r.sub_avg);
    const finishes = a.u.ko + a.u.sub;
    a.raw = {
      // How they win counts as well as what they throw: a low-volume
      // knockout puncher is still a striker.
      R: striking - grappling + AXIS_MIX.winMethod * ((a.u.ko - a.u.sub) / Math.max(a.u.wins, 1)),
      // Chaining takedowns is pressure, or smothering wrestlers read as
      // counter fighters. Only above-median takedown rates add: a striker who
      // never shoots is not a counter fighter for it.
      T:
        AXIS_MIX.pace * (2 * pct.pace(r.slpm + r.sapm) - 1) +
        AXIS_MIX.exposed * (1 - 2 * pct.def(r.str_def)) +
        AXIS_MIX.takedowns * Math.max(0, 2 * pct.td(r.td_avg) - 1),
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
  }

  const pool = [...eligible].sort(
    (x, y) => y.level.fame - x.level.fame || x.row.name.localeCompare(y.row.name),
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
      champion: !!r.is_champion,
      tier: a.level.level,
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
      prominence: a.level.fame,
      lastFight: a.u.lastFight,
    };
  });

  return {
    snapshot,
    activeCount: active.length,
    fighters,
    missingStars,
  };
}
