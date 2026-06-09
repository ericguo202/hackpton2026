/**
 * `useSavedQuestionDetail` — one saved question + all its practice attempts.
 *
 * Mirrors `useSessionDetail`: refetch on id change, expose `errorStatus` so the
 * page can redirect on 4xx (not found / not owned) but stay put on 5xx.
 *
 * A freshly-started re-practice attempt is linked here while it's still
 * finalizing in the background (null scores, `status !== "completed"`). This
 * hook silently polls every ~2s while any attempt is non-terminal so the
 * attempt list self-heals from "Scoring in progress" to real scores without a
 * manual refresh — same approach as `useSessionDetail`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useApi } from './useApi';
import { ApiError } from '../lib/api';
import type { SavedQuestionDetail } from '../types/savedQuestions';

const POLL_INTERVAL_MS = 2000;
// Stop polling after ~3 min so a genuinely stuck attempt doesn't poll forever
// on a tab left open. The user can refresh to resume.
const MAX_POLL_TICKS = 90;

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

  // Silent variant for polling: refresh in place without toggling `isLoading`
  // or clobbering `error` on a transient flake (keep the last good payload).
  const pollSaved = useCallback(async () => {
    if (!savedQuestionId) return;
    try {
      const data = await apiFetch<SavedQuestionDetail>(
        `/api/v1/saved-questions/${savedQuestionId}`,
      );
      setSaved(data);
    } catch (err) {
      console.warn('[useSavedQuestionDetail] poll failed; keeping last state', err);
    }
  }, [apiFetch, savedQuestionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isReady && savedQuestionId) void fetchSaved();
    if (!savedQuestionId) setSaved(null);
  }, [isReady, savedQuestionId, fetchSaved]);

  // Poll while any attempt is still finalizing. The effect re-runs whenever
  // that condition changes, so it stops itself once every attempt is terminal.
  const hasPendingAttempt = (saved?.attempts ?? []).some(
    (a) => a.status === 'in_progress' || a.status === 'pending',
  );
  const tickRef = useRef(0);
  useEffect(() => {
    if (!savedQuestionId || !hasPendingAttempt) return;

    tickRef.current = 0;
    let cancelled = false;
    let timeoutId: number | null = null;

    const schedule = () => {
      timeoutId = window.setTimeout(async () => {
        if (cancelled) return;
        tickRef.current += 1;
        await pollSaved();
        if (!cancelled && tickRef.current < MAX_POLL_TICKS) schedule();
      }, POLL_INTERVAL_MS);
    };
    schedule();

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [savedQuestionId, hasPendingAttempt, pollSaved]);

  return { saved, isLoading, error, errorStatus, refetch: fetchSaved };
}
