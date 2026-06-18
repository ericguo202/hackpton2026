/**
 * `usePolledResource` — id-keyed fetch + background polling.
 *
 * Shared by `useSessionDetail` and `useSavedQuestionDetail`, which were
 * line-for-line identical apart from the URL, the payload type, and the
 * "is this still finalizing?" predicate.
 *
 * Fetches `path` when auth is ready and `path` is non-null (clears to null when
 * `path` goes null, so a page can mount before an id is selected). Exposes
 * `errorStatus` so the consumer can branch 4xx (not found / not owned →
 * redirect) vs 5xx (backend flake → stay put). While `isPending(data)` holds,
 * it silently polls every ~2s — refreshing in place without an `isLoading`
 * flash and without clobbering the last good payload on a transient error — so
 * the page self-heals from "Scoring in progress" to real scores without a
 * manual refresh. The poll's `GET` also drives the backend lazy reaper. Polling
 * stops itself once the resource is terminal or after MAX_POLL_TICKS (~3 min)
 * on a tab left open; the user can refresh to resume.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useApi } from './useApi';
import { ApiError } from '../lib/api';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_TICKS = 90;

export function usePolledResource<T>(
  path: string | null,
  isPending: (data: T) => boolean,
) {
  const { apiFetch, isReady } = useApi();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!path) return;
    setIsLoading(true);
    setError(null);
    setErrorStatus(null);
    try {
      setData(await apiFetch<T>(path));
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError) setErrorStatus(err.status);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, path]);

  // Silent variant for polling: refresh in place without toggling `isLoading`
  // or clobbering `error` on a transient flake (keep the last good payload).
  const poll = useCallback(async () => {
    if (!path) return;
    try {
      setData(await apiFetch<T>(path));
    } catch (err) {
      console.warn('[usePolledResource] poll failed; keeping last state', err);
    }
  }, [apiFetch, path]);

  // Fetch-on-mount + clear-on-unset; matches the pattern in `useMe`.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isReady && path) void refetch();
    if (!path) setData(null);
  }, [isReady, path, refetch]);

  // Poll while the resource hasn't reached a terminal state. The effect
  // depends only on the derived `pending` boolean, so `isPending`'s identity is
  // free to change every render; it re-runs (and stops itself) the moment
  // `pending` flips to false.
  const pending = data != null && isPending(data);
  const tickRef = useRef(0);
  useEffect(() => {
    if (!path || !pending) return;

    tickRef.current = 0;
    let cancelled = false;
    let timeoutId: number | null = null;

    const schedule = () => {
      timeoutId = window.setTimeout(async () => {
        if (cancelled) return;
        tickRef.current += 1;
        await poll();
        if (!cancelled && tickRef.current < MAX_POLL_TICKS) schedule();
      }, POLL_INTERVAL_MS);
    };
    schedule();

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [path, pending, poll]);

  return { data, isLoading, error, errorStatus, refetch };
}
