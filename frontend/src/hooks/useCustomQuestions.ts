/**
 * `useCustomQuestions` — the caller's candidate-authored custom questions.
 *
 * Mirrors `useSavedQuestions`: fetch-on-ready via `useFetch`, expose `refetch`,
 * and bundle the mutators the Personalize manager + setup picker need (`create`,
 * `remove`). All network through `useApi().apiFetch`.
 */

import { useCallback } from 'react';

import { useApi } from './useApi';
import { useFetch } from './useFetch';
import type {
  CustomQuestion,
  CustomQuestionCreateResult,
} from '../types/customQuestions';

export function useCustomQuestions() {
  const { apiFetch } = useApi();
  const { data: questions, refetch, ...rest } =
    useFetch<CustomQuestion[]>('/api/v1/custom-questions');

  // Submit one or more questions (bulk = multiple lines). Returns the
  // per-question report so the caller can surface rejected lines + reasons.
  const create = useCallback(
    async (texts: string[]): Promise<CustomQuestionCreateResult> => {
      const result = await apiFetch<CustomQuestionCreateResult>(
        '/api/v1/custom-questions',
        { method: 'POST', body: JSON.stringify({ questions: texts }) },
      );
      await refetch();
      return result;
    },
    [apiFetch, refetch],
  );

  const remove = useCallback(
    async (id: string) => {
      await apiFetch(`/api/v1/custom-questions/${id}`, { method: 'DELETE' });
      await refetch();
    },
    [apiFetch, refetch],
  );

  return { questions, refetch, create, remove, ...rest };
}
