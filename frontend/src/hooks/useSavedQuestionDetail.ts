/**
 * `useSavedQuestionDetail` — one saved question + all its practice attempts.
 *
 * Mirrors `useSessionDetail`: refetch on id change, expose `errorStatus` so the
 * page can redirect on 4xx (not found / not owned) but stay put on 5xx.
 *
 * A freshly-started re-practice attempt is linked here while it's still
 * finalizing in the background (null scores, `status !== "completed"`).
 * `usePolledResource` silently polls every ~2s while any attempt is non-terminal
 * so the attempt list self-heals from "Scoring in progress" to real scores
 * without a manual refresh — same approach as `useSessionDetail`.
 */

import { usePolledResource } from './usePolledResource';
import type { SavedQuestionDetail } from '../types/savedQuestions';

export function useSavedQuestionDetail(savedQuestionId: string | null) {
  const { data: saved, ...rest } = usePolledResource<SavedQuestionDetail>(
    savedQuestionId ? `/api/v1/saved-questions/${savedQuestionId}` : null,
    (q) =>
      (q.attempts ?? []).some(
        (a) => a.status === 'in_progress' || a.status === 'pending',
      ),
  );
  return { saved, ...rest };
}
