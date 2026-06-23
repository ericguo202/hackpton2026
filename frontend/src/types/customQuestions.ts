/**
 * Wire-format types for the custom-questions routes
 * (`/api/v1/custom-questions`). Mirror `backend/app/schemas/custom_question.py`
 * exactly — there is no codegen.
 *
 * A custom question is a candidate-authored interview question (text only),
 * pickable at session setup to replace the generated opening question.
 */

/** Per-question hard cap — mirrors `MAX_QUESTION_CHARS` in the backend schema. */
export const MAX_QUESTION_CHARS = 300;

/** Hard cap on stored custom questions per user — mirrors `CUSTOM_QUESTION_CAP`. */
export const CUSTOM_QUESTION_CAP = 10;

/** A persisted custom question row. */
export type CustomQuestion = {
  id: string;
  question_text: string;
  created_at: string;
};

/** A submitted line that didn't make it in, with a user-facing reason. */
export type RejectedQuestion = {
  text: string;
  reason: string;
};

/** Response from POST /custom-questions — a per-question report. */
export type CustomQuestionCreateResult = {
  created: CustomQuestion[];
  rejected: RejectedQuestion[];
  remaining_slots: number;
};
