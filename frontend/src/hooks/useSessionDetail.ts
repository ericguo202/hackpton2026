/**
 * `useSessionDetail` — fetches one session's full payload (session + turns).
 *
 * Refetches when `sessionId` changes so the detail page can render multiple
 * sessions without a remount. Null id is a no-op so the page can mount
 * before the user has selected a session.
 */

import { useCallback, useEffect, useState } from 'react';

import { useApi } from './useApi';
import type { SessionDetail } from '../types/history';

export function useSessionDetail(sessionId: string | null) {
  const { apiFetch, isReady } = useApi();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSession = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SessionDetail>(
        `/api/v1/sessions/${sessionId}`,
      );
      setSession(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
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

  return { session, isLoading, error, refetch: fetchSession };
}
