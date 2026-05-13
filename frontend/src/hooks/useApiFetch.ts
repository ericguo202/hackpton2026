/**
 * `useApiFetch<T>` — shared fetch-on-mount boilerplate for the hooks that
 * wrap single authenticated GET endpoints (`useMeStats`, `useSessions`,
 * `useSessionDetail`). Gates on `useApi().isReady` so the request doesn't
 * fire before Clerk rehydrates.
 *
 * Pass `skip: true` to suppress the fetch (e.g. while a parent-controlled
 * id is still null); the hook clears local data in that case so stale
 * state doesn't leak between selections.
 */

import { useCallback, useEffect, useState } from 'react';

import { useApi } from './useApi';

type Options = {
  /** When true, the fetch is skipped and any existing data is cleared. */
  skip?: boolean;
};

export function useApiFetch<T>(path: string | null, options: Options = {}) {
  const { skip = false } = options;
  const { apiFetch, isReady } = useApi();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!path) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiFetch<T>(path);
      setData(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, path]);

  useEffect(() => {
    if (!isReady) return;
    if (skip || !path) {
      setData(null);
      return;
    }
    void refetch();
  }, [isReady, skip, path, refetch]);

  return { data, isLoading, error, refetch, isReady };
}
