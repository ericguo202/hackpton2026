export type Scores = {
  // All five base scores are nullable: the backend returns null for any
  // turn whose evaluation never completed. UIs render an "Evaluation
  // Failed" placeholder for those rows instead of 0s.
  structure: number | null;
  problem_solving: number | null;
  impact: number | null;
  initiative: number | null;
  depth: number | null;
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
  next_question: string | null;
  next_question_audio_url: string | null;
  // True when the next question is a follow-up (drills into the current story)
  // rather than a fresh opening. Drives the "Follow-up question" label during
  // recording. False on the final turn and for mid-session opening pivots.
  next_question_is_followup: boolean;
  // True when this submission was only a clarification request. The backend
  // re-asks the same turn and does not score or advance it.
  clarification_retry: boolean;
  is_final: boolean;
  // True when scores are still being computed in the background.
  evaluation_pending: boolean;
};
