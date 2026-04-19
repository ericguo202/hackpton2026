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
  directness:  string | null;
  star:        string | null;
  specificity: string | null;
  impact:      string | null;
  conciseness: string | null;
  delivery:    string | null;
};

export type SessionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'abandoned';

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
    directness: number;
    star: number;
    specificity: number;
    impact: number;
    conciseness: number;
    delivery: number | null;
  };
  feedback: string | null;
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
