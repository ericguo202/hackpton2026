/**
 * Wire-format types for the history routes (`GET /sessions`, `GET /sessions/{id}`,
 * `GET /me/stats`).
 *
 * Mirror `backend/app/schemas/session.py` exactly. Numeric fields land as
 * JSON strings on the wire (Pydantic serializes Decimal as a string for
 * precision) — coerce with `parseFloat()` at the chart boundary, not here,
 * so the raw payload stays inspectable in DevTools.
 */

/** Per-dimension averages — every value is null on rows with no data. */
export type DimensionAverages = {
  structure:       string | null;
  problem_solving: string | null;
  impact:          string | null;
  initiative:      string | null;
  depth:           string | null;
  delivery:        string | null;
};

export type SessionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'abandoned';

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

export type FeedbackDetail = {
  main_takeaway: string;
  positive_moments?: PositiveMoment[];
  improvement_moments?: ImprovementMoment[];
  // Legacy saved turns from the first structured-feedback iteration.
  coaching_moments?: ImprovementMoment[];
  quick_wins: string[];
};

export type SessionListItem = {
  id: string;
  company: string;
  job_title: string;
  status: SessionStatus;
  /** 0-100 scale, NOT 0-10. Null until the session finishes. */
  overall_score: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  turns_evaluated: number;
  total_filler_word_count: number | null;
  averages: DimensionAverages;
};

/** One scored turn inside `SessionDetail`. Mirrors backend `TurnOut`. */
export type TurnDetail = {
  id: string;
  turn_number: number;
  question_text: string;
  transcript_text: string | null;
  is_followup: boolean;
  scores: {
    // Null when the turn's evaluation never completed. Renders as an
    // "Evaluation Failed" placeholder, NOT as 0/10.
    structure: number | null;
    problem_solving: number | null;
    impact: number | null;
    initiative: number | null;
    depth: number | null;
    delivery: number | null;
  };
  feedback: string | null;
  feedback_detail: FeedbackDetail | null;
  filler_word_count: number;
  filler_word_breakdown: Record<string, number>;
  evaluated_at: string | null;
  created_at: string;
};

export type SessionDetail = {
  id: string;
  company: string;
  job_title: string;
  status: SessionStatus;
  overall_score: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  summary: {
    description: string;
    headlines: string[];
    values: string[];
    // Optional on the wire: old sessions persisted before the brief was
    // extended with these fields will not include them in the JSON the
    // backend re-serves. Access via `?? []` at the call site.
    role_signals?: string[];
    sample_question_themes?: string[];
  } | null;
  turns: TurnDetail[];
  averages: DimensionAverages;
  total_filler_word_count: number | null;
  turns_evaluated: number;
};

export type MeStats = {
  total_sessions: number;
  completed_sessions: number;
  total_turns_evaluated: number;
  total_filler_word_count: number;
  averages: DimensionAverages;
  /** 0-100 scale, averaged across completed sessions. */
  average_overall_score: string | null;
};
