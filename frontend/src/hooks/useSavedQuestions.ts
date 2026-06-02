/**
 * `useSavedQuestions` — the caller's saved opening questions (History section).
 *
 * Mirrors the `useSessions` pattern: fetch-on-ready, expose `refetch`, all
 * network through `useApi().apiFetch`. Also bundles the mutators the History
 * row needs (`remove`, `rePractice`) so the page doesn't hand-roll fetches.
 */

import { useCallback, useEffect, useState } from 'react';

import { useApi } from './useApi';
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
  const { apiFetch, isReady } = useApi();
  const [saved, setSaved] = useState<SavedQuestionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSaved = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SavedQuestionListItem[]>(
        '/api/v1/saved-questions',
      );
      setSaved(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isReady) void fetchSaved();
  }, [isReady, fetchSaved]);

  const save = useCallback(
    async (sessionId: string) => {
      const created = await apiFetch<SavedQuestionOut>(
        '/api/v1/saved-questions',
        { method: 'POST', body: JSON.stringify({ session_id: sessionId }) },
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
    async (id: string, voiceId?: string | null) =>
      apiFetch<RePracticeResult>(`/api/v1/saved-questions/${id}/practice`, {
        method: 'POST',
        body: JSON.stringify({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(voiceId ? { voice_id: voiceId } : {}),
        }),
      }),
    [apiFetch],
  );

  return { saved, isLoading, error, refetch: fetchSaved, save, remove, rePractice, isReady };
}
