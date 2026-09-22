// The board's vocabulary, in reading order (left-to-right, top-to-bottom).
// Each id must match a color block defined in CommunicationBoard.css
// (--<id> and --<id>-ink custom properties).
export const BOARD_BUTTONS = [
  { id: 'eat', word: 'Eat', emoji: '🍽️', ariaLabel: "Eat. I'm hungry, I want food." },
  { id: 'drink', word: 'Drink', emoji: '💧', ariaLabel: 'Drink. I’m thirsty.' },
  { id: 'more', word: 'More', emoji: '➕', ariaLabel: 'More. I want more.' },
  { id: 'done', word: 'All done', emoji: '✋', ariaLabel: "All done. I'm finished, stop." },
  { id: 'play', word: 'Play', emoji: '🧸', ariaLabel: 'Play. I want to play.' },
  { id: 'help', word: 'Help', emoji: '🤝', ariaLabel: 'Help. I need help.' },
  { id: 'diaper', word: 'Diaper', emoji: '🚽', ariaLabel: 'Diaper. I need a change.' },
  { id: 'hug', word: 'Hug', emoji: '❤️', ariaLabel: 'Hug. I want a hug.' },
];
