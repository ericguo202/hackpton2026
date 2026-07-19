/**
 * Data layer for the strengths radar (rendered by `components/StrengthsRadar.tsx`).
 *
 * Split from the component file so React Fast Refresh stays happy
 * (`react-refresh/only-export-components` — a component file must not also export
 * plain functions), the same reason `joinSpoken.ts` is its own module.
 *
 * Shared by `History.tsx` (averaged over the last ≤5 sessions) and
 * `SavedQuestionDetail.tsx` (averaged over the last ≤5 evaluated attempts).
 */

// Radar dimensions = the canonical score dimensions (same keys/order/palette as
// the pages' line charts). The radar is single-series ink; these colors tint
// only the axis labels + vertex dots. `short` is the abbreviated angle-axis tick
// (the long "Problem Solving" would clip in the narrow 1/3 column); the full
// `label` is kept for the tooltip.
import { scoreDimensionsFor, SCORE_DIMENSIONS, type ScoreKey } from './scoreDimensions';
import {
  QUESTION_CATEGORY_SHORT_LABELS,
  REAL_QUESTION_CATEGORIES,
  questionCategoryLabel,
} from '../types/session';
import type { CategoryStat } from '../types/history';

export type RadarDimensionKey = ScoreKey;

// Chart palette for the four category spokes — the same `--color-chart-N`
// family the per-dimension radar tints its spokes with.
const CATEGORY_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
];

/** A window row: per-dimension value (0-10) or null when that dimension has no
 *  score (e.g. delivery with the camera off). Callers map their session/attempt
 *  rows down to this shape. */
export type RadarRow = Record<RadarDimensionKey, number | null>;

/** One spoke. `shortLabel` is the abbreviated tick; the full `dimension` label is
 *  shown in the tooltip; `color` is the dimension's `--color-chart-N`, used to
 *  tint the axis label and vertex dot. `turnsEvaluated` is set only on the
 *  category-comparison radar (how many turns fed the vertex's average). */
export type RadarPoint = {
  dimension: string;
  shortLabel: string;
  value: number;
  color: string;
  turnsEvaluated?: number;
};

export type RadarResult = {
  data: RadarPoint[];
  /** How many rows actually fed the averages (≤5). */
  windowCount: number;
  /** True when the Delivery spoke was dropped (no webcam in the window). */
  deliveryMissing: boolean;
};

/**
 * Average each dimension across the (already-windowed, ≤5) rows. Each dimension
 * is averaged over only its non-null values (equal row weight), mirroring the
 * backend's `_per_dimension_averages`: a webcam-off row has `delivery === null`
 * and simply doesn't contribute. A dimension with no values at all is OMITTED —
 * so when no windowed row recorded webcam, Delivery drops out entirely (5-axis
 * radar) rather than plotting a misleading 0.
 *
 * Callers slice the window themselves (the two pages source rows in opposite
 * order), so `windowCount` is just `rows.length`.
 *
 * `category` relabels the spokes for that question category (via
 * `scoreDimensionsFor`) — the History page passes the active category filter so
 * the per-dimension radar reads the right rubric. Omitted → the STAR default
 * (SavedQuestionDetail, all-STAR).
 */
export function buildRadarData(
  rows: RadarRow[],
  category?: string | null,
): RadarResult {
  const dimensions = category ? scoreDimensionsFor(category) : SCORE_DIMENSIONS;
  const data: RadarPoint[] = [];
  let deliveryMissing = false;
  for (const d of dimensions) {
    const vals = rows
      .map((r) => r[d.key])
      .filter((v): v is number => v !== null && v !== undefined);
    if (vals.length === 0) {
      if (d.key === 'delivery') deliveryMissing = true;
      continue;
    }
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    data.push({ dimension: d.label, shortLabel: d.short, value: avg, color: d.color });
  }
  return { data, windowCount: rows.length, deliveryMissing };
}

/** One category spoke on the category-comparison radar. */
export type CategoryRadarPoint = RadarPoint & { turnsEvaluated: number };

/**
 * Build the History strengths radar's category-comparison view: one vertex per
 * of the four REAL question categories (fixed order), value = that category's
 * average content score (0-10, from `/me/stats` `by_category`). Unlike the
 * per-dimension radar, EVERY category is plotted — a category with no scored
 * turns shows a value of 0 (not omitted) so the four-vertex shape is stable —
 * and each point carries `turnsEvaluated` for the tooltip.
 */
export function buildCategoryRadarData(
  byCategory: CategoryStat[] | undefined,
): CategoryRadarPoint[] {
  const byKey = new Map((byCategory ?? []).map((c) => [c.question_category, c]));
  return REAL_QUESTION_CATEGORIES.map((cat, i) => {
    const stat = byKey.get(cat);
    const raw = stat?.average_score;
    const value = raw != null && raw !== '' ? parseFloat(raw) : 0;
    return {
      dimension: questionCategoryLabel(cat),
      shortLabel: QUESTION_CATEGORY_SHORT_LABELS[cat] ?? questionCategoryLabel(cat),
      value: Number.isFinite(value) ? value : 0,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      turnsEvaluated: stat?.turns_evaluated ?? 0,
    };
  });
}
