/**
 * Frontend mirror of `backend/app/services/filler_words.py`.
 *
 * The backend regex is the authoritative source of truth for the
 * `filler_word_count` / `filler_word_breakdown` columns (see CLAUDE.md
 * L99). To highlight transcripts in the UI we re-run an *identical*
 * pattern client-side rather than asking the backend to ship match
 * offsets — the regex is short, deterministic, and shipping it as
 * structured data would just bloat every `/turns` response.
 *
 * Keep the term list and the regex shape in lock-step with the Python
 * implementation. If you add a filler term in one file, add it in the
 * other or the displayed highlight count will silently disagree with
 * the persisted count.
 */

// Multi-word phrases come first so the alternation matches the longest
// candidate at a given position ("you know" before "you" / "know"; "i
// mean" before "i" / "mean"). Order matters — JavaScript's RegExp, like
// Python's re, picks the first matching alternative at each position.
export const FILLER_TERMS = [
  'you know',
  'i mean',
  'kind of',
  'sort of',
  'um',
  'uh',
  'er',
  'like',
  'basically',
  'literally',
  'actually',
  'right',
] as const;

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// `\b` (word boundary) plus the `i` flag matches the Python regex
// behaviour: case-insensitive whole-word/whole-phrase matches, so
// "umbrella" never hits "um" and "alright" never hits "right".
const FILLER_RE = new RegExp(
  '\\b(' + FILLER_TERMS.map(escapeRegExp).join('|') + ')\\b',
  'gi',
);

export type TranscriptToken =
  | { kind: 'text'; text: string }
  | { kind: 'filler'; text: string; canonical: string };

/**
 * Tokenize a transcript into an array of plain-text and filler tokens.
 *
 * Preserves the original casing (`text`) so the rendered transcript
 * still reads naturally; the lowercased `canonical` is exposed for
 * grouping / counting use cases. Order is the natural left-to-right
 * order of the input string.
 *
 * Returns an empty array for empty / null input so callers can render
 * unconditionally.
 */
export function tokenizeTranscript(
  transcript: string | null | undefined,
): TranscriptToken[] {
  if (!transcript) return [];

  const tokens: TranscriptToken[] = [];
  let cursor = 0;

  // Reset lastIndex defensively — `RegExp` instances are stateful when
  // the `g` flag is set, and a previous failed match could otherwise
  // skip the start of the string on the next call.
  FILLER_RE.lastIndex = 0;

  for (const match of transcript.matchAll(FILLER_RE)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      tokens.push({ kind: 'text', text: transcript.slice(cursor, start) });
    }
    const matched = match[0];
    tokens.push({
      kind: 'filler',
      text: matched,
      canonical: matched.toLowerCase(),
    });
    cursor = start + matched.length;
  }

  if (cursor < transcript.length) {
    tokens.push({ kind: 'text', text: transcript.slice(cursor) });
  }

  return tokens;
}

/**
 * Convenience: total filler count for a transcript. Mirrors the first
 * element of the Python `count_filler_words()` tuple. Useful as a
 * sanity-check against the persisted count when debugging drift.
 */
export function countFillerWords(transcript: string | null | undefined): number {
  if (!transcript) return 0;
  FILLER_RE.lastIndex = 0;
  let count = 0;
  for (const _ of transcript.matchAll(FILLER_RE)) count += 1;
  return count;
}

export type FillerBreakdownEntry = { word: string; count: number };

/**
 * Compute { word: count } sorted descending by frequency.
 *
 * Shape is tuned for a recharts vertical `<BarChart>` — each entry maps
 * to one bar with `word` on the category axis and `count` on the value
 * axis. Returns an empty array for transcripts with zero filler hits so
 * the caller can render an empty-state message instead of a blank chart.
 */
export function fillerBreakdown(
  transcript: string | null | undefined,
): FillerBreakdownEntry[] {
  if (!transcript) return [];
  const counts = new Map<string, number>();
  for (const tok of tokenizeTranscript(transcript)) {
    if (tok.kind !== 'filler') continue;
    counts.set(tok.canonical, (counts.get(tok.canonical) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}
