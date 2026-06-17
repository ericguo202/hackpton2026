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
