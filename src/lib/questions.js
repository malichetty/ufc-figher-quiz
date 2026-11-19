// Each option moves the person's style axes: R striker(+)/grappler(-),
// T pressure(+)/counter(-), F finisher(+)/decision(-), W knockout(+)/submission(-).
// Every question's options sum to roughly zero on each axis, so no type is
// favoured by the question set itself.
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
    id: 'deadline',
    question: "It's 4pm. The deadline is 5. You're cooked. You:",
    options: [
      { text: 'Coffee. Outwork it.', value: { T: 1, F: -0.5 } },
      { text: 'One big swing. Ship it and pray.', value: { T: 0.5, F: 1, W: 0.5 } },
      { text: 'Cut it to the one part that matters and nail that', value: { T: -1, R: 0.5 } },
      { text: 'Ask for an extension and run out the clock', value: { T: -0.5, R: -0.5, F: -0.5 } },
    ],
  },
  {
    id: 'groupchat',
    question: 'The group chat is arguing. You:',
    options: [
      { text: 'Send 14 messages in a row', value: { T: 1, F: 0.5 } },
      { text: 'Wait. Then one line that ends it.', value: { T: -0.5, F: 0.5 } },
      { text: "Keep it going all night. You're enjoying this.", value: { T: 0.5, F: -1 } },
      { text: 'Mute it', value: { T: -1 } },
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
