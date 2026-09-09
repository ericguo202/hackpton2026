/**
 * One-tap starters for the general coach, mapped to the four jobs it exists for
 * that a single turn's chat cannot do: company homework, question-type craft,
 * reading your own progress, and building a story from your background.
 *
 * Tapping one FILLS the composer rather than sending, matching the turn chat's
 * deliberate choice — non-native-English testers asked to edit before sending.
 *
 * Its own module (not an export of the chat component) because
 * `react-refresh/only-export-components` requires component files to export only
 * components.
 */

export const GENERAL_STARTERS = [
  'How does Amazon test candidates on its Leadership Principles?',
  "How do I get better at 'tell me about yourself' questions?",
  'Looking at my practice history, what should I work on next?',
  'Help me build a stronger story from my background',
];
