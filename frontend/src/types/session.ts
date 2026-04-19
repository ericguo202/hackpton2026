export type Scores = {
  directness: number;
  star: number;
  specificity: number;
  impact: number;
  conciseness: number;
  // Null when the candidate declined camera access — the card hides
  // the row in that case.
  delivery: number | null;
};

export type TurnResult = {
  transcript: string;
  // Null while the evaluator is still running in the background (turn 1
  // of the 2-turn flow). Populated synchronously on the final turn so
  // the frontend can finalize without an extra round-trip to /sessions.
  scores: Scores | null;
  feedback: string | null;
  filler_word_count: number;
  filler_word_breakdown: Record<string, number>;
  next_question: string | null;
  next_question_audio_url: string | null;
  is_final: boolean;
  // True when scores are still being computed in the background. The
  // UI uses this to skip the score bars on turn 1 and to know it must
  // refetch the full session at finalize to get turn 1's real scores.
  evaluation_pending: boolean;
};
