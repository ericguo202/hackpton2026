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
  scores: Scores;
  feedback: string;
  filler_word_count: number;
  filler_word_breakdown: Record<string, number>;
  next_question: string | null;
  next_question_audio_url: string | null;
  is_final: boolean;
};
