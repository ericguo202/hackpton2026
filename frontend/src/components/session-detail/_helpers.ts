/**
 * Shared utilities for the SessionDetail folder-tab redesign.
 *
 * Centralized so the orchestrator, OverviewPanel, and TurnPanel pull from
 * a single source — keeps the per-dimension color mapping consistent with
 * History.tsx (same chart-1..6 assignments) and avoids re-defining
 * num() / turnAverage in two places.
 */

import type { TurnDetail } from '../../types/history';

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
