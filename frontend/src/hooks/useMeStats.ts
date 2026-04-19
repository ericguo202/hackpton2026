/**
 * `useMeStats` — rolling user-level aggregates across completed sessions.
 *
 * Powers the small stats strip on the History page (total sessions, all-time
 * average per dimension, total filler words). Cheap single-row response, so
 * we just fetch on mount with no caching layer.
 */

import { useCallback, useEffect, useState } from 'react';

import { useApi } from './useApi';
import type { MeStats } from '../types/history';

export function useMeStats() {
  const { apiFetch, isReady } = useApi();
  const [stats, setStats] = useState<MeStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<MeStats>('/api/v1/me/stats');
      setStats(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  // Standard fetch-on-mount; matches the established pattern in `useMe`.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isReady) void fetchStats();
  }, [isReady, fetchStats]);

  return { stats, isLoading, error, refetch: fetchStats };
}
