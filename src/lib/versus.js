const AXES = [
  { key: 'R', plus: 'striker', minus: 'grappler' },
  { key: 'T', plus: 'pressure fighter', minus: 'counter fighter' },
  { key: 'F', plus: 'finisher', minus: 'points fighter' },
  { key: 'W', plus: 'knockout hunter', minus: 'submission hunter' },
];

export function verdict(you, friend) {
  const top = AXES.map((x) => ({ x, d: you[x.key] - friend[x.key] })).sort((p, q) => Math.abs(q.d) - Math.abs(p.d))[0];
  if (Math.abs(top.d) < 0.35) return "You and your friend fight almost the same way. That's a five-round war.";
  return `Biggest difference: you're more of a ${top.d > 0 ? top.x.plus : top.x.minus} than your friend.`;
}
