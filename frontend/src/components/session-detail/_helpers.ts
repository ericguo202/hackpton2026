/**
 * Shared utilities for the SessionDetail folder-tab redesign.
 *
 * Centralized so the orchestrator, OverviewPanel, and TurnPanel pull from a
 * single source — avoids re-defining num() / turnAverage / the feedback-moment
 * helpers in two places. Per-dimension keys/labels/colors now come straight from
 * `lib/scoreDimensions.ts` (`scoreDimensionsFor(category)`), so the tiles label
 * by the session's question category rather than a fixed STAR list.
 */

import type {
  ImprovementMoment,
  PositiveMoment,
  TurnDetail,
} from '../../types/history';

/** Wire-format Decimal-as-string → number, with null passthrough. */
export function num(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Average of a turn's populated score dimensions (delivery is excluded when
 * null on camera-declined turns; failed-evaluation turns return 0 here but
 * callers should check `scores.dimension_1 === null` first to render the
 * "Evaluation failed" notice instead.)
 */
export function turnAverage(t: TurnDetail): number {
  const vals = Object.values(t.scores).filter(
    (v): v is number => typeof v === 'number',
  );
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Filler-rate bar caps its proportional fill at this percent so high rates
 * (which are already flagged "bad" red) stay legible instead of pinning the
 * bar at 100%. A 5% rate fills a quarter of the bar; 20%+ fills it.
 */
export const FILLER_RATE_BAR_MAX = 20;

/**
 * Traffic-light color token for a filler rate (percent of words). Lower is
 * better: ≤5 green, ≤10 yellow, ≤15 orange, >15 red. Returns a CSS var so
 * dark mode re-resolves for free.
 */
export function fillerRateColor(rate: number): string {
  if (rate <= 5) return 'var(--color-rate-good)';
  if (rate <= 10) return 'var(--color-rate-ok)';
  if (rate <= 15) return 'var(--color-rate-warn)';
  return 'var(--color-rate-bad)';
}

/**
 * Stable-sort feedback moments by where each `transcript_snippet` first appears
 * in the transcript, so reading a feedback list top-to-bottom follows the answer
 * top-to-bottom (the LLM emits them in arbitrary order). Snippets that don't
 * appear verbatim sort to the end (preserving their relative order) — the same
 * graceful no-op the highlighter takes on non-matching snippets. The trimmed
 * `indexOf` mirrors `transcriptHighlight.ts` / backend `_drop_unanchored_moments`.
 */
function byTranscriptOrder<T extends { transcript_snippet: string }>(
  moments: T[],
  transcript: string | null | undefined,
): T[] {
  if (!transcript || moments.length < 2) return moments;
  return moments
    .map((m, i) => {
      const at = transcript.indexOf(m.transcript_snippet.trim());
      return { m, i, key: at < 0 ? Number.POSITIVE_INFINITY : at };
    })
    .sort((a, b) => a.key - b.key || a.i - b.i) // a.i tiebreak keeps it stable
    .map((x) => x.m);
}

/**
 * The canonical improvement-moments list for a turn, newest schema first with
 * the legacy `coaching_moments` fallback, then sorted by transcript order. Both
 * the transcript highlighter and the Improvement Moments card derive their array
 * (and therefore each moment's index) from here, so the transcript→moment link
 * can never drift out of sync.
 */
export function improvementMomentsOf(turn: TurnDetail): ImprovementMoment[] {
  return byTranscriptOrder(
    turn.feedback_detail?.improvement_moments ??
      turn.feedback_detail?.coaching_moments ??
      [],
    turn.transcript_text,
  );
}

/**
 * The "What worked" positive-moments list for a turn, sorted by transcript
 * order via the same `byTranscriptOrder` helper as `improvementMomentsOf`.
 */
export function positiveMomentsOf(turn: TurnDetail): PositiveMoment[] {
  return byTranscriptOrder(
    turn.feedback_detail?.positive_moments ?? [],
    turn.transcript_text,
  );
}

/**
 * Convert backend snake_case issue types (off_track, missing_result, …)
 * into title-cased English. Generic title-case — works for any value the
 * backend returns, including legacy / unknown types.
 */
export function formatIssueType(raw: string): string {
  return raw
    .split('_')
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
