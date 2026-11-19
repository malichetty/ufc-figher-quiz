// A type code is three letters: S/G (striker or grappler), P/C (pressure or
// counter), F/D (finisher or decision). See tasks/prd-relaunch.md FR-2, FR-3.
// The live counter stores these eight codes, so they never change.
export const TYPES = {
  SPF: {
    name: 'The Knockout Artist',
    tagline: 'You end arguments in one sentence.',
  },
  SPD: {
    name: 'The Volume Machine',
    tagline: 'Never one reply when nine will do.',
  },
  SCF: {
    name: 'The Sniper',
    tagline: 'Quiet all night, then one line that ends it.',
  },
  SCD: {
    name: 'The Technician',
    tagline: 'Never been hit, never been wrong, happy to explain why.',
  },
  GPF: {
    name: 'The Mauler',
    tagline: "You don't knock. You come through the wall.",
  },
  GPD: {
    name: 'The Grinder',
    tagline: 'You win by being annoying for longer.',
  },
  GCF: {
    name: 'The Submission Artist',
    tagline: 'You let people talk until they trap themselves.',
  },
  GCD: {
    name: 'The Chess Master',
    tagline: 'You planned how this ends before it started.',
  },
};

export const TYPE_CODES = Object.keys(TYPES);

export const AXES = [
  { key: 'R', plus: 'Striker', minus: 'Grappler' },
  { key: 'T', plus: 'Pressure', minus: 'Counter' },
  { key: 'F', plus: 'Finisher', minus: 'Decision' },
];

// A grappler who finishes is named by how they finish (W: knockout + or
// submission −), not by pace: ground-and-pound is The Mauler, chokes are The
// Submission Artist. With no lean either way, pace decides as for everyone else.
export function typeFromAxes({ R, T, F, W }) {
  const striker = R >= 0;
  const finisher = F >= 0;
  const pressure = !striker && finisher && W !== 0 ? W > 0 : T >= 0;
  return (striker ? 'S' : 'G') + (pressure ? 'P' : 'C') + (finisher ? 'F' : 'D');
}
