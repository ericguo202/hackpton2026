// UI-only picker sentinel for "Recommended Mix" mode. It is NOT a real
// `QuestionCategory` — the backend never stamps it on a turn. When the picker
// holds this value the create-session request sends `calibrated_mix: true`
// instead of a `question_category`, and each story-block opening draws a
// calibrated category server-side.
export const RECOMMENDED_MIX = 'recommended_mix';

// Display labels for the question-category axis (mirrors the backend
// `QuestionCategory` enum). All four types are built and selectable.
// `questionCategoryLabel` falls back to Experience (STAR) for unknown/legacy
// values. `recommended_mix` is the picker sentinel (never a turn category).
// recommended_mix is the default
export const QUESTION_CATEGORY_LABELS: Record<string, string> = {
  [RECOMMENDED_MIX]: 'Recommended Mix',
  experience_star: 'Experience (STAR)',
  self_assessment_growth: 'Self-Assessment & Growth',
  motivation_fit: 'Motivation & Fit',
  situational: 'Situational',
};

export function questionCategoryLabel(category: string | null | undefined): string {
  return (
    (category ? QUESTION_CATEGORY_LABELS[category] : undefined) ??
    QUESTION_CATEGORY_LABELS.experience_star
  );
}

// Abbreviated category labels for tight surfaces (the History category-radar
// angle-axis ticks, where the full "Self-Assessment & Growth" would clip).
export const QUESTION_CATEGORY_SHORT_LABELS: Record<string, string> = {
  experience_star: 'Experience',
  motivation_fit: 'Motivation',
  situational: 'Situational',
  self_assessment_growth: 'Self-Assess',
};

// The four REAL question categories (the `RECOMMENDED_MIX` sentinel excluded) —
// the fixed axis for the History category filter + category-comparison radar.
// Order is the display order.
export const REAL_QUESTION_CATEGORIES: readonly string[] = [
  'experience_star',
  'motivation_fit',
  'situational',
  'self_assessment_growth',
];

// The question types offered in the Setup picker — only those with a real
// prompt stack today (mirrors the backend `BUILT_QUESTION_CATEGORIES` allowlist
// in schemas/session.py). Add a slug here when its type ships. Order is the
// display order in the picker.
export const SELECTABLE_QUESTION_CATEGORIES: readonly {
  value: string;
  label: string;
}[] = [
  // Calibrated multi-category mode — recommended default experience. Sends
  // `calibrated_mix: true` instead of a `question_category` (see Home.tsx).
  { value: RECOMMENDED_MIX, label: QUESTION_CATEGORY_LABELS[RECOMMENDED_MIX] },
  { value: 'experience_star', label: QUESTION_CATEGORY_LABELS.experience_star },
  { value: 'motivation_fit', label: QUESTION_CATEGORY_LABELS.motivation_fit },
  { value: 'situational', label: QUESTION_CATEGORY_LABELS.situational },
  {
    value: 'self_assessment_growth',
    label: QUESTION_CATEGORY_LABELS.self_assessment_growth,
  },
];

export type Scores = {
  // Five GENERIC content slots; the label per position is resolved from the
  // turn's question_category (see `lib/scoreDimensions.ts`). All nullable: the
  // backend returns null for any turn whose evaluation never completed. UIs
  // render an "Evaluation Failed" placeholder for those rows instead of 0s.
  dimension_1: number | null;
  dimension_2: number | null;
  dimension_3: number | null;
  dimension_4: number | null;
  dimension_5: number | null;
  // Null when the candidate declined camera access — the card hides
  // the row in that case.
  delivery: number | null;
};

export type PositiveMoment = {
  transcript_snippet: string;
  why_this_helped: string;
  keep_doing: string;
};

export type ImprovementMoment = {
  transcript_snippet: string;
  issue_type: string;
  why_this_weakened: string;
  how_to_strengthen: string;
};

export type DeliveryFeedback = {
  summary: string;
  eye_contact?: string | null;
  alignment?: string | null;
  posture?: string | null;
  expression?: string | null;
};

export type FeedbackDetail = {
  main_takeaway: string;
  positive_moments?: PositiveMoment[];
  improvement_moments?: ImprovementMoment[];
  // Legacy saved turns from the first structured-feedback iteration.
  coaching_moments?: ImprovementMoment[];
  quick_wins: string[];
  delivery_feedback?: DeliveryFeedback | null;
};

export type TurnResult = {
  transcript: string;
  // Null while the evaluator is still running in the background. Practice
  // polls /sessions after the final turn to replace pending local results.
  scores: Scores | null;
  feedback: string | null;
  feedback_detail: FeedbackDetail | null;
  filler_word_count: number;
  filler_word_breakdown: Record<string, number>;
  /** Words per minute for the just-submitted turn. Null when unknown / too short. */
  speaking_pace_wpm: number | null;
  next_question: string | null;
  next_question_audio_url: string | null;
  // True when the next question is a follow-up (drills into the current story)
  // rather than a fresh opening. Drives the "Follow-up question" label during
  // recording. False on the final turn and for mid-session opening pivots.
  next_question_is_followup: boolean;
  // The next question's FORM (Experience/STAR today). Drives the category badge
  // during recording. One of the QuestionCategory enum values.
  next_question_category: string;
  // True when this submission was only a clarification request. The backend
  // re-asks the same turn and does not score or advance it.
  clarification_retry: boolean;
  is_final: boolean;
  // True when scores are still being computed in the background.
  evaluation_pending: boolean;
};
