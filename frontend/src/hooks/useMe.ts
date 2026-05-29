/**
 * `useMe` — single source of truth for the signed-in user row.
 *
 * `App.tsx` uses it to gate onboarding vs. dashboard. The OnboardingForm
 * calls `refetch()` after submit so the gate flips without a page reload.
 * MePing also consumes it so we don't double-fetch /me.
 */

import { useCallback, useEffect, useState } from 'react';

import { useApi } from './useApi';
import type { MeResponse } from '../types/user';

export function useMe() {
  const { apiFetch, isReady } = useApi();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchMe = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<MeResponse>('/api/v1/me');
      setMe(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  // Fetch-on-mount once Clerk is ready. `fetchMe` flips loading/error state
  // synchronously before its first await, which the set-state-in-effect rule
  // flags — but this is the canonical "load data on mount" effect, not a
  // prop-derived state sync, so the synchronous writes are intentional.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isReady) void fetchMe();
  }, [isReady, fetchMe]);

  return { me, isLoading, error, refetch: fetchMe, isReady };
}
