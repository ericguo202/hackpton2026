/**
 * Bio-dictation text merge helper, shared by SpeechToTextButton and the two bio
 * forms (Onboarding, Personalize). Kept in its own module so the component file
 * only exports a component (satisfies `react-refresh/only-export-components`).
 */

/** Shared 2000-char cap, matching the bio textarea `maxLength` in both forms. */
export const MAX_BIO_LENGTH = 2000;

/**
 * Append a finalized speech chunk to the existing bio value: inserts a single
 * separating space when needed and clamps to {@link MAX_BIO_LENGTH}.
 */
export function joinSpoken(prev: string, chunk: string): string {
  const addition = chunk.trim();
  if (!addition) return prev;
  const needsSpace = prev.length > 0 && !/\s$/.test(prev);
  const joined = `${prev}${needsSpace ? ' ' : ''}${addition}`;
  return joined.slice(0, MAX_BIO_LENGTH);
}
