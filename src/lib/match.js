// Answers -> style axes -> best fighter (PRD FR-4, FR-5). Deterministic.
import { QUESTIONS } from './questions.js';
import { typeFromAxes } from './types.js';

const WEIGHTS = { R: 1, T: 0.8, F: 0.7, W: 0.4 };
const SAME_TYPE_BONUS = 0.12;
const PROMINENCE_WEIGHT = 0.1;
const TIE_WINDOW = 0.035;
// Answer sums rarely reach the theoretical max, so stretch them to use the
// same range as fighters' axes.
const ANSWER_STRETCH = 1.1;

const AXIS_MAX = (() => {
  const max = { R: 0, T: 0, F: 0, W: 0 };
  for (const q of QUESTIONS) {
    for (const k of Object.keys(max)) {
      max[k] += Math.max(...q.options.map((o) => Math.abs(o.value[k] || 0)));
    }
  }
  return max;
})();

const clamp = (x) => Math.max(-1, Math.min(1, x));

export function userAxes(answers) {
  const sum = { R: 0, T: 0, F: 0, W: 0 };
  answers.forEach((choice, i) => {
    const value = QUESTIONS[i].options[choice].value;
    for (const k of Object.keys(sum)) sum[k] += value[k] || 0;
  });
  const out = {};
  for (const k of Object.keys(sum)) out[k] = clamp((sum[k] / AXIS_MAX[k]) * ANSWER_STRETCH);
  return out;
}

function distance(u, f) {
  const wW = WEIGHTS.W * Math.max(0, (u.F + 1) / 2);
  const d2 =
    WEIGHTS.R * (u.R - f.R) ** 2 +
    WEIGHTS.T * (u.T - f.T) ** 2 +
    WEIGHTS.F * (u.F - f.F) ** 2 +
    wW * (u.W - f.W) ** 2;
  return Math.sqrt(d2);
}

const D_MAX = 2 * Math.sqrt(WEIGHTS.R + WEIGHTS.T + WEIGHTS.F + WEIGHTS.W);

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function inDivision(fighter, division) {
  if (division === 'men') return !fighter.women;
  if (division === 'women') return fighter.women;
  return true;
}

export function scoreFighter(u, uType, fighter) {
  const similarity = 1 - distance(u, fighter.axes) / D_MAX;
  const score =
    similarity +
    (fighter.type === uType ? SAME_TYPE_BONUS : 0) +
    PROMINENCE_WEIGHT * fighter.prominence;
  return { fighter, score, matchPct: Math.round(similarity * 100) };
}

export function rank(roster, answers, division = 'all') {
  const u = userAxes(answers);
  const uType = typeFromAxes(u);
  const ranked = roster.fighters
    .filter((f) => inDivision(f, division))
    .map((f) => scoreFighter(u, uType, f))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.fighter.prominence - a.fighter.prominence ||
        a.fighter.name.localeCompare(b.fighter.name),
    );
  return { axes: u, answerType: uType, ranked };
}

// The displayed type is the matched fighter's type, so the result page, the
// share preview and the fighter always agree. The same-type bonus makes it
// equal the answer type whenever such a fighter exists in the chosen divisions.
export function findMatch(roster, answers, division = 'all') {
  const { axes, ranked } = rank(roster, answers, division);
  if (!ranked.length) return null;
  // Fighters at the edge of the style space would otherwise collect every
  // extreme answer set. Among near-ties, pick by a hash of the answers: still
  // deterministic, and it spreads results across equally good matches.
  const near = ranked.filter((r) => r.score >= ranked[0].score - TIE_WINDOW);
  const best = near[hash(`${answers.join('')}${division}`) % near.length];
  const rest = ranked.filter((r) => r !== best);
  return {
    axes,
    type: best.fighter.type,
    fighter: best.fighter,
    matchPct: best.matchPct,
    runnersUp: rest.slice(0, 2).map((r) => ({ fighter: r.fighter, matchPct: r.matchPct })),
  };
}

const pctText = (x) => `${Math.round(x * 100)}%`;
const n2 = (x) => (Math.round(x * 100) / 100).toString();
const surname = (name) => name.replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '').split(' ').slice(-1)[0];

// The fighter stat that backs up one answer, keyed by the axis the answer
// pushed hardest (and which way). W splits finishers into knockout vs submission.
function evidenceFor(value, fighter) {
  const who = surname(fighter.name);
  const [k, v] = ['R', 'T', 'F']
    .map((key) => [key, value[key] || 0])
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  if (!v || v * fighter.axes[k] < 0.1) return null; // the fighter must clearly lean the same way
  if (k === 'R' && v > 0) return { kind: 'R+', text: `${who} lands ${n2(fighter.slpm)} significant strikes a minute at ${pctText(fighter.strAcc)} accuracy.` };
  if (k === 'R') {
    // A submission-minded answer only cites submissions when the fighter
    // really hunts them; otherwise the takedown numbers carry the grappling.
    return (value.W || 0) < 0 && fighter.subAvg >= 0.5
      ? { kind: 'R-sub', text: `${who} averages ${n2(fighter.subAvg)} submission attempts per 15 minutes.` }
      : { kind: 'R-td', text: `${who} averages ${n2(fighter.tdAvg)} takedowns per 15 minutes.` };
  }
  if (k === 'T' && v > 0) return { kind: 'T+', text: `${who} keeps a pace of ${n2(fighter.slpm + fighter.sapm)} strikes exchanged a minute.` };
  if (k === 'T') return { kind: 'T-', text: `${who} defends ${pctText(fighter.strDef)} of strikes thrown at them.` };
  if (v > 0) {
    // A knockout or submission answer must match how the fighter finishes.
    if (!value.W || value.W * (fighter.axes.W || 0) < 0) return null;
    if ((value.W || 0) > 0 && !fighter.koWins) return null;
    if ((value.W || 0) < 0 && !fighter.subWins) return null;
    // Every finishing answer names a method (W), so the reason cites that one.
    return (value.W || 0) > 0
      ? { kind: 'F-ko', text: `${fighter.koWins} of ${who}'s ${fighter.ufcWins} UFC wins came by knockout.` }
      : { kind: 'F-sub', text: `${fighter.subWins} of ${who}'s ${fighter.ufcWins} UFC wins came by submission.` };
  }
  return { kind: 'F-', text: `${fighter.decWins} of ${who}'s ${fighter.ufcWins} UFC wins went to the judges.` };
}

// Up to three reasons, each pairing one of the person's own answers with the
// fighter stat that matches it, strongest agreement first. `who` is "You" or
// the sharer's name.
export function whyYouMatch(fighter, answers, who = 'You') {
  const picks = [];
  answers.forEach((choice, i) => {
    const option = QUESTIONS[i].options[choice];
    const ev = evidenceFor(option.value, fighter);
    if (!ev) return;
    const agreement = ['R', 'T', 'F'].reduce((sum, k) => sum + (option.value[k] || 0) * fighter.axes[k], 0);
    picks.push({ ...ev, agreement, answer: option.text });
  });
  const seen = new Set();
  return picks
    .sort((a, b) => b.agreement - a.agreement)
    .filter((p) => !seen.has(p.kind) && seen.add(p.kind))
    .slice(0, 3)
    .map((p) => ({ answer: `${who} picked “${p.answer.replace(/\.$/, '')}.”`, evidence: p.text }));
}
