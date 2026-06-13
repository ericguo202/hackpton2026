/**
 * Segment a transcript into plain spans and "improvement moment" spans so the
 * feedback UI can highlight the exact sentences the evaluator flagged as weak.
 *
 * The evaluator prompt requires every `transcript_snippet` to be an exact copy
 * of transcript text, and the backend enforces it (`_drop_unanchored_moments`
 * keeps a moment only when `snippet.strip() in transcript`). We mirror that
 * `.strip()` semantics here by matching the *trimmed* snippet — and if a snippet
 * still doesn't appear verbatim, we simply don't highlight it (graceful no-op on
 * legacy / edge data).
 *
 * Each segment carries pre-tokenized filler runs (via `tokenizeTranscript`) so
 * filler-word highlighting keeps working *inside* improvement spans too — the
 * two highlight layers nest rather than fight.
 */

import { tokenizeTranscript, type TranscriptToken } from './fillerWords';

export type TranscriptSegment =
  | { kind: 'plain'; tokens: TranscriptToken[] }
  | { kind: 'improvement'; momentIndex: number; tokens: TranscriptToken[] };

export type ImprovementSnippet = { snippet: string; momentIndex: number };

/**
 * Split `transcript` so each flagged snippet becomes its own `improvement`
 * segment (carrying the originating `momentIndex`), with the gaps between them
 * as `plain` segments. Returns `[]` for empty input.
 */
export function segmentTranscriptByImprovements(
  transcript: string | null | undefined,
  snippets: ImprovementSnippet[],
): TranscriptSegment[] {
  if (!transcript) return [];

  // Resolve each snippet to its first verbatim (trimmed) occurrence. Snippets
  // that don't appear are dropped — the "don't highlight non-matching" rule.
  type Range = { start: number; end: number; momentIndex: number };
  const ranges: Range[] = [];
  for (const { snippet, momentIndex } of snippets) {
    const needle = snippet.trim();
    if (!needle) continue;
    const at = transcript.indexOf(needle);
    if (at < 0) continue;
    ranges.push({ start: at, end: at + needle.length, momentIndex });
  }

  // Sort by start, then greedily drop overlaps (a later range that begins
  // before the previous accepted range ends is skipped) so spans never nest
  // into each other and break rendering. Earliest occurrence wins.
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const accepted: Range[] = [];
  let lastEnd = -1;
  for (const r of ranges) {
    if (r.start < lastEnd) continue;
    accepted.push(r);
    lastEnd = r.end;
  }

  const segments: TranscriptSegment[] = [];
  let cursor = 0;
  for (const r of accepted) {
    if (r.start > cursor) {
      segments.push({
        kind: 'plain',
        tokens: tokenizeTranscript(transcript.slice(cursor, r.start)),
      });
    }
    segments.push({
      kind: 'improvement',
      momentIndex: r.momentIndex,
      tokens: tokenizeTranscript(transcript.slice(r.start, r.end)),
    });
    cursor = r.end;
  }
  if (cursor < transcript.length) {
    segments.push({
      kind: 'plain',
      tokens: tokenizeTranscript(transcript.slice(cursor)),
    });
  }

  return segments;
}
