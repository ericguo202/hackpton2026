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

  useEffect(() => {
    if (isReady) void fetchMe();
  }, [isReady, fetchMe]);

  return { me, isLoading, error, refetch: fetchMe, isReady };
}
