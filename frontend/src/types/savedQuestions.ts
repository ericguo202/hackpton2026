/**
 * Wire-format types for the saved-questions routes
 * (`/api/v1/saved-questions`). Mirror `backend/app/schemas/saved_question.py`
 * exactly — there is no codegen.
 *
 * Numeric averages / scores land as JSON strings on the wire (Pydantic
 * serializes Decimal as a string); coerce with `parseFloat` at the chart
 * boundary, the same convention as `types/history.ts`.
 */

import type { SessionStatus } from './history';

/**
 * Hard cap on stored saved questions per user — mirrors `SAVED_QUESTION_CAP` in
 * backend/app/api/v1/endpoints/saved_questions.py. Tier-independent (it's a
 * storage cap, not a metered one), same convention as `CUSTOM_QUESTION_CAP`.
 */
export const SAVED_QUESTION_CAP = 5;

/** One row in the History "Saved questions" section. */
export type SavedQuestionListItem = {
  id: string;
  question_text: string;
  company: string;
  /** Frozen at save time — NOT the user's live target_role. */
  job_title: string;
  created_at: string;
  attempt_count: number;
  last_practiced_at: string | null;
  /** 0-100 scale, averaged over linked sessions (null-score ones excluded). */
  avg_overall_score: string | null;
  /** Frozen question FORM of the saved opening (a QuestionCategory value).
   *  Drives the History category filter. Defaults to "experience_star". */
  question_category: string;
};

/** One practice attempt (a linked session) on the detail page. */
export type SavedQuestionAttempt = {
  session_id: string;
  created_at: string;
  /** Session lifecycle state. Non-`completed` (e.g. a still-finalizing
   *  re-practice) means scores aren't in yet — show "Scoring in progress",
   *  NOT "Evaluation failed". */
  status: SessionStatus;
  /** 0-100 scale. Null when the session's evaluation never completed. */
  overall_score: string | null;
  /** Opening-turn per-dimension scores — the same-question comparison line.
   *  Generic slots; the detail page labels them via the saved question's
   *  `question_category` (STAR / Motivation & Fit / Situational / Self-Assess). */
  turn1_scores: {
    dimension_1: number | null;
    dimension_2: number | null;
    dimension_3: number | null;
    dimension_4: number | null;
    dimension_5: number | null;
    delivery: number | null;
  } | null;
  /** True when turn 1's eval failed; shown with a marker, dropped from trend. */
  evaluation_failed: boolean;
  /** Opening-turn speaking pace. Transcript-derived, so present even when
   *  `evaluation_failed`. Null on legacy attempts / answers too short to rate. */
  speaking_pace_wpm: number | null;
};

export type SavedQuestionDetail = {
  id: string;
  question_text: string;
  company: string;
  job_title: string;
  category: string | null;
  created_at: string;
  /** Frozen question FORM (a QuestionCategory value) — drives the detail page's
   *  chart/radar dimension labels. Defaults to "experience_star". */
  question_category: string;
  summary: {
    description: string;
    headlines: string[];
    values: string[];
    role_signals?: string[];
    sample_question_themes?: string[];
  } | null;
  attempts: SavedQuestionAttempt[];
};

/** Response from POST /saved-questions (the created row). */
export type SavedQuestionOut = {
  id: string;
  question_text: string;
  company: string;
  job_title: string;
  created_at: string;
};
