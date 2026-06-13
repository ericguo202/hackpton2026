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

// Canonical radar dimensions — same keys/order/palette as the pages' line-chart
// DIMENSIONS (sourced from --color-chart-*), kept here so both pages render an
// identical radar. The radar is single-series ink; these colors tint only the
// axis labels + vertex dots. `short` is the abbreviated angle-axis tick (the long
// "Problem Solving" would clip in the narrow 1/3 column); the full `label` is kept
// for the tooltip.
const RADAR_DIMENSIONS = [
  { key: 'structure',       label: 'Structure',       short: 'Structure',     color: 'var(--color-chart-1)' },
  { key: 'problem_solving', label: 'Problem Solving', short: 'Prob. Solving', color: 'var(--color-chart-2)' },
  { key: 'impact',          label: 'Impact',          short: 'Impact',        color: 'var(--color-chart-3)' },
  { key: 'initiative',      label: 'Initiative',      short: 'Initiative',    color: 'var(--color-chart-4)' },
  { key: 'depth',           label: 'Depth',           short: 'Depth',         color: 'var(--color-chart-5)' },
  { key: 'delivery',        label: 'Delivery',        short: 'Delivery',      color: 'var(--color-chart-6)' },
] as const;

export type RadarDimensionKey = (typeof RADAR_DIMENSIONS)[number]['key'];

/** A window row: per-dimension value (0-10) or null when that dimension has no
 *  score (e.g. delivery with the camera off). Callers map their session/attempt
 *  rows down to this shape. */
export type RadarRow = Record<RadarDimensionKey, number | null>;

/** One spoke. `shortLabel` is the abbreviated tick; the full `dimension` label is
 *  shown in the tooltip; `color` is the dimension's `--color-chart-N`, used to
 *  tint the axis label and vertex dot. */
export type RadarPoint = { dimension: string; shortLabel: string; value: number; color: string };

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
 */
export function buildRadarData(rows: RadarRow[]): RadarResult {
  const data: RadarPoint[] = [];
  let deliveryMissing = false;
  for (const d of RADAR_DIMENSIONS) {
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
