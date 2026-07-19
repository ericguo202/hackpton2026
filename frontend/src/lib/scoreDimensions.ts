/**
 * Canonical evaluator score dimensions — the single source of truth for the six
 * scored dimensions' key, display label, abbreviated label, and chart color.
 *
 * The five content score slots on the wire are GENERIC (`dimension_1..5`); what
 * each position MEANS depends on the turn's `question_category`. The backend
 * mirror is `app/services/_score_dimensions.py` (keep the two in sync). The
 * KEYS and COLORS are fixed by position (chart-1..6); only the LABELS change per
 * question category. Position 1 is Structure for every type; `delivery` (the 6th
 * slot) is shared and identically labeled across all types.
 *
 * Previously hand-duplicated across `session-detail/OverviewPanel.tsx` tiles,
 * `History.tsx` and `SavedQuestionDetail.tsx` (each a local `DIMENSIONS` +
 * `DimensionKey`), and `radarData.ts` (RADAR_DIMENSIONS) — the "change one,
 * change both" hazard called out in CLAUDE.md. They all derive from here now, so
 * the chart series, the per-session tiles, the radar, and the line toggles can
 * never drift apart.
 *
 * Colors come from the dedicated `--color-chart-*` palette in index.css (NOT the
 * warm-earth primary ramps, which render as indistinguishable near-black on a
 * chart). `short` is the abbreviated angle-axis tick for the narrow radar column;
 * everywhere else uses `label`.
 *
 * Per-turn surfaces label from the turn's `question_category` via
 * `scoreDimensionsFor(category)`. PER-SESSION aggregate surfaces (SessionDetail +
 * Practice Results overview tiles) also label by the session's category — a
 * session is single-category, so they pass the opening turn's category.
 * SavedQuestionDetail is likewise single-category (one frozen opening) and labels
 * by the saved question's `question_category`. Truly CROSS-session surfaces
 * (History trend/radar, /me/stats) render the STAR label set via
 * `SCORE_DIMENSIONS` unless narrowed to one category by the History filter.
 *
 * The landing components (`landing/Methodology`, `landing/ScorePieChart`)
 * deliberately keep their own marketing-shaped lists (numbered, pie-sliced)
 * and are NOT consumers of this.
 */

/** Fixed wire keys for the six score slots (position order). */
export type ScoreKey =
  | 'dimension_1'
  | 'dimension_2'
  | 'dimension_3'
  | 'dimension_4'
  | 'dimension_5'
  | 'delivery';

export type ScoreDimension = {
  key: ScoreKey;
  label: string;
  short: string;
  color: string;
};

// Fixed key + color per position; label is filled in per question category below.
const SLOTS: { key: ScoreKey; color: string }[] = [
  { key: 'dimension_1', color: 'var(--color-chart-1)' },
  { key: 'dimension_2', color: 'var(--color-chart-2)' },
  { key: 'dimension_3', color: 'var(--color-chart-3)' },
  { key: 'dimension_4', color: 'var(--color-chart-4)' },
  { key: 'dimension_5', color: 'var(--color-chart-5)' },
  { key: 'delivery',    color: 'var(--color-chart-6)' },
];

// Per-question-category labels (position-aligned with SLOTS). `short` is the
// radar tick; when omitted it falls back to `label`. Mirror of the backend
// `_score_dimensions.CONTENT_DIMENSION_LABELS`.
type LabelSpec = { label: string; short?: string };

const STAR_LABELS: LabelSpec[] = [
  { label: 'Structure' },
  { label: 'Problem Solving', short: 'Prob. Solving' },
  { label: 'Impact' },
  { label: 'Initiative' },
  { label: 'Depth' },
  { label: 'Delivery' },
];

const MOTIVATION_FIT_LABELS: LabelSpec[] = [
  { label: 'Structure' },
  { label: 'Relevance' },
  { label: 'Company Insight', short: 'Company' },
  { label: 'Career Narrative', short: 'Narrative' },
  { label: 'Conviction' },
  { label: 'Delivery' },
];

const SITUATIONAL_LABELS: LabelSpec[] = [
  { label: 'Structure' },
  { label: 'Reasoning' },
  { label: 'Principles' },
  { label: 'Practicality', short: 'Practical' },
  { label: 'Evidence' },
  { label: 'Delivery' },
];

const SELF_ASSESS_LABELS: LabelSpec[] = [
  { label: 'Structure' },
  { label: 'Self-Awareness', short: 'Self-Aware' },
  { label: 'Growth' },
  { label: 'Candor' },
  { label: 'Evidence' },
  { label: 'Delivery' },
];

// Keyed by the backend QuestionCategory enum value. Types not yet generated
// fall back to the STAR set via `scoreDimensionsFor`.
const LABELS_BY_CATEGORY: Record<string, LabelSpec[]> = {
  experience_star: STAR_LABELS,
  motivation_fit: MOTIVATION_FIT_LABELS,
  situational: SITUATIONAL_LABELS,
  self_assessment_growth: SELF_ASSESS_LABELS,
};

function buildDimensions(labels: LabelSpec[]): readonly ScoreDimension[] {
  return SLOTS.map((slot, i) => ({
    key: slot.key,
    color: slot.color,
    label: labels[i].label,
    short: labels[i].short ?? labels[i].label,
  }));
}

/**
 * The six score dimensions (key/label/short/color) for a given question
 * category. Unknown / legacy / undefined categories fall back to STAR, so
 * aggregate surfaces that pass nothing render the STAR labels.
 */
export function scoreDimensionsFor(
  category?: string | null,
): readonly ScoreDimension[] {
  return buildDimensions(
    (category && LABELS_BY_CATEGORY[category]) || STAR_LABELS,
  );
}

/**
 * Default (STAR) dimensions — used by aggregate surfaces (history trend, radar,
 * stats, overview tiles) where a single label set is rendered across sessions.
 */
export const SCORE_DIMENSIONS = scoreDimensionsFor(null);
