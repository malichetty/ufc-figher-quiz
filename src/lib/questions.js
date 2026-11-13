// Each option moves the person's style axes: R striker(+)/grappler(-),
// T pressure(+)/counter(-), F finisher(+)/decision(-), W knockout(+)/submission(-).
// Every question's options sum to roughly zero on each axis, so no type is
// favoured by the question set itself (checked in test/matching.test.mjs).
export const QUESTIONS = [
  {
    id: 'bell',
    question: 'The bell rings. First thing you do?',
    options: [
      { text: 'Walk them down and start throwing', value: { R: 1, T: 1 } },
      { text: 'Shoot for a takedown', value: { R: -1, T: 0.5 } },
      { text: 'Circle, read them, wait for a mistake', value: { R: 1, T: -1 } },
      { text: 'Let them come, then tie them up', value: { R: -1, T: -0.5 } },
    ],
  },
  {
    id: 'ending',
    question: 'How does your perfect fight end?',
    options: [
      { text: 'Lights out. One punch.', value: { F: 1, W: 1, R: 0.5 } },
      { text: 'They tap', value: { F: 1, W: -1, R: -0.5 } },
      { text: '30-27 on all three cards', value: { F: -1 } },
      { text: 'Five rounds of total control', value: { F: -1, T: 0.5 } },
    ],
  },
  {
    id: 'camp',
    question: 'Your training camp is mostly:',
    options: [
      { text: 'Boxing and Muay Thai', value: { R: 1, W: 0.5 } },
      { text: 'Wrestling, wrestling, wrestling', value: { R: -1, F: -0.5 } },
      { text: 'Jiu-jitsu', value: { R: -1, F: 0.5, W: -1 } },
      { text: 'Footwork, head movement, defence', value: { R: 1, T: -0.5, F: -0.5 } },
    ],
  },
  {
    id: 'round3',
    question: "Round three. You're exhausted. You:",
    options: [
      { text: "Push harder. They're more tired than me.", value: { T: 1, F: -0.5 } },
      { text: 'Swing for the fences', value: { T: 0.5, F: 1, W: 0.5 } },
      { text: 'Stay sharp, counter and move', value: { T: -1, R: 0.5 } },
      { text: 'Hold position and steal the round', value: { T: -0.5, R: -0.5, F: -0.5 } },
    ],
  },
  {
    id: 'trash',
    question: 'They talk trash at the press conference. You:',
    options: [
      { text: 'Fire back louder', value: { T: 1, F: 0.5 } },
      { text: 'Say nothing. Hands do the talking.', value: { T: -0.5, F: 0.5 } },
      { text: 'Smile. Promise them a long night.', value: { T: 0.5, F: -1 } },
      { text: "Don't even look at them", value: { T: -1 } },
    ],
  },
  {
    id: 'highlight',
    question: 'Pick your career highlight:',
    options: [
      { text: 'Spinning head kick knockout', value: { R: 1, F: 1, W: 1 } },
      { text: 'A slick choke from your back', value: { R: -1, F: 1, W: -1 } },
      { text: 'Slam after slam, total domination', value: { R: -1, F: -0.5, T: 0.5 } },
      { text: 'A masterclass where they never touch you', value: { R: 1, F: -1, T: -0.5 } },
    ],
  },
];
