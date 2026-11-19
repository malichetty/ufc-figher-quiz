// A type code is three letters: S/G (striker or grappler), P/C (pressure or
// counter), F/D (finisher or decision). See tasks/prd-relaunch.md FR-2, FR-3.
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

export function typeFromAxes({ R, T, F }) {
  return (R >= 0 ? 'S' : 'G') + (T >= 0 ? 'P' : 'C') + (F >= 0 ? 'F' : 'D');
}
