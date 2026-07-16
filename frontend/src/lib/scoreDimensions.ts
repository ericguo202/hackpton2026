/**
 * Canonical evaluator score dimensions — the single source of truth for the six
 * scored dimensions' key, display label, abbreviated label, and chart color.
 *
 * Previously hand-duplicated across `session-detail/_helpers.ts`
 * (SCORE_KEYS / SCORE_COLOR_MAP), `History.tsx` and `SavedQuestionDetail.tsx`
 * (each a local `DIMENSIONS` + `DimensionKey`), and `radarData.ts`
 * (RADAR_DIMENSIONS) — the "change one, change both" hazard called out in
 * CLAUDE.md. They all derive from here now, so the chart series, the per-session
 * tiles, the radar, and the line toggles can never drift apart.
 *
 * Order is display order. Colors come from the dedicated `--color-chart-*`
 * palette in index.css (NOT the warm-earth primary ramps, which render as
 * indistinguishable near-black on a chart). `short` is the abbreviated
 * angle-axis tick for the narrow radar column; everywhere else uses `label`.
 *
 * The landing components (`landing/Methodology`, `landing/ScorePieChart`)
 * deliberately keep their own marketing-shaped lists (numbered, pie-sliced)
 * and are NOT consumers of this.
 */

export const SCORE_DIMENSIONS = [
  { key: 'structure',       label: 'Structure',       short: 'Structure',     color: 'var(--color-chart-1)' },
  { key: 'problem_solving', label: 'Problem Solving', short: 'Prob. Solving', color: 'var(--color-chart-2)' },
  { key: 'impact',          label: 'Impact',          short: 'Impact',        color: 'var(--color-chart-3)' },
  { key: 'initiative',      label: 'Initiative',      short: 'Initiative',    color: 'var(--color-chart-4)' },
  { key: 'depth',           label: 'Depth',           short: 'Depth',         color: 'var(--color-chart-5)' },
  { key: 'delivery',        label: 'Delivery',        short: 'Delivery',      color: 'var(--color-chart-6)' },
] as const;

export type ScoreKey = (typeof SCORE_DIMENSIONS)[number]['key'];
