/**
 * `useFetch` — shared fetch-on-ready boilerplate for read-only endpoints.
 *
 * Owns the loading/error/refetch trio gated on `useApi().isReady`: fetch once
 * when auth becomes ready, expose `refetch` so a page can refresh in place.
 * The simple list/aggregate hooks (`useSessions`, `useMeStats`,
 * `useSavedQuestions`) wrap this and re-label `data` to a domain name. The
 * detail pages that also poll use `usePolledResource` instead.
 */

import { useCallback, useEffect, useState } from 'react';

import { useApi } from './useApi';

export function useFetch<T>(path: string) {
  const { apiFetch, isReady } = useApi();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await apiFetch<T>(path));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, path]);

  // Standard fetch-on-mount; matches the established pattern in `useMe`.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isReady) void refetch();
  }, [isReady, refetch]);

  return { data, isLoading, error, refetch, isReady };
}
