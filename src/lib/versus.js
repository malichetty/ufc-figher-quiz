import { AXES } from './types.js';

const ROLE = {
  Striker: 'striker',
  Grappler: 'grappler',
  Pressure: 'pressure fighter',
  Counter: 'counter fighter',
  Finisher: 'finisher',
  Decision: 'points fighter',
};

export function verdict(a, b) {
  const diffs = AXES.map((x) => ({ x, d: a[x.key] - b[x.key] })).sort((p, q) => Math.abs(q.d) - Math.abs(p.d));
  const top = diffs[0];
  if (Math.abs(top.d) < 0.35) return "You and your friend fight almost the same way. That's a five-round war.";
  const you = ROLE[top.d > 0 ? top.x.plus : top.x.minus];
  const them = ROLE[top.d > 0 ? top.x.minus : top.x.plus];
  return `Biggest difference: you're the ${you}, your friend is the ${them}.`;
}
