/**
 * Ask Tutor wire types — mirror `backend/app/schemas/tutor.py` and the SSE
 * events emitted by `backend/app/services/tutor.py`. No codegen; keep in sync
 * by hand.
 */

export interface TutorHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface TutorMessageRequest {
  message: string;
  history: TutorHistoryItem[];
  context_snippet?: string | null;
}

// SSE event payloads (the `data` of each `event:`):
export interface TutorToolEvent {
  id: string;
  label: string;
}
export interface TutorTokenEvent {
  text: string;
}
export interface TutorErrorEvent {
  message: string;
}
// The `done` event optionally carries the caller's remaining daily chat quota
// (free tier only; absent for Pro / when the increment fails open).
export interface TutorDoneEvent {
  remaining?: number;
}

// Per-user daily cap on successful Ask Tutor chat completions (free tier).
// Mirrors `DAILY_CHAT_LIMIT_FREE` in backend/app/services/daily_limit.py.
export const MAX_TUTOR_CHATS_PER_DAY = 10;
