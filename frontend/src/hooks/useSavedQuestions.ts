/**
 * `useSavedQuestions` — the caller's saved opening questions (History section).
 *
 * Mirrors the `useSessions` pattern: fetch-on-ready, expose `refetch`, all
 * network through `useApi().apiFetch`. Also bundles the mutators the History
 * row needs (`remove`, `rePractice`) so the page doesn't hand-roll fetches.
 */

import { useCallback } from 'react';

import { useApi } from './useApi';
import { useFetch } from './useFetch';
import type {
  SavedQuestionListItem,
  SavedQuestionOut,
} from '../types/savedQuestions';

/** Shape returned by POST /saved-questions/{id}/practice — same as POST /sessions. */
export type RePracticeResult = {
  session_id: string;
  summary: { description: string; headlines: string[]; values: string[] };
  first_question: string;
  first_question_audio_url: string;
};

export function useSavedQuestions() {
  const { apiFetch } = useApi();
  const { data: saved, refetch: fetchSaved, ...rest } =
    useFetch<SavedQuestionListItem[]>('/api/v1/saved-questions');

  const save = useCallback(
    async (sessionId: string, turnId?: string) => {
      const created = await apiFetch<SavedQuestionOut>(
        '/api/v1/saved-questions',
        {
          method: 'POST',
          body: JSON.stringify({
            session_id: sessionId,
            // Target a specific opening turn (mid-session openings are
            // savable too); omitted → the backend saves turn 1.
            ...(turnId ? { turn_id: turnId } : {}),
          }),
        },
      );
      await fetchSaved();
      return created;
    },
    [apiFetch, fetchSaved],
  );

  const remove = useCallback(
    async (id: string) => {
      await apiFetch(`/api/v1/saved-questions/${id}`, { method: 'DELETE' });
      await fetchSaved();
    },
    [apiFetch, fetchSaved],
  );

  const rePractice = useCallback(
    async (id: string, voiceId?: string | null, speechSpeed?: number) =>
      apiFetch<RePracticeResult>(`/api/v1/saved-questions/${id}/practice`, {
        method: 'POST',
        body: JSON.stringify({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(voiceId ? { voice_id: voiceId } : {}),
          ...(speechSpeed !== undefined ? { speech_speed: speechSpeed } : {}),
        }),
      }),
    [apiFetch],
  );

  return { saved, refetch: fetchSaved, save, remove, rePractice, ...rest };
}
