/**
 * Ask Tutor wire types — mirror `backend/app/schemas/tutor.py` and the SSE
 * events emitted by `backend/app/services/tutor.py`. No codegen; keep in sync
 * by hand.
 *
 * Two surfaces share one service and one credit budget:
 *  - `turn`    the floating chat on a SessionDetail turn (question-specific)
 *  - `general` the /tutor page coach (account-wide, stronger model, web search)
 */

/** Which tutor surface a chat is running on. Selects the endpoint, the request
 *  shape, the message cap and the credit cost. */
export type TutorMode = 'turn' | 'general';

export interface TutorHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface TutorMessageRequest {
  message: string;
  history: TutorHistoryItem[];
  context_snippet?: string | null;
}

/** The general coach takes no `context_snippet` — there's no transcript to
 *  point at — and allows a longer message. */
export interface GeneralTutorMessageRequest {
  message: string;
  history: TutorHistoryItem[];
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
// The `done` event optionally carries the caller's remaining daily chat credits
// (free tier only; absent for Pro / when the charge fails open).
export interface TutorDoneEvent {
  remaining?: number;
}

/**
 * Per-user daily Ask Tutor budget, in CREDITS (free tier). The two surfaces cost
 * very different amounts to run, so they draw on one shared budget at different
 * rates rather than sharing a flat message count: a question-specific chat is 1
 * credit, the general coach is 2.
 *
 * Mirrors `DAILY_CHAT_CREDITS_FREE` / `TURN_CHAT_CREDIT_COST` /
 * `GENERAL_CHAT_CREDIT_COST` in backend/app/services/daily_limit.py.
 */
export const MAX_CHAT_CREDITS_PER_DAY = 20;
export const TURN_CHAT_CREDIT_COST = 1;
export const GENERAL_CHAT_CREDIT_COST = 2;

/** What one message on this surface costs against the daily budget. */
export function chatCreditCost(mode: TutorMode): number {
  return mode === 'general' ? GENERAL_CHAT_CREDIT_COST : TURN_CHAT_CREDIT_COST;
}

// Hard caps on a typed message, mirroring the backend schemas' `max_length`.
// The turn chat's attached "Ask about this" snippet is a separate field and is
// NOT counted against its cap.
export const MAX_TURN_MESSAGE_CHARS = 300;
export const MAX_GENERAL_MESSAGE_CHARS = 1000;

export function maxMessageChars(mode: TutorMode): number {
  return mode === 'general' ? MAX_GENERAL_MESSAGE_CHARS : MAX_TURN_MESSAGE_CHARS;
}
