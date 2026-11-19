// A type code is three letters: S/G (striker or grappler), P/C (pressure or
// counter), F/D (finisher or decision). See tasks/prd-relaunch.md FR-2, FR-3.
// The live counter stores these eight codes, so they never change.
export const TYPES = {
  SPF: {
    name: 'The Knockout Artist',
    tagline: 'Walks forward, throws heat, ends it early.',
  },
  SPD: {
    name: 'The Volume Machine',
    tagline: 'Out-works everyone, every round.',
  },
  SCF: {
    name: 'The Sniper',
    tagline: 'Patient, precise, one clean shot.',
  },
  SCD: {
    name: 'The Technician',
    tagline: 'Wins every minute without taking damage.',
  },
  GPF: {
    name: 'The Mauler',
    tagline: 'Takes you down and beats you up.',
  },
  GPD: {
    name: 'The Grinder',
    tagline: 'Relentless wrestling, unbreakable cardio.',
  },
  GCF: {
    name: 'The Submission Artist',
    tagline: 'Every scramble is a trap.',
  },
  GCD: {
    name: 'The Chess Master',
    tagline: 'Control, position, no mistakes.',
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
