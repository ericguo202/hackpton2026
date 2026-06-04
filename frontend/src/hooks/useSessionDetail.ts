/**
 * `useSessionDetail` — fetches one session's full payload (session + turns).
 *
 * Refetches when `sessionId` changes so the detail page can render multiple
 * sessions without a remount. Null id is a no-op so the page can mount
 * before the user has selected a session.
 *
 * Evaluation now finalizes in a background task (see backend
 * `_run_background_finalize`), so a session can be fetched while it's still
 * `in_progress` with null scores. This hook silently polls every ~2s until
 * the session reaches a terminal status, so SessionDetail self-heals from
 * "Scoring in progress" to real scores without a manual refresh — mirroring
 * Practice's Results polling. The poll's `GET` also drives the backend lazy
 * reaper, so opening a stuck session actively completes it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useApi } from './useApi';
import { ApiError } from '../lib/api';
import type { SessionDetail } from '../types/history';

const POLL_INTERVAL_MS = 2000;
// Stop polling after this many ticks (~3 min) so a genuinely stuck session
// doesn't poll forever on a tab left open. The user can refresh to resume.
const MAX_POLL_TICKS = 90;

export function useSessionDetail(sessionId: string | null) {
  const { apiFetch, isReady } = useApi();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // HTTP status when the failure is an ApiError. Lets the consumer distinguish
  // "session not found / invalid id" (4xx → redirect) from "backend flake"
  // (5xx → keep on page).
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSession = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    setError(null);
    setErrorStatus(null);
    try {
      const data = await apiFetch<SessionDetail>(
        `/api/v1/sessions/${sessionId}`,
      );
      setSession(data);
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError) setErrorStatus(err.status);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, sessionId]);

  // Silent variant for polling: refresh `session` in place without toggling
  // `isLoading` (no "Loading session…" flash) and without clobbering `error`
  // on a transient flake (keep the last good payload and keep polling).
  const pollSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await apiFetch<SessionDetail>(
        `/api/v1/sessions/${sessionId}`,
      );
      setSession(data);
    } catch (err) {
      console.warn('[useSessionDetail] poll failed; keeping last state', err);
    }
  }, [apiFetch, sessionId]);

  // Standard fetch-on-mount + clear-on-unset; matches the pattern in
  // `useMe`. Restructuring to avoid setState in the effect body would
  // require a sentinel ref dance with no real benefit at this scale.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isReady && sessionId) void fetchSession();
    if (!sessionId) setSession(null);
  }, [isReady, sessionId, fetchSession]);

  // Poll while the session hasn't reached a terminal status. The effect
  // re-runs whenever `status` changes, so it stops itself the moment the
  // background finalizer flips the session to `completed`.
  const status = session?.status;
  const tickRef = useRef(0);
  useEffect(() => {
    if (!sessionId) return;
    if (status !== 'in_progress' && status !== 'pending') return;

    tickRef.current = 0;
    let cancelled = false;
    let timeoutId: number | null = null;

    const schedule = () => {
      timeoutId = window.setTimeout(async () => {
        if (cancelled) return;
        tickRef.current += 1;
        await pollSession();
        if (!cancelled && tickRef.current < MAX_POLL_TICKS) schedule();
      }, POLL_INTERVAL_MS);
    };
    schedule();

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [sessionId, status, pollSession]);

  return { session, isLoading, error, errorStatus, refetch: fetchSession };
}
