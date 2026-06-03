/**
 * `useSavedQuestionDetail` — one saved question + all its practice attempts.
 *
 * Mirrors `useSessionDetail`: refetch on id change, expose `errorStatus` so the
 * page can redirect on 4xx (not found / not owned) but stay put on 5xx.
 */

import { useCallback, useEffect, useState } from 'react';

import { useApi } from './useApi';
import { ApiError } from '../lib/api';
import type { SavedQuestionDetail } from '../types/savedQuestions';

export function useSavedQuestionDetail(savedQuestionId: string | null) {
  const { apiFetch, isReady } = useApi();
  const [saved, setSaved] = useState<SavedQuestionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSaved = useCallback(async () => {
    if (!savedQuestionId) return;
    setIsLoading(true);
    setError(null);
    setErrorStatus(null);
    try {
      const data = await apiFetch<SavedQuestionDetail>(
        `/api/v1/saved-questions/${savedQuestionId}`,
      );
      setSaved(data);
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError) setErrorStatus(err.status);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, savedQuestionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isReady && savedQuestionId) void fetchSaved();
    if (!savedQuestionId) setSaved(null);
  }, [isReady, savedQuestionId, fetchSaved]);

  return { saved, isLoading, error, errorStatus, refetch: fetchSaved };
}
