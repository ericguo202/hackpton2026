/**
 * `useSessions` — fetches the caller's completed-session history.
 *
 * Lazy by default: hand back a `refetch` so the History page can refresh
 * after navigating from a freshly-finished session without a remount race.
 */

import { useCallback, useEffect, useState } from 'react';

import { useApi } from './useApi';
import type { SessionListItem } from '../types/history';

export function useSessions() {
  const { apiFetch, isReady } = useApi();
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SessionListItem[]>('/api/v1/sessions');
      setSessions(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  // Standard fetch-on-mount; matches the established pattern in `useMe`.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isReady) void fetchSessions();
  }, [isReady, fetchSessions]);

  return { sessions, isLoading, error, refetch: fetchSessions, isReady };
}
