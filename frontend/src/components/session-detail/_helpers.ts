/**
 * Shared utilities for the SessionDetail folder-tab redesign.
 *
 * Centralized so the orchestrator, OverviewPanel, and TurnPanel pull from
 * a single source — keeps the per-dimension color mapping consistent with
 * History.tsx (same chart-1..6 assignments) and avoids re-defining
 * num() / turnAverage in two places.
 */

import type { ImprovementMoment, TurnDetail } from '../../types/history';

/** Score dimension keys in display order, paired with their UI labels. */
export const SCORE_KEYS = [
  ['structure',       'Structure'],
  ['problem_solving', 'Problem Solving'],
  ['impact',          'Impact'],
  ['initiative',      'Initiative'],
  ['depth',           'Depth'],
  ['delivery',        'Delivery'],
] as const;

export type ScoreKey = (typeof SCORE_KEYS)[number][0];

/**
 * Per-dimension chart colors — must match History.tsx DIMENSIONS so the
 * trend chart and the per-session tiles share one visual language.
 */
export const SCORE_COLOR_MAP: Record<ScoreKey, string> = {
  structure:       'var(--color-chart-1)',
  problem_solving: 'var(--color-chart-2)',
  impact:          'var(--color-chart-3)',
  initiative:      'var(--color-chart-4)',
  depth:           'var(--color-chart-5)',
  delivery:        'var(--color-chart-6)',
};

/** Wire-format Decimal-as-string → number, with null passthrough. */
export function num(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Average of a turn's populated score dimensions (delivery is excluded when
 * null on camera-declined turns; failed-evaluation turns return 0 here but
 * callers should check `scores.structure === null` first to render the
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
 * The canonical improvement-moments list for a turn, newest schema first with
 * the legacy `coaching_moments` fallback. Both the transcript highlighter and
 * the Improvement Moments card derive their array (and therefore each moment's
 * index) from here, so the transcript→moment link can never drift out of sync.
 */
export function improvementMomentsOf(turn: TurnDetail): ImprovementMoment[] {
  return (
    turn.feedback_detail?.improvement_moments ??
    turn.feedback_detail?.coaching_moments ??
    []
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
