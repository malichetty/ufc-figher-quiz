// A type code is three letters: S/G (striker or grappler), P/C (pressure or
// counter), F/D (finisher or decision). See tasks/prd-relaunch.md FR-2, FR-3.
export const TYPES = {
  SPF: {
    name: 'The Knockout Artist',
    tagline: 'Walks forward, throws heat, ends it early.',
    description:
      'You want the exchange and you want it now. You bring the fight to them, and you would rather finish it than hear the scorecards.',
    about:
      'Walks forward and brings the exchange right now, and would rather finish it than hear the scorecards.',
  },
  SPD: {
    name: 'The Volume Machine',
    tagline: 'Out-works everyone, every round.',
    description:
      'You drown people in output. You never stop throwing, you never stop moving forward, and by round three they have nothing left.',
    about:
      'Drowns people in output. Never stops throwing, never stops moving forward, and by round three they have nothing left.',
  },
  SCF: {
    name: 'The Sniper',
    tagline: 'Patient, precise, one clean shot.',
    description:
      'You let them make the mistake. You read the rhythm, wait for the opening, and when it comes you only need one.',
    about:
      'Lets them make the mistake. Reads the rhythm, waits for the opening, and only needs one.',
  },
  SCD: {
    name: 'The Technician',
    tagline: 'Wins every minute without taking damage.',
    description:
      'Footwork, timing, distance. You win the fight before they work out what is happening, and you walk out looking like you never fought.',
    about:
      'Footwork, timing, distance. Wins the fight before the other side works out what is happening.',
  },
  GPF: {
    name: 'The Mauler',
    tagline: 'Takes you down and beats you up.',
    description:
      'You close the distance, put them on the mat and make it ugly. Ground and pound until the referee steps in.',
    about:
      'Closes the distance, puts opponents on the mat and makes it ugly. Ground and pound until the referee steps in.',
  },
  GPD: {
    name: 'The Grinder',
    tagline: 'Relentless wrestling, unbreakable cardio.',
    description:
      'You chain takedown after takedown until they stop getting up. Nobody wants five rounds with you.',
    about:
      'Chains takedown after takedown until they stop getting up. Nobody wants five rounds with that.',
  },
  GCF: {
    name: 'The Submission Artist',
    tagline: 'Every scramble is a trap.',
    description:
      'You stay calm where others panic. On the ground every limb is an opportunity, and the fight ends with a tap.',
    about:
      'Stays calm where others panic. On the ground every limb is an opportunity, and the fight ends with a tap.',
  },
  GCD: {
    name: 'The Chess Master',
    tagline: 'Control, position, no mistakes.',
    description:
      'You take away everything they want to do. Smart, disciplined and almost impossible to beat on the scorecards.',
    about:
      'Takes away everything the opponent wants to do. Smart, disciplined and almost impossible to beat on the scorecards.',
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
